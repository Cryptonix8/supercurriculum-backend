import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SkillMasteryService } from '../skill-mastery/skill-mastery.service';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { GamificationService } from '../gamification/gamification.service';
import { getXpForExerciseCompletion } from '../gamification/gamification.rules';
import { BadgesService } from '../badges/badges.service';

@Injectable()
export class AiTutorService {
  private openai: OpenAI;

  constructor(
    private prisma: PrismaService,
    private skillMastery: SkillMasteryService,
    private config: ConfigService,
    private gamificationService: GamificationService,
    private badgesService: BadgesService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  /**
   * Generate a personalized learning session for a student
   */
  async generateSession(params: {
    userId: string;
    subjectId?: string;
    duration?: number; // minutes
  }) {
    const { userId, subjectId, duration } = params;

    // Get student profile
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        yearGroup: true,
      },
    });

    if (!profile) {
      throw new Error('Student profile not found');
    }

    // Determine session duration
    const sessionDuration = duration || (profile as any).preferredTaskDuration || 15;

    // Get student's mastery data
    const masteryData = await this.skillMastery.getSkillMastery(userId, subjectId);

    // Get skills needing intervention
    const interventionSkills = await this.skillMastery.getSkillsNeedingIntervention(userId);

    // Determine which subject to focus on
    const targetSubjectId = await this.determineSubject(
      userId,
      subjectId,
      profile,
      masteryData,
    );

    // Build session plan
    const sessionPlan = await this.buildSessionPlan({
      userId,
      profile,
      subjectId: targetSubjectId,
      duration: sessionDuration,
      masteryData,
      interventionSkills,
    });

    // Create learning session record
    const session = await (this.prisma as any).learningSession.create({
      data: {
        userId,
        subjectId: targetSubjectId,
        duration: sessionDuration,
        sessionPlan,
        status: 'active',
      },
      include: {
        sessionItems: true,
      },
    });

    return {
      sessionId: session.id,
      greeting: this.generateGreeting(profile),
      sessionPlan,
      estimatedDuration: sessionDuration,
    };
  }

  /**
   * Build a structured session plan
   */
  private async buildSessionPlan(params: {
    userId: string;
    profile: any;
    subjectId: string;
    duration: number;
    masteryData: any[];
    interventionSkills: any[];
  }) {
    const { profile, subjectId, duration, masteryData, interventionSkills } = params;

    // Calculate item counts based on duration
    const reviewCount = Math.min(Math.floor(duration / 5), 4); // 3-4 review questions
    const mainCount = Math.max(Math.floor(duration / 3), 4); // 4-6 main exercises
    const reflectionCount = duration >= 15 ? 2 : 1; // 1-2 reflection questions

    // Get subject skills
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
      include: {
        skills: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!subject) {
      throw new Error('Subject not found');
    }

    // Select skills for review (previously practiced)
    const reviewSkills = masteryData
      .filter((m) => m.subjectId === subjectId && m.lastPracticed)
      .sort((a, b) => new Date(a.lastPracticed).getTime() - new Date(b.lastPracticed).getTime())
      .slice(0, reviewCount);

    // Select main skill (lowest mastery in this subject)
    const mainSkill =
      interventionSkills.find((s) => s.subjectId === subjectId) ||
      masteryData.find((m) => m.subjectId === subjectId) ||
      subject.skills[0];

    const sessionPlan = {
      subject: {
        id: subject.id,
        name: subject.displayName,
      },
      structure: {
        reviewQuestions: reviewCount,
        newConcept: 1,
        mainExercises: mainCount,
        reflectionQuestions: reflectionCount,
      },
      reviewItems: reviewSkills.map((skill) => ({
        skillId: skill.skillId,
        skillName: skill.skill.displayName,
        type: 'retrieval_practice',
        difficulty: this.getDifficultyFromMastery(skill.masteryLevel),
      })),
      mainFocus: {
        skillId: mainSkill.skillId || mainSkill.id,
        skillName: mainSkill.skill?.displayName || mainSkill.displayName,
        currentMastery: mainSkill.masteryPercentage || 0,
        needsIntervention: mainSkill.masteryPercentage < 50,
      },
      adaptiveSettings: {
        startDifficulty: profile.preferredChallengeLevel || 'MEDIUM',
        allowDifficultyIncrease: true,
        interventionThreshold: 3, // Trigger intervention after 3 consecutive errors
      },
    };

    return sessionPlan;
  }

  /**
   * Determine which subject to focus on
   */
  private async determineSubject(
    userId: string,
    requestedSubjectId: string | undefined,
    profile: any,
    masteryData: any[],
  ): Promise<string> {
    // If subject requested, use it
    if (requestedSubjectId) {
      return requestedSubjectId;
    }

    // If student has preferred subjects, pick from those
    if (profile.preferredSubjects && profile.preferredSubjects.length > 0) {
      // Find the preferred subject with lowest average mastery
      const preferredMastery = masteryData
        .filter((m) => (profile as any).preferredSubjects.includes(m.subjectId))
        .reduce((acc, m) => {
          if (!acc[m.subjectId]) {
            acc[m.subjectId] = { total: 0, count: 0 };
          }
          acc[m.subjectId].total += m.masteryPercentage;
          acc[m.subjectId].count++;
          return acc;
        }, {} as Record<string, { total: number; count: number }>);

      const lowestPreferred = Object.entries(preferredMastery)
        .map(([id, data]) => ({ id, avg: (data as any).total / (data as any).count }))
        .sort((a, b) => a.avg - b.avg)[0];

      if (lowestPreferred) {
        return lowestPreferred.id;
      }
    }

    // Otherwise, pick subject with lowest overall mastery
    if (masteryData.length > 0) {
      const bySubject = masteryData.reduce((acc, m) => {
        if (!acc[m.subjectId]) {
          acc[m.subjectId] = { total: 0, count: 0 };
        }
        acc[m.subjectId].total += m.masteryPercentage;
        acc[m.subjectId].count++;
        return acc;
      }, {} as Record<string, { total: number; count: number }>);

      const lowest = Object.entries(bySubject)
        .map(([id, data]) => ({ id, avg: (data as any).total / (data as any).count }))
        .sort((a, b) => a.avg - b.avg)[0];

      return lowest.id;
    }

    // Fallback: get first available subject for year group
    const firstSubject = await this.prisma.subject.findFirst({
      where: { yearGroupId: profile.yearGroupId },
      orderBy: { orderIndex: 'asc' },
    });

    return firstSubject?.id || '';
  }

  /**
   * Generate a personalized greeting
   */
  private generateGreeting(profile: any): string {
    const name = profile.nickname || profile.user.firstName;
    const timeOfDay = this.getTimeOfDay();

    const greetings = [
      `Good ${timeOfDay}, ${name}! Ready to learn something new today?`,
      `Hi ${name}! Let's make today a great learning day!`,
      `Hello ${name}! I've prepared an exciting session for you.`,
      `Hey ${name}! Ready to boost your skills?`,
    ];

    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  /**
   * Get time of day
   */
  private getTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  }

  /**
   * Map mastery level to difficulty
   */
  private getDifficultyFromMastery(masteryLevel: string): string {
    switch (masteryLevel) {
      case 'MASTERY':
        return 'extension';
      case 'SECURE':
        return 'medium';
      case 'DEVELOPING':
        return 'easy';
      default:
        return 'warmup';
    }
  }

  /**
   * Complete a learning session
   */
  async completeSession(sessionId: string) {
    const session = await (this.prisma as any).learningSession.update({
      where: { id: sessionId },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
      include: {
        sessionItems: true,
      },
    });

    // Calculate session statistics
    const stats = this.calculateSessionStats(session);

    const hintsUsed = (session.sessionItems || []).reduce((sum: number, item: any) => {
      const hints = item?.hintsGiven as any;
      if (!hints) return sum;
      if (Array.isArray(hints?.hints)) return sum + hints.hints.length;
      if (typeof hints?.count === 'number') return sum + hints.count;
      return sum;
    }, 0);

    const exerciseScope = `learning-session:${sessionId}:complete`;
    const onCooldown = await this.gamificationService.isOnCooldown(
      session.userId,
      'EXERCISE_COMPLETED',
      exerciseScope,
      365 * 24 * 60 * 60 * 1000,
    );
    if (!onCooldown) {
      await this.gamificationService.awardXp(
        session.userId,
        getXpForExerciseCompletion({
          usedFullSolution: false,
          hintsUsed,
        }),
        hintsUsed > 0 ? 'HINT_BASED_COMPLETION' : 'EXERCISE_COMPLETED',
        {
          applyStudyDay: true,
          metadata: {
            scopeKey: exerciseScope,
            sessionId,
            hintsUsed,
            accuracy: stats.accuracy,
            source: 'ai-tutor.completeSession',
          },
        },
      );
    }

    await this.badgesService.checkAndAwardBadges(session.userId);

    // Generate summary
    const summary = await this.generateSessionSummary(session, stats);

    return {
      session,
      stats,
      summary,
    };
  }

  /**
   * Calculate session statistics
   */
  private calculateSessionStats(session: any) {
    const items = session.sessionItems || [];
    const answered = items.filter((i: any) => i.studentAnswer !== null);
    const correct = items.filter((i: any) => i.isCorrect === true);

    return {
      totalItems: items.length,
      answeredItems: answered.length,
      correctAnswers: correct.length,
      accuracy: answered.length > 0 ? (correct.length / answered.length) * 100 : 0,
      totalTimeSpent: items.reduce((sum: number, i: any) => sum + (i.timeSpent || 0), 0),
    };
  }

  /**
   * Generate session summary
   */
  private async generateSessionSummary(session: any, stats: any) {
    const improvements = [];
    const nextSteps = [];

    if (stats.accuracy >= 80) {
      improvements.push('You showed strong understanding today!');
      nextSteps.push('Ready to try more challenging exercises?');
    } else if (stats.accuracy >= 60) {
      improvements.push('You made good progress today!');
      nextSteps.push("Let's practice this a bit more to build confidence.");
    } else {
      improvements.push('You gave it a good try!');
      nextSteps.push("Let's review the key concepts together.");
    }

    return {
      improvements,
      nextSteps,
      encouragement: 'Keep up the great work! Every practice session makes you stronger.',
    };
  }

  /**
   * Record session item answer
   */
  async recordAnswer(params: {
    sessionId: string;
    itemId: string;
    answer: string;
    isCorrect: boolean;
    hintsUsed: number;
    timeSpent: number;
  }) {
    const { sessionId, itemId, answer, isCorrect, hintsUsed, timeSpent } = params;

    // Update session item
    const item = await (this.prisma as any).sessionItem.update({
      where: { id: itemId },
      data: {
        studentAnswer: answer,
        isCorrect,
        hintsGiven: hintsUsed > 0 ? { count: hintsUsed } : null,
        timeSpent,
        attemptedAt: new Date(),
      },
    });

    // Update skill mastery if skill is linked
    if (item.skillId) {
      const session = await (this.prisma as any).learningSession.findUnique({
        where: { id: sessionId },
        select: { userId: true, subjectId: true },
      });

      if (session && session.subjectId) {
        await this.skillMastery.updateSkillMastery({
          userId: session.userId,
          subjectId: session.subjectId,
          skillId: item.skillId,
          isCorrect,
          hintsUsed,
        });
      }
    }

    return item;
  }
}

