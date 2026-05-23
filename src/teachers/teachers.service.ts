import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeachersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get students assigned to a teacher
   * In a full implementation, you'd need a teacher_students junction table
   */
  async getMyStudents(teacherId: string) {
    // For now, return all students
    // TODO: Add teacher_students relationship
    const students = await this.prisma.user.findMany({
      where: {
        role: 'STUDENT',
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        studentProfile: {
          include: {
            yearGroup: true,
          },
        },
      },
    });

    return students;
  }

  /**
   * Get progress for a specific student
   */
  async getStudentProgress(teacherId: string, studentId: string) {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
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
                    skill: true,
                  },
                },
              },
            },
          },
        },
        submissions: {
          orderBy: {
            submittedAt: 'desc',
          },
          take: 10,
          include: {
            activity: {
              include: {
                subject: true,
                skill: true,
              },
            },
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Calculate stats
    const totalTasks = student.weeklyPlans.reduce(
      (sum, plan) => sum + plan.tasks.length,
      0,
    );

    const completedTasks = student.weeklyPlans.reduce(
      (sum, plan) =>
        sum + plan.tasks.filter((t) => t.status === 'COMPLETED').length,
      0,
    );

    return {
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        yearGroup: student.studentProfile?.yearGroup,
      },
      stats: {
        totalTasks,
        completedTasks,
        completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
        totalSubmissions: student.submissions.length,
      },
      bands: student.studentBands,
      recentSubmissions: student.submissions,
      currentPlan: student.weeklyPlans[0] || null,
    };
  }

  /**
   * Get class overview
   */
  async getClassOverview(teacherId: string) {
    const students = await this.getMyStudents(teacherId);

    const overview = await Promise.all(
      students.map(async (student) => {
        const bands = await this.prisma.studentBand.findMany({
          where: { userId: student.id },
        });

        const activePlan = await this.prisma.weeklyPlan.findFirst({
          where: {
            userId: student.id,
            status: 'ACTIVE',
          },
          include: {
            tasks: true,
          },
        });

        const completedTasks = activePlan
          ? activePlan.tasks.filter((t) => t.status === 'COMPLETED').length
          : 0;

        const totalTasks = activePlan ? activePlan.tasks.length : 0;

        return {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          yearGroup: student.studentProfile?.yearGroup?.displayName,
          bandsCount: bands.length,
          completedTasks,
          totalTasks,
          completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
        };
      }),
    );

    return overview;
  }

  /**
   * Add comment to student submission
   */
  async addCommentToSubmission(
    teacherId: string,
    submissionId: string,
    comment: string,
  ) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    return this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        teacherComment: comment,
        teacherCommentedAt: new Date(),
      },
    });
  }

  /**
   * Get dashboard statistics for teacher or admin
   */
  async getDashboardStats(teacherId: string) {
    // Get user to check role
    const user = await this.prisma.user.findUnique({
      where: { id: teacherId },
      include: { teacherProfile: true },
    });

    const isAdmin = user?.role === 'ADMIN';

    // For teachers, get only students in their classes
    let studentFilter: any = { role: 'STUDENT', isActive: true };
    
    if (!isAdmin && user?.teacherProfile) {
      // Get classes this teacher teaches
      const teacherClasses = await this.prisma.classTeacher.findMany({
        where: { teacherProfileId: user.teacherProfile.id },
        select: { classId: true },
      });

      const classIds = teacherClasses.map((ct) => ct.classId);

      // Get students in these classes
      const classStudents = await this.prisma.classStudent.findMany({
        where: { classId: { in: classIds } },
        select: { studentProfileId: true },
      });

      const studentProfileIds = classStudents.map((cs) => cs.studentProfileId);

      // Filter students by their profiles
      studentFilter = {
        role: 'STUDENT',
        isActive: true,
        studentProfile: {
          id: { in: studentProfileIds },
        },
      };
    }

    const totalStudents = await this.prisma.user.count({
      where: studentFilter,
    });

    // Get students with low performance (at risk)
    // Students with at least one NEEDS_SUPPORT band
    const studentsWithBands = await this.prisma.user.findMany({
      where: studentFilter,
      include: {
        studentBands: true,
      },
    });

    // Filter students who have at least one "NEEDS_SUPPORT" band
    const studentsAtRisk = studentsWithBands.filter((student) =>
      student.studentBands.some((band) => band.currentBand === 'NEEDS_SUPPORT'),
    ).length;

    // Get recent completions (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentCompletions = await this.prisma.plannedTask.count({
      where: {
        status: 'COMPLETED',
        completedAt: {
          gte: sevenDaysAgo,
        },
      },
    });

    // Get total active classes (filtered by teacher)
    let classFilter: any = { isActive: true };
    
    if (!isAdmin && user?.teacherProfile) {
      const teacherClasses = await this.prisma.classTeacher.findMany({
        where: { teacherProfileId: user.teacherProfile.id },
        select: { classId: true },
      });

      classFilter = {
        isActive: true,
        id: { in: teacherClasses.map((ct) => ct.classId) },
      };
    }

    const totalClasses = await this.prisma.class.count({
      where: classFilter,
    });

    // Weekly activity summary
    const weeklyTasks = await this.prisma.plannedTask.count({
      where: {
        scheduledFor: {
          gte: sevenDaysAgo,
        },
      },
    });

    const weeklyCompletions = await this.prisma.plannedTask.count({
      where: {
        scheduledFor: {
          gte: sevenDaysAgo,
        },
        status: 'COMPLETED',
      },
    });

    return {
      totalStudents,
      studentsAtRisk,
      recentCompletions,
      totalClasses,
      weeklyActivity: {
        totalTasks: weeklyTasks,
        completedTasks: weeklyCompletions,
        completionRate:
          weeklyTasks > 0 ? (weeklyCompletions / weeklyTasks) * 100 : 0,
      },
    };
  }

  /**
   * Get recent activity feed
   */
  async getRecentActivity(teacherId: string, limit: number = 10) {
    const activities: any[] = [];

    // Get recent completions
    const recentCompletions = await this.prisma.plannedTask.findMany({
      where: {
        status: 'COMPLETED',
        completedAt: {
          not: null,
        },
      },
      include: {
        plan: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        activity: {
          include: {
            subject: true,
            skill: true,
          },
        },
      },
      orderBy: {
        completedAt: 'desc',
      },
      take: limit,
    });

    for (const task of recentCompletions) {
      activities.push({
        id: task.id,
        type: 'completion',
        student: `${task.plan.user.firstName} ${task.plan.user.lastName}`,
        action: `completed ${task.activity.subject.displayName}: ${task.activity.skill.displayName}`,
        time: task.completedAt,
      });
    }

    // Get recent submissions
    const recentSubmissions = await this.prisma.submission.findMany({
      where: {},
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        activity: {
          include: {
            subject: true,
          },
        },
      },
      orderBy: {
        submittedAt: 'desc',
      },
      take: Math.floor(limit / 2),
    });

    for (const submission of recentSubmissions) {
      activities.push({
        id: submission.id,
        type: 'submission',
        student: `${submission.user.firstName} ${submission.user.lastName}`,
        action: `submitted ${submission.activity.subject.displayName} work`,
        time: submission.submittedAt,
      });
    }

    // Sort all activities by time
    activities.sort((a, b) => b.time.getTime() - a.time.getTime());

    return activities.slice(0, limit);
  }

  /**
   * Get students at risk (filtered by teacher if not admin)
   */
  async getStudentsAtRisk(teacherId: string) {
    // Get user to check role
    const user = await this.prisma.user.findUnique({
      where: { id: teacherId },
      include: { teacherProfile: true },
    });

    const isAdmin = user?.role === 'ADMIN';

    // Build student filter
    let studentFilter: any = { role: 'STUDENT', isActive: true };
    
    if (!isAdmin && user?.teacherProfile) {
      // Get classes this teacher teaches
      const teacherClasses = await this.prisma.classTeacher.findMany({
        where: { teacherProfileId: user.teacherProfile.id },
        select: { classId: true },
      });

      const classIds = teacherClasses.map((ct) => ct.classId);

      // Get students in these classes
      const classStudents = await this.prisma.classStudent.findMany({
        where: { classId: { in: classIds } },
        select: { studentProfileId: true },
      });

      const studentProfileIds = classStudents.map((cs) => cs.studentProfileId);

      studentFilter = {
        role: 'STUDENT',
        isActive: true,
        studentProfile: {
          id: { in: studentProfileIds },
        },
      };
    }

    const studentsWithBands = await this.prisma.user.findMany({
      where: studentFilter,
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
      },
    });

    // Filter students who have at least one "NEEDS_SUPPORT" band
    const atRiskStudents = studentsWithBands
      .filter((student) =>
        student.studentBands.some((band) => band.currentBand === 'NEEDS_SUPPORT'),
      )
      .map((student) => {
        const atRiskBands = student.studentBands.filter(
          (band) => band.currentBand === 'NEEDS_SUPPORT',
        );

        return {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          email: student.email,
          yearGroup: student.studentProfile?.yearGroup?.displayName,
          atRiskAreas: atRiskBands.map((band) => ({
            subject: band.subject.displayName,
            skill: band.skill.displayName,
          })),
          atRiskCount: atRiskBands.length,
        };
      });

    return atRiskStudents;
  }

  /**
   * Get subject performance overview (filtered by teacher if not admin)
   */
  async getSubjectPerformance(teacherId: string) {
    // Get user to check role
    const user = await this.prisma.user.findUnique({
      where: { id: teacherId },
      include: { teacherProfile: true },
    });

    const isAdmin = user?.role === 'ADMIN';

    // Get students filter for teacher
    let studentUserIds: string[] = [];
    
    if (!isAdmin && user?.teacherProfile) {
      // Get classes this teacher teaches
      const teacherClasses = await this.prisma.classTeacher.findMany({
        where: { teacherProfileId: user.teacherProfile.id },
        select: { classId: true },
      });

      const classIds = teacherClasses.map((ct) => ct.classId);

      // Get students in these classes
      const classStudents = await this.prisma.classStudent.findMany({
        where: { classId: { in: classIds } },
        include: {
          studentProfile: {
            select: { userId: true },
          },
        },
      });

      studentUserIds = classStudents.map((cs) => cs.studentProfile.userId);
    }

    const subjects = await this.prisma.subject.findMany({
      where: { isActive: true },
      include: {
        yearGroup: true,
      },
    });

    const performanceData = await Promise.all(
      subjects.map(async (subject) => {
        let bandFilter: any = { subjectId: subject.id };
        
        // Filter by teacher's students if not admin
        if (!isAdmin && studentUserIds.length > 0) {
          bandFilter.userId = { in: studentUserIds };
        }
        
        const bands = await this.prisma.studentBand.findMany({
          where: bandFilter,
        });

        if (bands.length === 0) {
          return {
            subjectId: subject.id,
            subjectName: subject.displayName,
            yearGroup: subject.yearGroup.displayName,
            average: 0,
            studentCount: 0,
          };
        }

        // Convert band to numeric value: NEEDS_SUPPORT = 33, DEVELOPING = 66, SECURE = 100
        const bandToScore = {
          NEEDS_SUPPORT: 33,
          DEVELOPING: 66,
          SECURE: 100,
        };

        const totalScore = bands.reduce((sum, band) => {
          return sum + (bandToScore[band.currentBand] || 0);
        }, 0);

        const average = totalScore / bands.length;

        return {
          subjectId: subject.id,
          subjectName: subject.displayName,
          yearGroup: subject.yearGroup.displayName,
          average: Math.round(average),
          studentCount: bands.length,
        };
      }),
    );

    // Sort by average descending
    return performanceData
      .filter((p) => p.studentCount > 0)
      .sort((a, b) => b.average - a.average)
      .slice(0, 10); // Top 10 subjects
  }
}

