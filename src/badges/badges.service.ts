import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BadgesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get all available badges
   */
  async findAll() {
    return this.prisma.badge.findMany({
      where: { isActive: true },
      orderBy: [{ tier: 'asc' }, { points: 'asc' }],
    });
  }

  /**
   * Get user's earned badges
   */
  async getUserBadges(userId: string) {
    return this.prisma.userBadge.findMany({
      where: { userId },
      include: { badge: true },
      orderBy: { earnedAt: 'desc' },
    });
  }

  /**
   * Check and award badges based on criteria
   */
  async checkAndAwardBadges(userId: string) {
    const allBadges = await this.findAll();
    const userBadges = await this.getUserBadges(userId);
    const earnedBadgeIds = new Set(userBadges.map((ub) => ub.badgeId));

    const newlyEarned = [];

    for (const badge of allBadges) {
      // Skip already earned badges
      if (earnedBadgeIds.has(badge.id)) continue;

      // Check if criteria is met
      const meetsRiteria = await this.checkBadgeCriteria(userId, badge.criteria);

      if (meetsRiteria) {
        const userBadge = await this.prisma.userBadge.create({
          data: {
            userId,
            badgeId: badge.id,
            metadata: {
              awardedBy: 'system',
              criteriaChecked: badge.criteria,
            },
          },
          include: { badge: true },
        });

        newlyEarned.push(userBadge);
      }
    }

    return newlyEarned;
  }

  /**
   * Check if user meets badge criteria
   */
  private async checkBadgeCriteria(userId: string, criteria: any): Promise<boolean> {
    const criteriaObj = typeof criteria === 'string' ? JSON.parse(criteria) : criteria;
    const { type, count, subjectId, skillId, threshold } = criteriaObj;

    switch (type) {
      case 'sessions_completed':
        return this.checkSessionsCompleted(userId, count || 0);

      case 'streak_days':
        return this.checkStreakDays(userId, count || 0);

      case 'skill_mastery':
        return this.checkSkillMastery(userId, skillId || '', count || 0);

      case 'subject_mastery':
        return this.checkSubjectMastery(userId, subjectId || '', count || 0);

      case 'perfect_sessions':
        return this.checkPerfectSessions(userId, count || 0);

      case 'tasks_completed':
        return this.checkTasksCompleted(userId, count || 0);

      case 'exercises_completed_in_subject':
        return this.checkExercisesCompletedInSubject(userId, subjectId || '', count || 0);

      case 'without_full_solution_count':
        return this.checkWithoutFullSolutionCount(userId, count || 0);

      case 'accuracy_improvement_weekly':
        return this.checkAccuracyImprovementWeekly(userId, threshold || count || 5);

      case 'topic_mastery_threshold':
        return this.checkTopicMasteryThreshold(userId, skillId || '', threshold || count || 60);

      default:
        return false;
    }
  }

  private async checkTasksCompleted(userId: string, requiredCount: number): Promise<boolean> {
    const count = await this.prisma.plannedTask.count({
      where: {
        plan: { userId },
        status: 'COMPLETED',
      },
    });
    return count >= requiredCount;
  }

  private async checkExercisesCompletedInSubject(
    userId: string,
    subjectId: string,
    requiredCount: number,
  ): Promise<boolean> {
    const count = await this.prisma.plannedTask.count({
      where: {
        plan: { userId },
        status: 'COMPLETED',
        activity: {
          subjectId,
        },
      },
    });
    return count >= requiredCount;
  }

  private async checkWithoutFullSolutionCount(userId: string, requiredCount: number): Promise<boolean> {
    const items = await (this.prisma as any).sessionItem.findMany({
      where: {
        session: { userId },
        attemptedAt: { not: null },
      },
      select: {
        id: true,
        hintsGiven: true,
      },
    });

    let count = 0;
    for (const item of items) {
      const hints = (item.hintsGiven ?? null) as any;
      const hintEntries = Array.isArray(hints?.hints) ? hints.hints : [];
      const usedFullSolution = hintEntries.some((h: any) => Number(h?.level) >= 3);
      if (!usedFullSolution) {
        count += 1;
      }
      if (count >= requiredCount) return true;
    }

    return false;
  }

  private async checkAccuracyImprovementWeekly(userId: string, minImprovement: number): Promise<boolean> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const currentWeek = await (this.prisma as any).sessionItem.findMany({
      where: {
        session: { userId },
        attemptedAt: {
          gte: weekAgo,
          lt: now,
        },
        isCorrect: { not: null },
      },
      select: { isCorrect: true },
    });

    const previousWeek = await (this.prisma as any).sessionItem.findMany({
      where: {
        session: { userId },
        attemptedAt: {
          gte: twoWeeksAgo,
          lt: weekAgo,
        },
        isCorrect: { not: null },
      },
      select: { isCorrect: true },
    });

    if (currentWeek.length === 0 || previousWeek.length === 0) return false;

    const currentAccuracy = currentWeek.filter((i) => i.isCorrect).length / currentWeek.length;
    const previousAccuracy = previousWeek.filter((i) => i.isCorrect).length / previousWeek.length;

    return (currentAccuracy - previousAccuracy) * 100 >= minImprovement;
  }

  private async checkTopicMasteryThreshold(
    userId: string,
    skillId: string,
    threshold: number,
  ): Promise<boolean> {
    const mastery = await this.prisma.skillMastery.findFirst({
      where: {
        userId,
        skillId,
        masteryPercentage: { gte: threshold },
      },
    });
    return !!mastery;
  }

  /**
   * Check if user has completed required number of sessions
   */
  private async checkSessionsCompleted(userId: string, requiredCount: number): Promise<boolean> {
    const count = await (this.prisma as any).learningSession.count({
      where: {
        userId,
        status: 'completed',
      },
    });

    return count >= requiredCount;
  }

  /**
   * Check if user has a streak of consecutive days
   */
  private async checkStreakDays(userId: string, requiredDays: number): Promise<boolean> {
    const sessions = await (this.prisma as any).learningSession.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: 30, // Check last 30 days
    });

    if (sessions.length === 0) return false;

    // Get unique dates
    const dates = sessions.map((s) => s.startedAt.toISOString().split('T')[0]);
    const uniqueDates = [...new Set(dates)].sort().reverse();

    // Check for consecutive days
    let streak = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
      const current = new Date(uniqueDates[i] as string);
      const previous = new Date(uniqueDates[i - 1] as string);
      const diffDays = Math.floor(
        (previous.getTime() - current.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (diffDays === 1) {
        streak++;
        if (streak >= requiredDays) return true;
      } else {
        break;
      }
    }

    return streak >= requiredDays;
  }

  /**
   * Check if user has achieved mastery in a skill
   */
  private async checkSkillMastery(
    userId: string,
    skillId: string,
    requiredPercentage: number,
  ): Promise<boolean> {
    const mastery = await this.prisma.skillMastery.findFirst({
      where: {
        userId,
        skillId,
        masteryPercentage: { gte: requiredPercentage },
      },
    });

    return !!mastery;
  }

  /**
   * Check if user has achieved mastery in all skills of a subject
   */
  private async checkSubjectMastery(
    userId: string,
    subjectId: string,
    requiredPercentage: number,
  ): Promise<boolean> {
    const subjectSkills = await this.prisma.skill.count({
      where: { subjectId },
    });

    const masteredSkills = await this.prisma.skillMastery.count({
      where: {
        userId,
        subjectId,
        masteryPercentage: { gte: requiredPercentage },
      },
    });

    return masteredSkills === subjectSkills;
  }

  /**
   * Check if user has had perfect sessions (100% correct)
   */
  private async checkPerfectSessions(userId: string, requiredCount: number): Promise<boolean> {
    const sessions = await (this.prisma as any).learningSession.findMany({
      where: {
        userId,
        status: 'completed',
      },
      include: {
        sessionItems: true,
      },
    });

    let perfectCount = 0;

    for (const session of sessions) {
      const items = session.sessionItems.filter((i) => i.isCorrect !== null);
      const allCorrect = items.length > 0 && items.every((i) => i.isCorrect);

      if (allCorrect) {
        perfectCount++;
        if (perfectCount >= requiredCount) return true;
      }
    }

    return false;
  }

  /**
   * Get user's progress towards unearned badges
   */
  async getBadgeProgress(userId: string) {
    const allBadges = await this.findAll();
    const userBadges = await this.getUserBadges(userId);
    const earnedBadgeIds = new Set(userBadges.map((ub) => ub.badgeId));

    const progress = [];

    for (const badge of allBadges) {
      if (earnedBadgeIds.has(badge.id)) continue;

      const criteriaObj = typeof badge.criteria === 'string' 
        ? JSON.parse(badge.criteria) 
        : badge.criteria;

      const currentProgress = await this.getBadgeCurrentProgress(userId, criteriaObj);

      progress.push({
        badge,
        current: currentProgress.current,
        required: currentProgress.required,
        percentage: Math.min(100, (currentProgress.current / currentProgress.required) * 100),
      });
    }

    return progress;
  }

  /**
   * Get current progress towards a badge
   */
  private async getBadgeCurrentProgress(userId: string, criteria: any) {
    const { type, count, subjectId, skillId, threshold } = criteria;

    switch (type) {
      case 'sessions_completed': {
        const current = await (this.prisma as any).learningSession.count({
          where: { userId, status: 'completed' },
        });
        return { current, required: count };
      }

      case 'streak_days': {
        const sessions = await (this.prisma as any).learningSession.findMany({
          where: { userId },
          orderBy: { startedAt: 'desc' },
          take: 30,
        });

        const dates = sessions.map((s) => s.startedAt.toISOString().split('T')[0]);
        const uniqueDates = [...new Set(dates)].sort().reverse();

        let streak = uniqueDates.length > 0 ? 1 : 0;
        for (let i = 1; i < uniqueDates.length; i++) {
          const current = new Date(uniqueDates[i] as string);
          const previous = new Date(uniqueDates[i - 1] as string);
          const diffDays = Math.floor(
            (previous.getTime() - current.getTime()) / (1000 * 60 * 60 * 24),
          );

          if (diffDays === 1) {
            streak++;
          } else {
            break;
          }
        }

        return { current: streak, required: count };
      }

      case 'skill_mastery': {
        const mastery = await this.prisma.skillMastery.findFirst({
          where: { userId, skillId },
        });
        return { current: mastery?.masteryPercentage || 0, required: count };
      }

      case 'tasks_completed': {
        const current = await this.prisma.plannedTask.count({
          where: {
            plan: { userId },
            status: 'COMPLETED',
          },
        });
        return { current, required: count };
      }

      case 'exercises_completed_in_subject': {
        const current = await this.prisma.plannedTask.count({
          where: {
            plan: { userId },
            status: 'COMPLETED',
            activity: {
              subjectId,
            },
          },
        });
        return { current, required: count };
      }

      case 'without_full_solution_count': {
        const items = await (this.prisma as any).sessionItem.findMany({
          where: {
            session: { userId },
            attemptedAt: { not: null },
          },
          select: {
            hintsGiven: true,
          },
        });
        const current = items.filter((item) => {
          const hints = item.hintsGiven as any;
          const hintEntries = Array.isArray(hints?.hints) ? hints.hints : [];
          return !hintEntries.some((h: any) => Number(h?.level) >= 3);
        }).length;
        return { current, required: count };
      }

      case 'accuracy_improvement_weekly': {
        const achieved = await this.checkAccuracyImprovementWeekly(userId, threshold || count || 5);
        return { current: achieved ? 1 : 0, required: 1 };
      }

      case 'topic_mastery_threshold': {
        const mastery = await this.prisma.skillMastery.findFirst({
          where: { userId, skillId },
        });
        return {
          current: mastery?.masteryPercentage || 0,
          required: threshold || count || 60,
        };
      }

      default:
        return { current: 0, required: count || 1 };
    }
  }

  /**
   * Get user's total points from badges
   */
  async getUserPoints(userId: string) {
    const userBadges = await this.prisma.userBadge.findMany({
      where: { userId },
      include: { badge: true },
    });

    const totalPoints = userBadges.reduce((sum, ub) => sum + (ub.badge.points || 0), 0);

    return {
      totalPoints,
      badgeCount: userBadges.length,
      breakdown: {
        bronze: userBadges.filter((ub) => ub.badge.tier === 'BRONZE').length,
        silver: userBadges.filter((ub) => ub.badge.tier === 'SILVER').length,
        gold: userBadges.filter((ub) => ub.badge.tier === 'GOLD').length,
      },
    };
  }
}

