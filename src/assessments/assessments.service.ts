import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitAssessmentDto } from './dto/submit-assessment.dto';
import { Band } from '@prisma/client';

@Injectable()
export class AssessmentsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Submit assessment answers and calculate band
   * 
   * Logic:
   * 1. Student submits answers (1-5 for each question)
   * 2. Calculate average score
   * 3. Assign band: 1-2 = NEEDS_SUPPORT, 3 = DEVELOPING, 4-5 = SECURE
   * 4. Update StudentBand table
   * 5. Trigger weekly plan regeneration (future enhancement)
   */
  async submitAssessment(submitAssessmentDto: SubmitAssessmentDto) {
    const { userId, testId, answers } = submitAssessmentDto;

    // Verify test exists
    const test = await this.prisma.feedbackTest.findUnique({
      where: { id: testId },
      include: {
        questions: true,
        subject: true,
        skill: true,
      },
    });

    if (!test) {
      throw new NotFoundException('Feedback test not found');
    }

    // Verify all questions are answered
    if (answers.length !== test.questions.length) {
      throw new BadRequestException(
        `Expected ${test.questions.length} answers, received ${answers.length}`,
      );
    }

    // Verify all question IDs are valid
    const questionIds = test.questions.map(q => q.id);
    const invalidAnswers = answers.filter(a => !questionIds.includes(a.questionId));
    if (invalidAnswers.length > 0) {
      throw new BadRequestException('Invalid question IDs in answers');
    }

    // Verify all scores are 1-5
    const invalidScores = answers.filter(a => a.score < 1 || a.score > 5);
    if (invalidScores.length > 0) {
      throw new BadRequestException('All scores must be between 1 and 5');
    }

    // Calculate total score (average)
    const totalScore = answers.reduce((sum, a) => sum + a.score, 0) / answers.length;

    // Assign band based on score
    const band = this.calculateBand(totalScore);

    // Create assessment record
    const assessment = await this.prisma.assessment.create({
      data: {
        userId,
        testId,
        totalScore,
        band,
        answers: {
          create: answers.map(a => ({
            questionId: a.questionId,
            score: a.score,
          })),
        },
      },
      include: {
        test: {
          include: {
            subject: true,
            skill: true,
          },
        },
        answers: {
          include: {
            question: true,
          },
        },
      },
    });

    // Update or create StudentBand record
    await this.updateStudentBand(
      userId,
      test.subjectId,
      test.skillId,
      band,
      assessment.id,
    );

    // Create skill performance record with error tagging
    await this.createSkillPerformance(assessment.id, test.skillId, answers, totalScore);

    return {
      assessment,
      message: 'Assessment submitted successfully',
      band,
      totalScore,
      skillPerformance: this.analyzeSkillPerformance(totalScore),
    };
  }

  /**
   * Calculate band from average score
   */
  private calculateBand(averageScore: number): Band {
    if (averageScore < 2.5) {
      return Band.NEEDS_SUPPORT;
    } else if (averageScore < 3.5) {
      return Band.DEVELOPING;
    } else {
      return Band.SECURE;
    }
  }

  /**
   * Update or create student band record
   */
  private async updateStudentBand(
    userId: string,
    subjectId: string,
    skillId: string,
    band: Band,
    assessmentId: string,
  ) {
    const existingBand = await this.prisma.studentBand.findUnique({
      where: {
        userId_subjectId_skillId: {
          userId,
          subjectId,
          skillId,
        },
      },
    });

    if (existingBand) {
      return this.prisma.studentBand.update({
        where: {
          userId_subjectId_skillId: {
            userId,
            subjectId,
            skillId,
          },
        },
        data: {
          currentBand: band,
          lastAssessmentId: assessmentId,
          lastUpdated: new Date(),
        },
      });
    } else {
      return this.prisma.studentBand.create({
        data: {
          userId,
          subjectId,
          skillId,
          currentBand: band,
          lastAssessmentId: assessmentId,
          lastUpdated: new Date(),
        },
      });
    }
  }

  /**
   * Get student's assessment history
   */
  async getAssessmentHistory(userId: string, subjectId?: string) {
    return this.prisma.assessment.findMany({
      where: {
        userId,
        test: subjectId ? { subjectId } : undefined,
      },
      include: {
        test: {
          include: {
            subject: true,
            skill: true,
          },
        },
        answers: {
          include: {
            question: true,
          },
          orderBy: {
            question: {
              orderIndex: 'asc',
            },
          },
        },
      },
      orderBy: { completedAt: 'desc' },
    });
  }

  /**
   * Get specific assessment by ID
   */
  async getAssessment(id: string, userId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: {
        id,
        userId, // Ensure student can only access their own assessments
      },
      include: {
        test: {
          include: {
            subject: true,
            skill: true,
            questions: {
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
        answers: {
          include: {
            question: true,
          },
        },
      },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    return assessment;
  }

  /**
   * Get student's current bands
   */
  async getStudentBands(userId: string) {
    return this.prisma.studentBand.findMany({
      where: { userId },
      include: {
        subject: true,
        skill: true,
        lastAssessment: true,
      },
      orderBy: [
        { subject: { orderIndex: 'asc' } },
        { skill: { orderIndex: 'asc' } },
      ],
    });
  }

  /**
   * Create diagnostic skill performance record
   */
  private async createSkillPerformance(
    assessmentId: string,
    skillId: string,
    answers: any[],
    totalScore: number,
  ) {
    // Calculate percentage score
    const percentageScore = (totalScore / 5) * 100;

    // Determine performance level
    let performanceLevel;
    if (percentageScore >= 80) {
      performanceLevel = 'STRONG';
    } else if (percentageScore >= 50) {
      performanceLevel = 'OK';
    } else {
      performanceLevel = 'NEEDS_SUPPORT';
    }

    // Analyze errors and tag them
    const errorTags = this.analyzeErrors(answers);

    // Create the performance record
    return this.prisma.diagnosticSkillPerformance.create({
      data: {
        assessmentId,
        skillId,
        score: percentageScore,
        performance: performanceLevel,
        errorTags,
      },
    });
  }

  /**
   * Analyze errors and generate tags
   */
  private analyzeErrors(answers: any[]): string[] {
    const tags: string[] = [];
    const lowScores = answers.filter((a) => a.score <= 2);

    if (lowScores.length === 0) {
      return tags;
    }

    // Basic error patterns
    if (lowScores.length >= answers.length / 2) {
      tags.push('multiple_gaps');
    }

    if (lowScores.length === answers.length) {
      tags.push('foundational_difficulty');
    }

    if (lowScores.length <= 2) {
      tags.push('specific_gaps');
    }

    // Consistency check
    const scores = answers.map((a) => a.score);
    const variance = this.calculateVariance(scores);
    if (variance > 2) {
      tags.push('inconsistent_performance');
    }

    return tags;
  }

  /**
   * Calculate variance in scores
   */
  private calculateVariance(scores: number[]): number {
    const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const squareDiffs = scores.map((s) => Math.pow(s - mean, 2));
    return squareDiffs.reduce((sum, d) => sum + d, 0) / scores.length;
  }

  /**
   * Analyze skill performance and provide label
   */
  private analyzeSkillPerformance(averageScore: number) {
    const percentage = (averageScore / 5) * 100;

    if (percentage >= 80) {
      return {
        level: 'STRONG',
        message: 'Excellent understanding! Ready for more challenging work.',
      };
    } else if (percentage >= 50) {
      return {
        level: 'OK',
        message: 'Good progress. Continue practicing to strengthen skills.',
      };
    } else {
      return {
        level: 'NEEDS_SUPPORT',
        message: 'This area needs more practice. Interventions recommended.',
      };
    }
  }

  /**
   * Get assessment statistics for a student
   */
  async getAssessmentStats(userId: string) {
    const assessments = await this.prisma.assessment.findMany({
      where: { userId },
      include: {
        test: {
          include: {
            subject: true,
          },
        },
      },
    });

    const totalAssessments = assessments.length;
    const averageScore = totalAssessments > 0
      ? assessments.reduce((sum, a) => sum + a.totalScore, 0) / totalAssessments
      : 0;

    const bandCounts = {
      needsSupport: assessments.filter(a => a.band === Band.NEEDS_SUPPORT).length,
      developing: assessments.filter(a => a.band === Band.DEVELOPING).length,
      secure: assessments.filter(a => a.band === Band.SECURE).length,
    };

    const subjectScores = assessments.reduce((acc, assessment) => {
      const subjectName = assessment.test.subject.displayName;
      if (!acc[subjectName]) {
        acc[subjectName] = {
          totalScore: 0,
          count: 0,
        };
      }
      acc[subjectName].totalScore += assessment.totalScore;
      acc[subjectName].count += 1;
      return acc;
    }, {} as Record<string, { totalScore: number; count: number }>);

    const averageBySubject = Object.entries(subjectScores).map(([subject, data]) => ({
      subject,
      averageScore: data.totalScore / data.count,
    }));

    return {
      totalAssessments,
      averageScore: Math.round(averageScore * 10) / 10,
      bandCounts,
      averageBySubject,
    };
  }
}
