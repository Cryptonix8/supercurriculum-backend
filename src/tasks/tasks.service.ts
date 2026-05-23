import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { getXpForTaskCompletion } from '../gamification/gamification.rules';
import { BadgesService } from '../badges/badges.service';

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private gamificationService: GamificationService,
    private badgesService: BadgesService,
  ) {}

  /**
   * Update task status
   */
  async updateTaskStatus(taskId: string, status: string) {
    const updatedTask = await this.prisma.plannedTask.update({
      where: { id: taskId },
      data: {
        status: status as any,
        ...(status === 'IN_PROGRESS' && { startedAt: new Date() }),
        ...(status === 'COMPLETED' && { completedAt: new Date() }),
      },
      include: {
        plan: {
          select: {
            userId: true,
          },
        },
        activity: {
          select: {
            subjectId: true,
            skillId: true,
          },
        },
      },
    });

    if (status === 'COMPLETED') {
      const userId = updatedTask.plan.userId;
      const scopeKey = `task:${updatedTask.id}`;
      const alreadyAwarded = await this.gamificationService.isOnCooldown(
        userId,
        'TASK_COMPLETED',
        scopeKey,
        365 * 24 * 60 * 60 * 1000,
      );

      if (!alreadyAwarded) {
        await this.gamificationService.awardXp(
          userId,
          getXpForTaskCompletion(),
          'TASK_COMPLETED',
          {
            applyStudyDay: true,
            metadata: {
              scopeKey,
              taskId: updatedTask.id,
              subjectId: updatedTask.activity?.subjectId || null,
              skillId: updatedTask.activity?.skillId || null,
              source: 'tasks.updateTaskStatus',
            },
          },
        );
      }

      await this.badgesService.checkAndAwardBadges(userId);
    }

    return updatedTask;
  }

  /**
   * Get tasks for today
   * Handles both stored activities (activityId) and on-the-fly generated activities (activityData)
   */
  async getTodayTasks(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const activePlan = await this.prisma.weeklyPlan.findFirst({
      where: { userId, status: 'ACTIVE' },
    });

    if (!activePlan) {
      return [];
    }

    const tasks = await this.prisma.plannedTask.findMany({
      where: {
        planId: activePlan.id,
        scheduledFor: {
          gte: today,
          lt: tomorrow,
        },
      },
      include: {
        activity: {
          include: {
            subject: true,
            skill: true,
          },
        },
      },
      orderBy: { orderIndex: 'asc' },
    });

    // Transform tasks to use activityData if available (on-the-fly generated)
    return tasks
      .filter(task => {
        // Filter out tasks with no activity data
        return task.activityData || task.activity;
      })
      .map(task => {
        if (task.activityData) {
          // Use activityData (generated on-the-fly)
          const activityData = task.activityData as any;
          if (!activityData || !activityData.title) {
            return null; // Skip invalid activities
          }
          return {
            ...task,
            activity: {
              id: `generated-${task.id}`,
              title: activityData.title || 'Untitled Activity',
              description: activityData.description,
              instructions: activityData.instructions,
              resources: activityData.resources,
              content: activityData.content,
              activityType: activityData.activityType,
              difficulty: activityData.difficulty,
              estimatedMinutes: activityData.estimatedMinutes || 15,
              subject: activityData.subject || { id: activityData.subjectId, displayName: 'Unknown' },
              skill: activityData.skill || { id: activityData.skillId, displayName: 'Unknown' },
            },
          };
        }
        // Use stored activity (backward compatibility)
        if (!task.activity) {
          return null; // Skip tasks with no activity
        }
        // Ensure activity has required fields
        if (!task.activity.title) {
          return null; // Skip invalid activities
        }
        return task;
      })
      .filter(task => task !== null) as any[]; // Remove any null tasks
  }
}

