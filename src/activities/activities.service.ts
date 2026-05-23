import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { Band, ActivityType } from '@prisma/client';
import { sanitizeActivityResources } from '../common/activity-content.util';

@Injectable()
export class ActivitiesService {
  constructor(private prisma: PrismaService) {}

  private withNormalizedResources<T extends { resources?: unknown; subject?: { locale?: string | null } }>(
    activity: T,
    locale?: string,
  ): T {
    const loc =
      locale ||
      (activity.subject?.locale === 'el-GR' ? 'el-GR' : 'en-GB');
    if (!activity.resources) return activity;
    return {
      ...activity,
      resources: sanitizeActivityResources(activity.resources, loc),
    };
  }

  private activityMatchesTopic(
    activity: { resources?: unknown; title?: string; description?: string; instructions?: string },
    curriculumTopicId: string,
    chapterName?: string,
  ): boolean {
    const r = activity.resources as Record<string, unknown> | null | undefined;
    if (r?.curriculumTopicId === curriculumTopicId) return true;
    const topicName = String(r?.curriculumTopicName || '').trim();
    const unitRef = String(r?.curriculumUnitRef || '').trim();
    const chapter = (chapterName || '').trim().toLowerCase();
    if (!chapter) return false;
    const haystack = [topicName, unitRef, activity.title, activity.description, activity.instructions]
      .join(' ')
      .toLowerCase();
    return haystack.includes(chapter) || chapter.includes(topicName.toLowerCase());
  }

  async create(createActivityDto: CreateActivityDto) {
    return this.prisma.activity.create({
      data: createActivityDto,
      include: {
        subject: true,
        skill: true,
      },
    });
  }

