import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { BadgesService } from '../badges/badges.service';

@Injectable()
export class ChallengesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamificationService: GamificationService,
    private readonly badgesService: BadgesService,
  ) {}

  async createChallenge(
    createdById: string,
    data: {
      title: string;
      description: string;
      subjectId?: string;
      skillId?: string;
      scope?: 'PERSONAL' | 'CLASSROOM';
      targetCount?: number;
      xpReward?: number;
      startDate?: string;
      endDate?: string;
    },
  ) {
    return (this.prisma as any).learningChallenge.create({
      data: {
        title: data.title,
        description: data.description,
        createdById,
        subjectId: data.subjectId,
        skillId: data.skillId,
        scope: (data.scope as any) || 'PERSONAL',
        targetCount: data.targetCount || 1,
        xpReward: data.xpReward || 30,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      },
    });
  }

  async getChallenges(createdById?: string, activeOnly = false) {
    return (this.prisma as any).learningChallenge.findMany({
      where: {
        ...(createdById ? { createdById } : {}),
        ...(activeOnly ? { isActive: true } : {}),
      },
      include: {
        subject: true,
        skill: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async assignChallenge(
    challengeId: string,
    assignedById: string,
    studentIds: string[],
    metadata?: Record<string, unknown>,
  ) {
    const challenge = await (this.prisma as any).learningChallenge.findUnique({
      where: { id: challengeId },
    });
    if (!challenge || !challenge.isActive) {
      throw new NotFoundException('Challenge not found or inactive');
    }

    const assignments = await Promise.all(
      studentIds.map((studentId) =>
        (this.prisma as any).challengeAssignment.upsert({
          where: {
            challengeId_studentId: {
              challengeId,
              studentId,
            },
          },
          create: {
            challengeId,
            studentId,
            assignedById,
            metadata: (metadata ?? {}) as any,
          },
          update: {
            assignedById,
            metadata: (metadata ?? {}) as any,
            status: 'ASSIGNED',
          },
        }),
      ),
    );

    return {
      challengeId,
      assignedCount: assignments.length,
      assignments,
    };
  }

  async getMyChallenges(studentId: string) {
    return (this.prisma as any).challengeAssignment.findMany({
      where: { studentId },
      include: {
        challenge: {
          include: {
            subject: true,
            skill: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateMyChallengeProgress(
    studentId: string,
    assignmentId: string,
    data: {
      status?: 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';
      progress?: number;
      source?: 'MANUAL' | 'SYSTEM_EVENT';
    },
  ) {
    const existing = await (this.prisma as any).challengeAssignment.findFirst({
      where: {
        id: assignmentId,
        studentId,
      },
      include: {
        challenge: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Challenge assignment not found');
    }

    const nextStatus = (data.status as any) || existing.status;
    const nextProgress = typeof data.progress === 'number' ? data.progress : existing.progress;
    const isCompletingNow = existing.status !== 'COMPLETED' && nextStatus === 'COMPLETED';

    const updated = await (this.prisma as any).challengeAssignment.update({
      where: { id: assignmentId },
      data: {
        status: nextStatus,
        progress: nextProgress,
        completedAt: isCompletingNow ? new Date() : existing.completedAt,
      },
      include: {
        challenge: true,
      },
    });

    if (isCompletingNow && data.source === 'SYSTEM_EVENT') {
      const scopeKey = `challenge-assignment:${assignmentId}:completed`;
      const onCooldown = await this.gamificationService.isOnCooldown(
        studentId,
        'CHALLENGE_COMPLETED',
        scopeKey,
        365 * 24 * 60 * 60 * 1000,
      );

      if (!onCooldown) {
        await this.gamificationService.awardXp(
          studentId,
          updated.challenge.xpReward,
          'CHALLENGE_COMPLETED',
          {
            applyStudyDay: true,
            metadata: {
              scopeKey,
              challengeId: updated.challengeId,
              assignmentId,
              source: 'challenges.updateMyChallengeProgress',
            },
          },
        );
      }

      await this.badgesService.checkAndAwardBadges(studentId);
    }

    return updated;
  }

  async getTeacherChallengeOverview(teacherId: string) {
    return (this.prisma as any).challengeAssignment.findMany({
      where: {
        assignedById: teacherId,
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        challenge: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
}

