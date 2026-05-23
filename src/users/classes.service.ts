import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

@Injectable()
export class ClassesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new class
   */
  async create(createClassDto: CreateClassDto) {
    const { name, description, yearGroupId, subjectId, isActive, studentIds, teacherIds } = createClassDto;

    return this.prisma.class.create({
      data: {
        name,
        description,
        yearGroupId,
        subjectId,
        isActive: isActive ?? true,
        classStudents: studentIds
          ? {
              create: studentIds.map((studentProfileId) => ({
                studentProfileId,
              })),
            }
          : undefined,
        classTeachers: teacherIds
          ? {
              create: teacherIds.map((teacherProfileId, index) => ({
                teacherProfileId,
                isMainTeacher: index === 0, // First teacher is main teacher
              })),
            }
          : undefined,
      },
      include: {
        yearGroup: true,
        subject: true,
        classStudents: {
          include: {
            studentProfile: {
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
        },
        classTeachers: {
          include: {
            teacherProfile: {
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
        },
      },
    });
  }

  /**
   * Find all classes
   */
  async findAll(filters?: { yearGroupId?: string; subjectId?: string; teacherId?: string }) {
    return this.prisma.class.findMany({
      where: {
        ...(filters?.yearGroupId && { yearGroupId: filters.yearGroupId }),
        ...(filters?.subjectId && { subjectId: filters.subjectId }),
        ...(filters?.teacherId && {
          classTeachers: {
            some: {
              teacherProfile: {
                userId: filters.teacherId,
              },
            },
          },
        }),
      },
      include: {
        yearGroup: true,
        subject: true,
        classStudents: {
          include: {
            studentProfile: {
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
        },
        classTeachers: {
          include: {
            teacherProfile: {
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
        },
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  /**
   * Find a class by ID
   */
  async findOne(id: string) {
    const classEntity = await this.prisma.class.findUnique({
      where: { id },
      include: {
        yearGroup: true,
        subject: true,
        classStudents: {
          include: {
            studentProfile: {
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
        },
        classTeachers: {
          include: {
            teacherProfile: {
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
        },
      },
    });

    if (!classEntity) {
      throw new NotFoundException(`Class with ID ${id} not found`);
    }

    return classEntity;
  }

  /**
   * Update a class
   */
  async update(id: string, updateClassDto: UpdateClassDto) {
    await this.findOne(id); // Check if exists

    const { name, description, yearGroupId, subjectId, isActive, studentIds, teacherIds } = updateClassDto;

    // If studentIds or teacherIds are provided, replace all relationships
    const data: any = {
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(yearGroupId !== undefined && { yearGroupId }),
      ...(subjectId !== undefined && { subjectId }),
      ...(typeof isActive === 'boolean' && { isActive }),
    };

    // Replace students if provided
    if (studentIds) {
      data.classStudents = {
        deleteMany: {},
        create: studentIds.map((studentProfileId) => ({
          studentProfileId,
        })),
      };
    }

    // Replace teachers if provided
    if (teacherIds) {
      data.classTeachers = {
        deleteMany: {},
        create: teacherIds.map((teacherProfileId, index) => ({
          teacherProfileId,
          isMainTeacher: index === 0,
        })),
      };
    }

    return this.prisma.class.update({
      where: { id },
      data,
      include: {
        yearGroup: true,
        subject: true,
        classStudents: {
          include: {
            studentProfile: {
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
        },
        classTeachers: {
          include: {
            teacherProfile: {
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
        },
      },
    });
  }

  /**
   * Delete a class
   */
  async remove(id: string) {
    await this.findOne(id); // Check if exists

    return this.prisma.class.delete({
      where: { id },
    });
  }

  /**
   * Add students to a class
   */
  async addStudents(classId: string, studentIds: string[]) {
    await this.findOne(classId); // Check if exists

    return this.prisma.class.update({
      where: { id: classId },
      data: {
        classStudents: {
          create: studentIds.map((studentProfileId) => ({
            studentProfileId,
          })),
        },
      },
      include: {
        classStudents: {
          include: {
            studentProfile: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Remove students from a class
   */
  async removeStudents(classId: string, studentIds: string[]) {
    await this.findOne(classId); // Check if exists

    return this.prisma.classStudent.deleteMany({
      where: {
        classId,
        studentProfileId: { in: studentIds },
      },
    });
  }

  /**
   * Add teachers to a class
   */
  async addTeachers(classId: string, teacherIds: string[], makeMainTeacher: boolean = false) {
    await this.findOne(classId); // Check if exists

    return this.prisma.class.update({
      where: { id: classId },
      data: {
        classTeachers: {
          create: teacherIds.map((teacherProfileId, index) => ({
            teacherProfileId,
            isMainTeacher: makeMainTeacher && index === 0,
          })),
        },
      },
      include: {
        classTeachers: {
          include: {
            teacherProfile: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Remove teachers from a class
   */
  async removeTeachers(classId: string, teacherIds: string[]) {
    await this.findOne(classId); // Check if exists

    return this.prisma.classTeacher.deleteMany({
      where: {
        classId,
        teacherProfileId: { in: teacherIds },
      },
    });
  }

  // ============================================
  // CLASS SCHEDULE MANAGEMENT
  // ============================================

  /**
   * Get all schedules for a class
   */
  async getSchedules(classId: string) {
    await this.findOne(classId); // Check if class exists

    return this.prisma.classSchedule.findMany({
      where: { classId },
      orderBy: [
        { dayOfWeek: 'asc' },
        { startTime: 'asc' },
      ],
    });
  }

  /**
   * Create a schedule for a class
   */
  async createSchedule(classId: string, createScheduleDto: CreateScheduleDto) {
    await this.findOne(classId); // Check if class exists

    // Validate time order
    if (createScheduleDto.startTime >= createScheduleDto.endTime) {
      throw new BadRequestException('End time must be after start time');
    }

    // Check for overlapping schedules
    const overlapping = await this.prisma.classSchedule.findFirst({
      where: {
        classId,
        dayOfWeek: createScheduleDto.dayOfWeek as any,
        isActive: true,
        OR: [
          // New schedule starts during existing schedule
          {
            AND: [
              { startTime: { lte: createScheduleDto.startTime } },
              { endTime: { gt: createScheduleDto.startTime } },
            ],
          },
          // New schedule ends during existing schedule
          {
            AND: [
              { startTime: { lt: createScheduleDto.endTime } },
              { endTime: { gte: createScheduleDto.endTime } },
            ],
          },
          // New schedule encompasses existing schedule
          {
            AND: [
              { startTime: { gte: createScheduleDto.startTime } },
              { endTime: { lte: createScheduleDto.endTime } },
            ],
          },
        ],
      },
    });

    if (overlapping) {
      throw new BadRequestException(
        `Schedule overlaps with existing schedule on ${createScheduleDto.dayOfWeek} from ${overlapping.startTime} to ${overlapping.endTime}`
      );
    }

    return this.prisma.classSchedule.create({
      data: {
        classId,
        dayOfWeek: createScheduleDto.dayOfWeek as any,
        startTime: createScheduleDto.startTime,
        endTime: createScheduleDto.endTime,
        room: createScheduleDto.room,
        notes: createScheduleDto.notes,
        isActive: createScheduleDto.isActive ?? true,
      },
    });
  }

  /**
   * Update a class schedule
   */
  async updateSchedule(scheduleId: string, updateScheduleDto: UpdateScheduleDto) {
    const schedule = await this.prisma.classSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    // Validate time order if both times are provided
    const startTime = updateScheduleDto.startTime || schedule.startTime;
    const endTime = updateScheduleDto.endTime || schedule.endTime;

    if (startTime >= endTime) {
      throw new BadRequestException('End time must be after start time');
    }

    // Check for overlapping schedules (excluding current schedule)
    if (updateScheduleDto.dayOfWeek || updateScheduleDto.startTime || updateScheduleDto.endTime) {
      const dayOfWeek = updateScheduleDto.dayOfWeek || schedule.dayOfWeek;
      
      const overlapping = await this.prisma.classSchedule.findFirst({
        where: {
          classId: schedule.classId,
          dayOfWeek: dayOfWeek as any,
          isActive: true,
          id: { not: scheduleId }, // Exclude current schedule
          OR: [
            {
              AND: [
                { startTime: { lte: startTime } },
                { endTime: { gt: startTime } },
              ],
            },
            {
              AND: [
                { startTime: { lt: endTime } },
                { endTime: { gte: endTime } },
              ],
            },
            {
              AND: [
                { startTime: { gte: startTime } },
                { endTime: { lte: endTime } },
              ],
            },
          ],
        },
      });

      if (overlapping) {
        throw new BadRequestException(
          `Schedule overlaps with existing schedule on ${dayOfWeek} from ${overlapping.startTime} to ${overlapping.endTime}`
        );
      }
    }

    return this.prisma.classSchedule.update({
      where: { id: scheduleId },
      data: {
        ...(updateScheduleDto.dayOfWeek && { dayOfWeek: updateScheduleDto.dayOfWeek as any }),
        ...(updateScheduleDto.startTime && { startTime: updateScheduleDto.startTime }),
        ...(updateScheduleDto.endTime && { endTime: updateScheduleDto.endTime }),
        ...(updateScheduleDto.room !== undefined && { room: updateScheduleDto.room }),
        ...(updateScheduleDto.notes !== undefined && { notes: updateScheduleDto.notes }),
        ...(typeof updateScheduleDto.isActive === 'boolean' && { isActive: updateScheduleDto.isActive }),
      },
    });
  }

  /**
   * Delete a class schedule
   */
  async deleteSchedule(scheduleId: string) {
    const schedule = await this.prisma.classSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    return this.prisma.classSchedule.delete({
      where: { id: scheduleId },
    });
  }

  /**
   * Get weekly timetable for a class
   */
  async getWeeklyTimetable(classId: string) {
    await this.findOne(classId); // Check if class exists

    const schedules = await this.prisma.classSchedule.findMany({
      where: {
        classId,
        isActive: true,
      },
      orderBy: [
        { dayOfWeek: 'asc' },
        { startTime: 'asc' },
      ],
    });

    // Group by day of week
    const timetable = {
      MONDAY: [],
      TUESDAY: [],
      WEDNESDAY: [],
      THURSDAY: [],
      FRIDAY: [],
      SATURDAY: [],
      SUNDAY: [],
    };

    schedules.forEach((schedule) => {
      timetable[schedule.dayOfWeek].push(schedule);
    });

    return timetable;
  }

  /**
   * Get comprehensive class analytics
   */
  async getClassAnalytics(classId: string) {
    const classData = await this.prisma.class.findUnique({
      where: { id: classId },
      include: {
        yearGroup: true,
        subject: true,
        classStudents: {
          include: {
            studentProfile: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    lastLogin: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!classData) {
      throw new NotFoundException('Class not found');
    }

    const studentUserIds = classData.classStudents.map(
      (cs) => cs.studentProfile.user.id,
    );

    // Get all subjects for this year group
    const subjects = await this.prisma.subject.findMany({
      where: {
        yearGroupId: classData.yearGroupId,
        isActive: true,
      },
    });

    // Calculate class average per subject
    const subjectAverages = await Promise.all(
      subjects.map(async (subject) => {
        const skillMasteries = await this.prisma.skillMastery.findMany({
          where: {
            userId: { in: studentUserIds },
            subjectId: subject.id,
          },
        });

        if (skillMasteries.length === 0) {
          return {
            subjectId: subject.id,
            subjectName: subject.displayName,
            average: 0,
            studentCount: 0,
          };
        }

        const totalMastery = skillMasteries.reduce(
          (sum, m) => sum + m.masteryPercentage,
          0,
        );
        const average = Math.round(totalMastery / skillMasteries.length);

        return {
          subjectId: subject.id,
          subjectName: subject.displayName,
          average,
          studentCount: skillMasteries.length,
        };
      }),
    );

    // Calculate overall class average
    const validSubjectAverages = subjectAverages.filter((s) => s.studentCount > 0);
    const classAverage =
      validSubjectAverages.length > 0
        ? Math.round(
            validSubjectAverages.reduce((sum, s) => sum + s.average, 0) /
              validSubjectAverages.length,
          )
        : 0;

    // Get engagement metrics
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Login frequency (last 7 days)
    const recentLogins = classData.classStudents.filter(
      (cs) =>
        cs.studentProfile.user.lastLogin &&
        new Date(cs.studentProfile.user.lastLogin) > weekAgo,
    );
    const avgLoginFrequency = Math.round(
      (recentLogins.length / studentUserIds.length) * 7,
    );

    // Task completion rate
    const allPlans = await this.prisma.weeklyPlan.findMany({
      where: {
        userId: { in: studentUserIds },
        status: 'ACTIVE',
      },
      include: {
        tasks: true,
      },
    });

    const totalTasks = allPlans.reduce((sum, plan) => sum + plan.tasks.length, 0);
    const completedTasks = allPlans.reduce(
      (sum, plan) =>
        sum + plan.tasks.filter((t) => t.status === 'COMPLETED').length,
      0,
    );
    const taskCompletionRate =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Average session duration
    const sessions = await this.prisma.learningSession.findMany({
      where: {
        userId: { in: studentUserIds },
        startedAt: { gte: weekAgo },
      },
      select: {
        duration: true,
      },
    });

    const totalSessionMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);
    const avgSessionMinutes =
      sessions.length > 0 ? Math.round(totalSessionMinutes / sessions.length) : 0;
    const avgSessionDuration = `${avgSessionMinutes} min`;

    // Active students (logged in within last 7 days)
    const activeStudents = recentLogins.length;

    // Top performers (top 5 students)
    const studentPerformances = await Promise.all(
      studentUserIds.map(async (userId) => {
        const masteries = await this.prisma.skillMastery.findMany({
          where: { userId },
        });

        const average =
          masteries.length > 0
            ? Math.round(
                masteries.reduce((sum, m) => sum + m.masteryPercentage, 0) /
                  masteries.length,
              )
            : 0;

        const student = classData.classStudents.find(
          (cs) => cs.studentProfile.user.id === userId,
        )?.studentProfile.user;

        return {
          id: userId,
          firstName: student?.firstName || '',
          lastName: student?.lastName || '',
          average,
        };
      }),
    );

    const topPerformers = studentPerformances
      .sort((a, b) => b.average - a.average)
      .slice(0, 5);

    // Students at risk (average < 50%)
    const atRiskStudents = studentPerformances
      .filter((s) => s.average < 50 && s.average > 0)
      .sort((a, b) => a.average - b.average);

    return {
      classId: classData.id,
      className: classData.name,
      yearGroup: classData.yearGroup?.displayName || 'N/A',
      studentCount: studentUserIds.length,
      classAverage,
      subjectAverages: subjectAverages.filter((s) => s.studentCount > 0),
      engagementMetrics: {
        avgLoginFrequency,
        taskCompletionRate,
        avgSessionDuration,
        activeStudents,
        totalStudents: studentUserIds.length,
      },
      avgLoginFrequency,
      taskCompletionRate,
      avgSessionDuration,
      topPerformers,
      atRiskStudents,
    };
  }
}

