import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MasteryLevel } from '@prisma/client';

@Injectable()
export class SkillMasteryService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get skill mastery for a user
   */
  async getSkillMastery(userId: string, subjectId?: string, skillId?: string) {
    const where: any = { userId };
    if (subjectId) where.subjectId = subjectId;
    if (skillId) where.skillId = skillId;

    return this.prisma.skillMastery.findMany({
      where,
      include: {
        subject: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
        skill: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
      },
      orderBy: [
        { subject: { orderIndex: 'asc' } },
        { skill: { orderIndex: 'asc' } },
      ],
    });
  }

  /**
   * Update skill mastery based on student performance
   */
  async updateSkillMastery(params: {
    userId: string;
    subjectId: string;
    skillId: string;
    isCorrect: boolean;
    hintsUsed?: number;
  }) {
    const { userId, subjectId, skillId, isCorrect, hintsUsed = 0 } = params;

    // Find or create skill mastery record
    const existing = await this.prisma.skillMastery.findUnique({
      where: {
        userId_subjectId_skillId: { userId, subjectId, skillId },
      },
    });

    const totalAttempts = (existing?.totalAttempts || 0) + 1;
    const correctAttempts = (existing?.correctAttempts || 0) + (isCorrect ? 1 : 0);
    const totalHints = (existing?.hintsUsed || 0) + hintsUsed;

    // Calculate mastery percentage
    const masteryPercentage = this.calculateMasteryPercentage(
      correctAttempts,
      totalAttempts,
      totalHints,
    );

    // Determine mastery level
    const masteryLevel = this.getMasteryLevel(masteryPercentage);

    // Upsert the record
    return this.prisma.skillMastery.upsert({
      where: {
        userId_subjectId_skillId: { userId, subjectId, skillId },
      },
      update: {
        totalAttempts,
        correctAttempts,
        hintsUsed: totalHints,
        masteryPercentage,
        masteryLevel,
        lastPracticed: new Date(),
      },
      create: {
        userId,
        subjectId,
        skillId,
        totalAttempts,
        correctAttempts,
        hintsUsed: totalHints,
        masteryPercentage,
        masteryLevel,
        lastPracticed: new Date(),
      },
      include: {
        subject: { select: { displayName: true } },
        skill: { select: { displayName: true } },
      },
    });
  }

  /**
   * Calculate mastery percentage based on performance
   * Takes into account correctness and hint usage
   */
  private calculateMasteryPercentage(
    correctAttempts: number,
    totalAttempts: number,
    hintsUsed: number,
  ): number {
    if (totalAttempts === 0) return 0;

    // Base accuracy
    const accuracy = (correctAttempts / totalAttempts) * 100;

    // Penalty for excessive hint usage (each hint reduces score by up to 5%)
    const hintPenalty = Math.min((hintsUsed / totalAttempts) * 5, 20);

    // Calculate final mastery percentage
    const mastery = Math.max(0, Math.min(100, accuracy - hintPenalty));

    return Math.round(mastery * 10) / 10; // Round to 1 decimal place
  }

  /**
   * Determine mastery level from percentage
   */
  private getMasteryLevel(percentage: number): MasteryLevel {
    if (percentage >= 85) return 'MASTERY';
    if (percentage >= 70) return 'SECURE';
    if (percentage >= 50) return 'DEVELOPING';
    return 'BEGINNER';
  }

  /**
   * Get skills that need intervention (low mastery)
   */
  async getSkillsNeedingIntervention(userId: string, threshold: number = 50) {
    return this.prisma.skillMastery.findMany({
      where: {
        userId,
        masteryPercentage: { lt: threshold },
      },
      include: {
        subject: {
          select: {
            id: true,
            displayName: true,
          },
        },
        skill: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
      orderBy: {
        masteryPercentage: 'asc',
      },
    });
  }

  /**
   * Get mastery overview for a student
   */
  async getMasteryOverview(userId: string) {
    const masteryData = await this.prisma.skillMastery.findMany({
      where: { userId },
      include: {
        subject: {
          select: {
            id: true,
            displayName: true,
          },
        },
        skill: {
          select: {
            displayName: true,
          },
        },
      },
    });

    // Group by subject
    const bySubject: Record<string, any> = {};

    masteryData.forEach((m) => {
      const subjectKey = m.subject.id;
      if (!bySubject[subjectKey]) {
        bySubject[subjectKey] = {
          subjectId: m.subject.id,
          subjectName: m.subject.displayName,
          skills: [],
          averageMastery: 0,
          totalSkills: 0,
        };
      }

      bySubject[subjectKey].skills.push({
        skillName: m.skill.displayName,
        masteryLevel: m.masteryLevel,
        masteryPercentage: m.masteryPercentage,
        lastPracticed: m.lastPracticed,
      });

      bySubject[subjectKey].totalSkills++;
    });

    // Calculate averages
    Object.values(bySubject).forEach((subject: any) => {
      const total = subject.skills.reduce(
        (sum: number, skill: any) => sum + skill.masteryPercentage,
        0,
      );
      subject.averageMastery = Math.round((total / subject.skills.length) * 10) / 10;
    });

    return {
      subjects: Object.values(bySubject),
      overallStats: this.calculateOverallStats(masteryData),
    };
  }

  /**
   * Calculate overall statistics
   */
  private calculateOverallStats(masteryData: any[]) {
    if (masteryData.length === 0) {
      return {
        totalSkills: 0,
        averageMastery: 0,
        masteryCount: 0,
        secureCount: 0,
        developingCount: 0,
        beginnerCount: 0,
      };
    }

    const totalMastery = masteryData.reduce((sum, m) => sum + m.masteryPercentage, 0);

    return {
      totalSkills: masteryData.length,
      averageMastery: Math.round((totalMastery / masteryData.length) * 10) / 10,
      masteryCount: masteryData.filter((m) => m.masteryLevel === 'MASTERY').length,
      secureCount: masteryData.filter((m) => m.masteryLevel === 'SECURE').length,
      developingCount: masteryData.filter((m) => m.masteryLevel === 'DEVELOPING').length,
      beginnerCount: masteryData.filter((m) => m.masteryLevel === 'BEGINNER').length,
    };
  }
}

