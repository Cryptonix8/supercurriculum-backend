import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProgressService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get student's overall progress
   */
  async getProgress(userId: string) {
    const studentBands = await this.prisma.studentBand.findMany({
      where: { userId },
      include: {
        subject: true,
        skill: true,
      },
    });

    const studentProfile = await this.prisma.studentProfile.findUnique({
      where: { userId },
      select: { yearGroupId: true },
    });

    let totalChapters = 0;
    let completedChapters = 0;

    if (studentProfile?.yearGroupId) {
      const curriculumTopics = await this.prisma.curriculumTopic.findMany({
        where: { yearGroupId: studentProfile.yearGroupId },
        select: { subjectId: true },
      });

      totalChapters = curriculumTopics.length;

      if (totalChapters > 0) {
        const topicsPerSubject = new Map<string, number>();
        for (const topic of curriculumTopics) {
          topicsPerSubject.set(topic.subjectId, (topicsPerSubject.get(topic.subjectId) || 0) + 1);
        }

        const subjectIds = Array.from(topicsPerSubject.keys());
        const masteryBySubject = await this.prisma.skillMastery.groupBy({
          by: ['subjectId'],
          where: {
            userId,
            subjectId: { in: subjectIds },
          },
          _avg: {
            masteryPercentage: true,
          },
        });

        completedChapters = masteryBySubject.reduce((sum, row) => {
          const chapterCount = topicsPerSubject.get(row.subjectId) || 0;
          const masteryPct = row._avg.masteryPercentage ?? 0;
          const estimatedCompleted = Math.floor((chapterCount * masteryPct) / 100);
          return sum + Math.max(0, Math.min(chapterCount, estimatedCompleted));
        }, 0);
      }
    }

    // Keep legacy field names for frontend compatibility while using chapter-based data.
    const totalTasks = totalChapters;
    const completedTasks = completedChapters;

    const badges = await this.prisma.userBadge.count({
      where: { userId },
    });

    const gamification = await this.prisma.userGamification.upsert({
      where: { userId },
      create: {
        userId,
        xp: 0,
        level: 1,
        studyStreak: 0,
      },
      update: {},
    });

    const recentAchievements = await this.prisma.userBadge.findMany({
      where: { userId },
      include: { badge: true },
      orderBy: { earnedAt: 'desc' },
      take: 8,
    });

    const skillProgress = await this.prisma.skillMastery.findMany({
      where: { userId },
      select: {
        subjectId: true,
        skillId: true,
        masteryPercentage: true,
        masteryLevel: true,
        lastPracticed: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    const freezeAvailable = !gamification.freezeUsedAt
      || (Date.now() - gamification.freezeUsedAt.getTime()) / (1000 * 60 * 60 * 24) >= 7;

    return {
      bands: studentBands,
      totalTasks,
      completedTasks,
      completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
      totalChapters,
      completedChapters,
      chapterCompletionRate: totalChapters > 0 ? (completedChapters / totalChapters) * 100 : 0,
      badges,
      xp: gamification.xp,
      level: gamification.level,
      studyStreak: gamification.studyStreak,
      freezeAvailable,
      recentAchievements,
      skillProgress,
    };
  }
}

