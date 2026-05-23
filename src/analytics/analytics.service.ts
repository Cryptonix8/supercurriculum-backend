import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get comprehensive visualization data
   */
  async getVisualizationData(filters: {
    yearGroupId?: string;
    classId?: string;
    timeRange?: 'week' | 'month';
  }) {
    const { yearGroupId, classId, timeRange = 'week' } = filters;

    // Build student filter based on class/year
    let studentUserIds: string[] = [];

    if (classId) {
      // Get students in specific class
      const classStudents = await this.prisma.classStudent.findMany({
        where: { classId },
        include: {
          studentProfile: {
            select: { userId: true },
          },
        },
      });
      studentUserIds = classStudents.map((cs) => cs.studentProfile.userId);
    } else if (yearGroupId) {
      // Get all students in year group
      const students = await this.prisma.user.findMany({
        where: {
          role: 'STUDENT',
          isActive: true,
          studentProfile: {
            yearGroupId,
          },
        },
        select: { id: true },
      });
      studentUserIds = students.map((s) => s.id);
    } else {
      // Get all students
      const students = await this.prisma.user.findMany({
        where: {
          role: 'STUDENT',
          isActive: true,
        },
        select: { id: true },
      });
      studentUserIds = students.map((s) => s.id);
    }

    // Get all subjects
    const subjectFilter: any = { isActive: true };
    if (yearGroupId) {
      subjectFilter.yearGroupId = yearGroupId;
    }

    const subjects = await this.prisma.subject.findMany({
      where: subjectFilter,
      include: {
        yearGroup: true,
        skills: true,
      },
    });

    // 1. SUBJECT PROGRESS BARS
    const subjectProgress = await Promise.all(
      subjects.map(async (subject) => {
        const skillMasteries = await this.prisma.skillMastery.findMany({
          where: {
            userId: { in: studentUserIds },
            subjectId: subject.id,
          },
        });

        if (skillMasteries.length === 0) {
          return null;
        }

        const average = Math.round(
          skillMasteries.reduce((sum, m) => sum + m.masteryPercentage, 0) /
            skillMasteries.length,
        );

        return {
          id: subject.id,
          name: subject.displayName,
          yearGroup: subject.yearGroup.displayName,
          average,
          studentCount: new Set(skillMasteries.map((m) => m.userId)).size,
        };
      }),
    );

    // 2. HEAT MAP DATA - Subject with Best/Weak Skills
    const heatMapData = await Promise.all(
      subjects.map(async (subject) => {
        const skillPerformances = await Promise.all(
          subject.skills.map(async (skill) => {
            const masteries = await this.prisma.skillMastery.findMany({
              where: {
                userId: { in: studentUserIds },
                skillId: skill.id,
              },
            });

            if (masteries.length === 0) return null;

            const avg = Math.round(
              masteries.reduce((sum, m) => sum + m.masteryPercentage, 0) /
                masteries.length,
            );

            return {
              skillId: skill.id,
              name: skill.displayName,
              score: avg,
            };
          }),
        );

        const validSkills = skillPerformances.filter((s) => s !== null);
        if (validSkills.length === 0) return null;

        const sortedSkills = validSkills.sort((a, b) => (b?.score || 0) - (a?.score || 0));

        const subjectAvg = Math.round(
          validSkills.reduce((sum, s) => sum + (s?.score || 0), 0) /
            validSkills.length,
        );

        return {
          id: subject.id,
          name: subject.displayName,
          average: subjectAvg,
          bestSkill: sortedSkills[0] || null,
          weakSkill: sortedSkills[sortedSkills.length - 1] || null,
        };
      }),
    );

    // 3. TREND GRAPHS - Weekly/Monthly Progress
    const daysToLookBack = timeRange === 'week' ? 28 : 180; // 4 weeks or 6 months
    const intervalDays = timeRange === 'week' ? 7 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysToLookBack);

    const trendData = [];
    const periods = timeRange === 'week' ? 4 : 6;

    for (let i = 0; i < periods; i++) {
      const periodStart = new Date(startDate);
      periodStart.setDate(periodStart.getDate() + i * intervalDays);

      const periodEnd = new Date(periodStart);
      periodEnd.setDate(periodEnd.getDate() + intervalDays);

      // Get snapshot for this period (use most recent data in period)
      const snapshot = await this.prisma.progressSnapshot.findFirst({
        where: {
          userId: { in: studentUserIds },
          date: {
            gte: periodStart,
            lt: periodEnd,
          },
        },
        orderBy: {
          date: 'desc',
        },
      });

      // If no snapshot, calculate from skill mastery
      let avgScore = 0;
      if (snapshot) {
        avgScore = Math.round(snapshot.averageScore || 0);
      } else {
        // Fallback: use current mastery data
        const masteries = await this.prisma.skillMastery.findMany({
          where: {
            userId: { in: studentUserIds },
            updatedAt: {
              lte: periodEnd,
            },
          },
          select: {
            masteryPercentage: true,
          },
        });

        if (masteries.length > 0) {
          avgScore = Math.round(
            masteries.reduce((sum, m) => sum + m.masteryPercentage, 0) /
              masteries.length,
          );
        }
      }

      const label =
        timeRange === 'week'
          ? `Week ${i + 1}`
          : periodStart.toLocaleDateString('en-US', { month: 'short' });

      trendData.push({
        label,
        value: avgScore,
        date: periodStart.toISOString(),
      });
    }

    // 4. AT-RISK STUDENTS
    const studentsWithMastery = await this.prisma.user.findMany({
      where: {
        id: { in: studentUserIds },
      },
      include: {
        studentProfile: {
          include: {
            yearGroup: true,
          },
        },
        skillMastery: {
          include: {
            subject: true,
          },
        },
      },
    });

    const atRiskStudents = studentsWithMastery
      .map((student) => {
        if (student.skillMastery.length === 0) return null;

        const avgMastery =
          student.skillMastery.reduce((sum, m) => sum + m.masteryPercentage, 0) /
          student.skillMastery.length;

        // Get subjects below 50%
        const subjectMasteries = new Map();
        student.skillMastery.forEach((m) => {
          if (!subjectMasteries.has(m.subjectId)) {
            subjectMasteries.set(m.subjectId, {
              name: m.subject.displayName,
              total: 0,
              count: 0,
            });
          }
          const sub = subjectMasteries.get(m.subjectId);
          sub.total += m.masteryPercentage;
          sub.count += 1;
        });

        const criticalSubjects: string[] = [];
        subjectMasteries.forEach((sub) => {
          const avg = sub.total / sub.count;
          if (avg < 50) {
            criticalSubjects.push(sub.name);
          }
        });

        if (avgMastery >= 50) return null;

        return {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          yearGroup: student.studentProfile?.yearGroup?.displayName || 'N/A',
          average: Math.round(avgMastery),
          criticalSubjects,
        };
      })
      .filter((s) => s !== null)
      .sort((a, b) => (a?.average || 0) - (b?.average || 0));

    // 5. COMPLETION FUNNEL
    const weeklyPlans = await this.prisma.weeklyPlan.findMany({
      where: {
        userId: { in: studentUserIds },
        status: 'ACTIVE',
      },
      include: {
        tasks: true,
      },
    });

    const assigned = weeklyPlans.reduce((sum, plan) => sum + plan.tasks.length, 0);
    const started = weeklyPlans.reduce(
      (sum, plan) =>
        sum +
        plan.tasks.filter(
          (t) => t.status === 'IN_PROGRESS' || t.status === 'COMPLETED',
        ).length,
      0,
    );
    const inProgress = weeklyPlans.reduce(
      (sum, plan) =>
        sum + plan.tasks.filter((t) => t.status === 'IN_PROGRESS').length,
      0,
    );
    const completed = weeklyPlans.reduce(
      (sum, plan) =>
        sum + plan.tasks.filter((t) => t.status === 'COMPLETED').length,
      0,
    );

    const completionRate = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;

    // 6. QUICK STATS
    const activeThisWeek = studentsWithMastery.filter((s) => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return s.lastLogin && new Date(s.lastLogin) > weekAgo;
    }).length;

    const allMasteries = studentsWithMastery.flatMap((s) => s.skillMastery);
    const avgScore =
      allMasteries.length > 0
        ? Math.round(
            allMasteries.reduce((sum, m) => sum + m.masteryPercentage, 0) /
              allMasteries.length,
          )
        : 0;

    return {
      subjectProgress: subjectProgress.filter((s) => s !== null),
      heatMapData: heatMapData.filter((h) => h !== null),
      weeklyTrends: timeRange === 'week' ? trendData : [],
      monthlyTrends: timeRange === 'month' ? trendData : [],
      atRiskStudents,
      completionFunnel: {
        assigned,
        started,
        inProgress,
        completed,
        completionRate,
      },
      quickStats: {
        totalStudents: studentUserIds.length,
        activeThisWeek,
        tasksCompleted: completed,
        avgScore,
      },
    };
  }
}

