import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GAMIFICATION_XP } from './gamification.rules';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_EVENT_LIMIT = 30;

type AwardXpOptions = {
  metadata?: Record<string, unknown>;
  applyStudyDay?: boolean;
};

@Injectable()
export class GamificationService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureProfile(userId: string) {
    return this.prisma.userGamification.upsert({
      where: { userId },
      create: {
        userId,
        xp: 0,
        level: 1,
        studyStreak: 0,
      },
      update: {},
    });
  }

  async getStudentGamification(userId: string) {
    const profile = await this.ensureProfile(userId);
    const events = await this.prisma.xpEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: DEFAULT_EVENT_LIMIT,
    });

    const levelStartXp = this.getXpForLevel(profile.level);
    const nextLevelXp = this.getXpForLevel(profile.level + 1);

    return {
      ...profile,
      freezeAvailable: this.isFreezeAvailable(profile.freezeUsedAt),
      levelProgress: {
        currentLevelXp: profile.xp - levelStartXp,
        requiredLevelXp: nextLevelXp - levelStartXp,
        nextLevel: profile.level + 1,
      },
      recentEvents: events,
    };
  }

  async getXpEvents(userId: string, limit = DEFAULT_EVENT_LIMIT) {
    return this.prisma.xpEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(limit, 100)),
    });
  }

  async awardXp(userId: string, amount: number, reason: any, options: AwardXpOptions = {}) {
    if (amount === 0) {
      return this.getStudentGamification(userId);
    }

    await this.ensureProfile(userId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.userGamification.findUnique({
        where: { userId },
      });

      const currentXp = current?.xp ?? 0;
      const nextXp = Math.max(0, currentXp + amount);
      const nextLevel = this.computeLevel(nextXp);

      await tx.xpEvent.create({
        data: {
          userId,
          amount,
          reason,
          metadata: (options.metadata ?? {}) as any,
        },
      });

      return tx.userGamification.update({
        where: { userId },
        data: {
          xp: nextXp,
          level: nextLevel,
        },
      });
    });

    if (options.applyStudyDay) {
      await this.markStudyDay(userId, new Date());
    }

    return updated;
  }

  async applyPenalty(userId: string, penaltyAmount: number, reason: any, metadata?: Record<string, unknown>) {
    const normalizedPenalty = penaltyAmount > 0 ? -penaltyAmount : penaltyAmount;
    return this.awardXp(userId, normalizedPenalty, reason, {
      metadata,
      applyStudyDay: false,
    });
  }

  async markStudyDay(userId: string, eventDate: Date) {
    const profile = await this.ensureProfile(userId);
    const today = this.toDay(eventDate);
    const lastDate = profile.lastStudyDate ? this.toDay(profile.lastStudyDate) : null;

    if (lastDate && today.getTime() === lastDate.getTime()) {
      return profile;
    }

    const daysDiff = lastDate
      ? Math.floor((today.getTime() - lastDate.getTime()) / ONE_DAY_MS)
      : null;

    let nextStreak = profile.studyStreak || 0;
    let nextFreezeUsedAt = profile.freezeUsedAt;

    if (!lastDate) {
      nextStreak = 1;
    } else if (daysDiff === 1) {
      nextStreak += 1;
    } else if (daysDiff === 2 && this.isFreezeAvailable(profile.freezeUsedAt)) {
      // One freeze per rolling week: preserve streak after one missed day.
      nextStreak += 1;
      nextFreezeUsedAt = today;
    } else {
      nextStreak = 1;
    }

    const updated = await this.prisma.userGamification.update({
      where: { userId },
      data: {
        studyStreak: nextStreak,
        lastStudyDate: today,
        freezeUsedAt: nextFreezeUsedAt,
      },
    });

    await this.awardXp(userId, GAMIFICATION_XP.DAILY_STREAK_BONUS, 'DAILY_STREAK_BONUS', {
      metadata: {
        studyDate: today.toISOString().slice(0, 10),
        streak: nextStreak,
      },
      applyStudyDay: false,
    });

    return updated;
  }

  async isOnCooldown(userId: string, reason: any, scopeKey: string, windowMs: number): Promise<boolean> {
    const since = new Date(Date.now() - windowMs);
    const recent = await this.prisma.xpEvent.findMany({
      where: {
        userId,
        reason,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return recent.some((event) => {
      const metadata = (event.metadata ?? {}) as Record<string, unknown>;
      return metadata.scopeKey === scopeKey;
    });
  }

  computeLevel(xp: number): number {
    return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
  }

  private getXpForLevel(level: number): number {
    const normalizedLevel = Math.max(1, level);
    return (normalizedLevel - 1) * (normalizedLevel - 1) * 100;
  }

  private isFreezeAvailable(freezeUsedAt?: Date | null): boolean {
    if (!freezeUsedAt) return true;
    const daysSinceUse = (Date.now() - freezeUsedAt.getTime()) / ONE_DAY_MS;
    return daysSinceUse >= 7;
  }

  private toDay(value: Date): Date {
    const day = new Date(value);
    day.setHours(0, 0, 0, 0);
    return day;
  }
}