  async findAll(filters?: {
    subjectId?: string;
    skillId?: string;
    difficulty?: Band;
    activityType?: ActivityType;
    yearGroupId?: string;
    locale?: string;
    curriculumTopicId?: string;
    chapterName?: string;
  }) {
    // Build where clause, excluding empty/undefined values
    const where: any = {
      isActive: true,
    };

    if (filters?.subjectId) where.subjectId = filters.subjectId;
    if (filters?.skillId) where.skillId = filters.skillId;
    if (filters?.difficulty) where.difficulty = filters.difficulty;
    if (filters?.activityType) where.activityType = filters.activityType;
    if (filters?.yearGroupId || filters?.locale) {
      where.subject = {};
      if (filters.yearGroupId) where.subject.yearGroupId = filters.yearGroupId;
      if (filters?.locale) {
        if (filters.locale === 'en-GB') {
          where.subject.OR = [{ locale: 'en-GB' }, { locale: null }];
        } else {
          where.subject.locale = filters.locale;
        }
      }
    }

    let activities = await this.prisma.activity.findMany({
      where,
      include: {
        subject: {
          include: {
            yearGroup: true,
          },
        },
        skill: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (filters?.curriculumTopicId) {
      const matched = activities.filter((a) =>
        this.activityMatchesTopic(a, filters.curriculumTopicId!, filters.chapterName),
      );
      if (matched.length > 0) {
        activities = matched;
      }
    }

    const locale = filters?.locale || 'en-GB';
    return activities.map((a) => this.withNormalizedResources(a, locale));
  }

  /**
   * Get recommended activities for a student based on their bands
   */
  async getRecommendedActivities(
    userId: string,
    subjectId?: string,
    limit: number = 10,
  ) {
    // Get student's current bands
    const studentBands = await this.prisma.studentBand.findMany({
      where: {
        userId,
        ...(subjectId && { subjectId }),
      },
      include: {
        subject: true,
        skill: true,
      },
    });

    // Get activities matching the student's bands
    const activities = await Promise.all(
      studentBands.map(async (band) => {
        return this.prisma.activity.findMany({
          where: {
            subjectId: band.subjectId,
            skillId: band.skillId,
            difficulty: band.currentBand,
            isActive: true,
            // Exclude recently completed activities
            NOT: {
              submissions: {
                some: {
                  userId,
                  submittedAt: {
                    gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
                  },
                },
              },
            },
          },
          include: {
            subject: true,
            skill: true,
          },
          take: Math.ceil(limit / studentBands.length),
        });
      }),
    );

    const flat = activities.flat().slice(0, limit);
    return flat.map((a) => this.withNormalizedResources(a));
  }

  async findOne(id: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
      include: {
        subject: true,
        skill: true,
      },
    });

    if (!activity) {
      throw new NotFoundException(`Activity with ID ${id} not found`);
    }

    return this.withNormalizedResources(activity);
  }

  async update(id: string, updateActivityDto: UpdateActivityDto) {
    await this.findOne(id);
    return this.prisma.activity.update({
      where: { id },
      data: updateActivityDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.activity.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Assign activity to students
   */
  async assignActivity(data: {
    activityId: string;
    assignmentType: 'individual' | 'class' | 'group';
    studentIds?: string[];
    classIds?: string[];
    dueDate?: string;
    isRequired: boolean;
    notes?: string;
    assignedBy: string;
  }) {
    const { activityId, assignmentType, studentIds, classIds, dueDate, isRequired, notes, assignedBy } = data;

    // Verify activity exists
    await this.findOne(activityId);

    let targetStudentIds: string[] = [];

    // Get student IDs based on assignment type
    if (assignmentType === 'individual' || assignmentType === 'group') {
      targetStudentIds = studentIds || [];
    } else if (assignmentType === 'class' && classIds) {
      // Get all students in selected classes
      const classStudents = await this.prisma.classStudent.findMany({
        where: {
          classId: { in: classIds },
        },
        include: {
          studentProfile: {
            select: {
              userId: true,
            },
          },
        },
      });
      targetStudentIds = classStudents.map((cs) => cs.studentProfile.userId);
    }

    if (targetStudentIds.length === 0) {
      throw new NotFoundException('No students found for assignment');
    }

    // Create weekly plans for each student if they don't have one
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // End of week (Saturday)
    weekEnd.setHours(23, 59, 59, 999);

    const assignments = await Promise.all(
      targetStudentIds.map(async (userId) => {
        // Get or create weekly plan
        let weeklyPlan = await this.prisma.weeklyPlan.findFirst({
          where: {
            userId,
            weekStart: {
              gte: weekStart,
              lte: weekEnd,
            },
          },
        });

        if (!weeklyPlan) {
          weeklyPlan = await this.prisma.weeklyPlan.create({
            data: {
              userId,
              weekStart,
              weekEnd,
              status: 'ACTIVE',
            },
          });
        }

        // Create planned task
        const scheduledFor = dueDate ? new Date(dueDate) : new Date();

        // Get next order index for this day
        const existingTasks = await this.prisma.plannedTask.count({
          where: {
            planId: weeklyPlan.id,
            scheduledFor: {
              gte: new Date(scheduledFor.setHours(0, 0, 0, 0)),
              lt: new Date(scheduledFor.setHours(23, 59, 59, 999)),
            },
          },
        });

        return this.prisma.plannedTask.create({
          data: {
            planId: weeklyPlan.id,
            activityId,
            scheduledFor: dueDate ? new Date(dueDate) : new Date(),
            orderIndex: existingTasks,
            status: 'PENDING',
          },
        });
      }),
    );

    // TODO: Store assignment metadata (isRequired, notes, assignedBy)
    // This would require a new Assignment table in the schema

    return {
      success: true,
      assigned: assignments.length,
      studentIds: targetStudentIds,
      assignmentType,
      isRequired,
      dueDate,
    };
  }

  /**
   * Get activity assignments
   */
  async getAssignments(filters?: {
    studentId?: string;
    classId?: string;
    status?: string;
  }) {
    const where: any = {};

    if (filters?.studentId) {
      where.plan = {
        userId: filters.studentId,
      };
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    const assignments = await this.prisma.plannedTask.findMany({
      where,
      include: {
        activity: {
          include: {
            subject: true,
            skill: true,
          },
        },
        plan: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        scheduledFor: 'desc',
      },
    });

    return assignments;
  }

  /**
   * Delete all activities from the database
   * WARNING: This is a destructive operation
   */
  async deleteAllActivities() {
    const count = await this.prisma.activity.count();
    
    // Delete all activities (cascade will handle related records)
    await this.prisma.activity.deleteMany({});
    
    return {
      success: true,
      deletedCount: count,
      message: `Successfully deleted ${count} activities from the database`,
    };
  }
}

