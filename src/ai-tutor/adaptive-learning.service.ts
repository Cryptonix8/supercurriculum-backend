import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { GamificationService } from '../gamification/gamification.service';
import { getXpForCorrection, getXpForTutorCheck } from '../gamification/gamification.rules';

@Injectable()
export class AdaptiveLearningService {
  private openai: OpenAI;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private gamificationService: GamificationService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  /**
   * Get session with items
   */
  async getSession(sessionId: string) {
    return (this.prisma as any).learningSession.findUnique({
      where: { id: sessionId },
      include: {
        sessionItems: {
          orderBy: { orderIndex: 'asc' },
        },
        interventionLogs: true,
      },
    });
  }

  /**
   * Process student answer and adapt difficulty
   */
  async processAnswer(params: {
    sessionId: string;
    itemId: string;
    answer: string;
    timeSpent: number;
  }) {
    const { sessionId, itemId, answer, timeSpent } = params;

    // Get the item and session
    const item = await (this.prisma as any).sessionItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw new Error('Session item not found');
    }

    const wasIncorrectBefore = item.isCorrect === false && !!item.studentAnswer;

    // Evaluate the answer
    const evaluation = await this.evaluateAnswer(item, answer);

    // Update the item with the answer
    await (this.prisma as any).sessionItem.update({
      where: { id: itemId },
      data: {
        studentAnswer: answer,
        isCorrect: evaluation.isCorrect,
        timeSpent,
        attemptedAt: new Date(),
      },
    });

    // Check if we need to adapt difficulty or trigger intervention
    const adaptation = await this.checkForAdaptation(sessionId, itemId, evaluation.isCorrect);

