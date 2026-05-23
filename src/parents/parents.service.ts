import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ParentsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get children for a parent
   * In a full implementation, you'd need a parent_children junction table
   */
  async getMyChildren(parentId: string) {
    // For now, return a mock implementation
    // TODO: Add parent_children relationship table
    return [];
  }

  /**
   * Link parent to child
   */
  async linkChild(parentId: string, childEmail: string, verificationCode?: string) {
    const child = await this.prisma.user.findUnique({
      where: { email: childEmail },
      include: {
        studentProfile: {
          include: {
            yearGroup: true,
          },
        },
      },
    });

    if (!child || child.role !== 'STUDENT') {
      throw new NotFoundException('Student not found with that email');
    }

    // TODO: Implement parent_children relationship
    // For now, just return success
    return {
      message: 'Child linked successfully',
      child: {
        id: child.id,
        firstName: child.firstName,
        lastName: child.lastName,
        yearGroup: child.studentProfile?.yearGroup,
      },
    };
  }

  /**
   * Get child progress
   */
  async getChildProgress(parentId: string, childId: string) {
    // Verify parent-child relationship
    // TODO: Check parent_children table

    const child = await this.prisma.user.findUnique({
      where: { id: childId },
      include: {
        studentProfile: {
          include: {
            yearGroup: true,
          },
        },
        studentBands: {
          include: {
            subject: true,
            skill: true,
          },
        },
        weeklyPlans: {
          where: {
            status: 'ACTIVE',
          },
          include: {
            tasks: {
              include: {
                activity: {
                  include: {
                    subject: true,
                  },
                },
              },
            },
          },
        },
        userBadges: {
          include: {
            badge: true,
          },
          orderBy: {
            earnedAt: 'desc',
          },
          take: 5,
        },
        progressSnapshots: {
          orderBy: {
            date: 'desc',
          },
          take: 7,
        },
      },
    });

    if (!child) {
      throw new NotFoundException('Child not found');
    }

    // Calculate stats
    const activePlan = child.weeklyPlans[0];
    const totalTasks = activePlan ? activePlan.tasks.length : 0;
    const completedTasks = activePlan
      ? activePlan.tasks.filter((t) => t.status === 'COMPLETED').length
      : 0;

    return {
      child: {
        id: child.id,
        firstName: child.firstName,
        lastName: child.lastName,
        yearGroup: child.studentProfile?.yearGroup?.displayName,
      },
      stats: {
        totalTasks,
        completedTasks,
        completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
        badgesEarned: child.userBadges.length,
      },
      bands: child.studentBands.map((band) => ({
        subject: band.subject.displayName,
        skill: band.skill.displayName,
        level: band.currentBand,
      })),
      recentBadges: child.userBadges,
      weeklyProgress: child.progressSnapshots,
      currentWeekTasks: activePlan ? activePlan.tasks : [],
    };
  }

  /**
   * Get child's weekly plan
   */
  async getChildWeeklyPlan(parentId: string, childId: string) {
    // Verify parent-child relationship
    // TODO: Check parent_children table

    const plan = await this.prisma.weeklyPlan.findFirst({
      where: {
        userId: childId,
        status: 'ACTIVE',
      },
      include: {
        tasks: {
          include: {
            activity: {
              include: {
                subject: true,
                skill: true,
              },
            },
          },
          orderBy: [{ scheduledFor: 'asc' }, { orderIndex: 'asc' }],
        },
      },
    });

    if (!plan) {
      return { message: 'No active weekly plan' };
    }

    // Group tasks by day
    const tasksByDay = plan.tasks.reduce((days, task) => {
      const dayKey = task.scheduledFor.toISOString().split('T')[0];
      if (!days[dayKey]) {
        days[dayKey] = [];
      }
      days[dayKey].push(task);
      return days;
    }, {} as Record<string, any[]>);

    return {
      plan: {
        id: plan.id,
        weekStart: plan.weekStart,
        weekEnd: plan.weekEnd,
      },
      tasksByDay,
      stats: {
        total: plan.tasks.length,
        completed: plan.tasks.filter((t) => t.status === 'COMPLETED').length,
        pending: plan.tasks.filter((t) => t.status === 'PENDING').length,
      },
    };
  }
}