    const session = await (this.prisma as any).learningSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });

    if (session?.userId) {
      const checkScope = `session-item:${itemId}:check`;
      const checkOnCooldown = await this.gamificationService.isOnCooldown(
        session.userId,
        'TUTOR_CHECK_CORRECT',
        checkScope,
        365 * 24 * 60 * 60 * 1000,
      );

      const checkXp = getXpForTutorCheck({ isCorrect: evaluation.isCorrect });
      if (checkXp > 0 && !checkOnCooldown) {
        await this.gamificationService.awardXp(session.userId, checkXp, 'TUTOR_CHECK_CORRECT', {
          applyStudyDay: true,
          metadata: {
            scopeKey: checkScope,
            sessionId,
            itemId,
            source: 'ai-tutor.processAnswer',
          },
        });
      }

      const correctionXp = getXpForCorrection({
        correctedAfterFeedback: wasIncorrectBefore && evaluation.isCorrect,
      });
      const correctionScope = `session-item:${itemId}:correction`;
      if (correctionXp > 0) {
        const correctionOnCooldown = await this.gamificationService.isOnCooldown(
          session.userId,
          'MISTAKE_CORRECTED_AFTER_FEEDBACK',
          correctionScope,
          365 * 24 * 60 * 60 * 1000,
        );
        if (!correctionOnCooldown) {
          await this.gamificationService.awardXp(
            session.userId,
            correctionXp,
            'MISTAKE_CORRECTED_AFTER_FEEDBACK',
            {
              applyStudyDay: true,
              metadata: {
                scopeKey: correctionScope,
                sessionId,
                itemId,
                source: 'ai-tutor.processAnswer',
              },
            },
          );
        }
      }
    }

    return {
      evaluation,
      adaptation,
      feedback: this.generateImmediateFeedback(evaluation),
    };
  }

  /**
   * Evaluate if an answer is correct
   */
  private async evaluateAnswer(item: any, answer: string) {
    // For now, use simple comparison
    // In production, this could use AI for more nuanced evaluation
    const expectedAnswer = item.expectedAnswer?.toLowerCase() || '';
    const studentAnswer = answer.toLowerCase().trim();

    const isCorrect = expectedAnswer === studentAnswer;

    return {
      isCorrect,
      confidence: isCorrect ? 1.0 : 0.0,
      explanation: isCorrect
        ? 'Correct! Well done.'
        : "Not quite right. Let's review this together.",
    };
  }

  /**
   * Check if we need to adapt difficulty or trigger intervention
   */
  private async checkForAdaptation(
    sessionId: string,
    currentItemId: string,
    isCorrect: boolean,
  ) {
    // Get recent items in this session
    const recentItems = await (this.prisma as any).sessionItem.findMany({
      where: {
        sessionId,
        attemptedAt: { not: null },
      },
      orderBy: { attemptedAt: 'desc' },
      take: 5,
    });

    // Count consecutive errors in the same skill
    const currentItem = await (this.prisma as any).sessionItem.findUnique({
      where: { id: currentItemId },
    });

    if (!currentItem || !currentItem.skillId) {
      return { type: 'none' };
    }

    const skillErrors = recentItems.filter(
      (item) => item.skillId === currentItem.skillId && !item.isCorrect,
    );

    // Trigger intervention after 3 consecutive errors in same skill
    if (skillErrors.length >= 3) {
      await this.triggerIntervention(sessionId, currentItem.skillId);
      return {
        type: 'intervention',
        reason: 'Multiple errors detected in the same skill',
      };
    }

    // Increase difficulty after 3 consecutive correct answers
    const recentCorrect = recentItems.slice(0, 3).every((item) => item.isCorrect);
    if (recentCorrect && isCorrect) {
      return {
        type: 'increase_difficulty',
        reason: 'Strong performance detected',
      };
    }

    return { type: 'none' };
  }

  /**
   * Trigger an intervention
   */
  private async triggerIntervention(sessionId: string, skillId: string) {
    const session = await (this.prisma as any).learningSession.findUnique({
      where: { id: sessionId },
      select: { subjectId: true },
    });

    if (!session || !session.subjectId) {
      return;
    }

    // Get intervention guidance
    const intervention = await this.prisma.intervention.findUnique({
      where: {
        subjectId_skillId_band: {
          subjectId: session.subjectId,
          skillId,
          band: 'NEEDS_SUPPORT',
        },
      },
    });

    const interventionContent = {
      type: 'micro_lesson',
      explanation: intervention?.description || 'Let me help you understand this better.',
      workedExample: intervention?.taskGuidance || 'Here is how to approach this...',
      practiceQuestions: [
        {
          question: 'Practice question 1 (very easy)',
          difficulty: 'very_easy',
        },
        {
          question: 'Practice question 2 (very easy)',
          difficulty: 'very_easy',
        },
      ],
    };

    // Log the intervention
    await (this.prisma as any).interventionLog.create({
      data: {
        sessionId,
        skillId,
        reason: 'Multiple errors in same skill detected',
        interventionType: 'micro_lesson',
        content: interventionContent,
      },
    });

    return interventionContent;
  }

  /**
   * Provide hints at different levels
   */
  async provideHint(params: { sessionId: string; itemId: string; hintLevel: number }) {
    const { sessionId, itemId, hintLevel } = params;

    const item = await (this.prisma as any).sessionItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw new Error('Session item not found');
    }

    // Generate hint based on level
    const hint = await this.generateHint(item, hintLevel);

    // Update item with hint usage
    const currentHints = (item.hintsGiven as any) || { hints: [] };
    currentHints.hints.push({ level: hintLevel, hint, timestamp: new Date() });

    await (this.prisma as any).sessionItem.update({
      where: { id: itemId },
      data: {
        hintsGiven: currentHints,
      },
    });

    if (hintLevel >= 3) {
      const session = await (this.prisma as any).learningSession.findUnique({
        where: { id: sessionId },
        select: { userId: true },
      });
      if (session?.userId) {
        const scopeKey = `session-item:${itemId}:full-solution-penalty`;
        const onCooldown = await this.gamificationService.isOnCooldown(
          session.userId,
          'FINAL_ANSWER_ONLY_PENALTY',
          scopeKey,
          24 * 60 * 60 * 1000,
        );
        if (!onCooldown) {
          await this.gamificationService.applyPenalty(
            session.userId,
            8,
            'FINAL_ANSWER_ONLY_PENALTY',
            {
              scopeKey,
              sessionId,
              itemId,
              source: 'ai-tutor.provideHint',
            },
          );
        }
      }
    }

    return { hint, level: hintLevel };
  }

  /**
   * Generate a hint at the specified level
   */
  private async generateHint(item: any, level: number): Promise<string> {
    const question = item.question;
    const expectedAnswer = item.expectedAnswer;

    // Level 1: Light clue
    if (level === 1) {
      return `Think about the key concept in this question. What is being asked?`;
    }

    // Level 2: Clearer guidance
    if (level === 2) {
      return `Try breaking this down into steps. First, identify what you know, then think about what you need to find.`;
    }

    // Level 3: Full solution
    return `Here's how to solve this: ${expectedAnswer}\n\nMake sure you understand each step before moving on.`;
  }

  /**
   * Generate immediate feedback for an answer
   */
  private generateImmediateFeedback(evaluation: any) {
    if (evaluation.isCorrect) {
      const positiveResponses = [
        'Excellent work! 🎉',
        'That\'s correct! Well done!',
        'Perfect! You\'ve got it!',
        'Great job! Keep it up!',
      ];
      return {
        message: positiveResponses[Math.floor(Math.random() * positiveResponses.length)],
        explanation: evaluation.explanation,
        isCorrect: true,
      };
    } else {
      return {
        message: "Almost! Let's try together.",
        explanation: evaluation.explanation,
        isCorrect: false,
        encouragement: "Don't worry - mistakes help us learn!",
      };
    }
  }

  /**
   * Get session history for a user
   */
  async getSessionHistory(userId: string, limit: number = 10) {
    return (this.prisma as any).learningSession.findMany({
      where: { userId },
      include: {
        sessionItems: {
          select: {
            id: true,
            isCorrect: true,
            attemptedAt: true,
          },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }
}

