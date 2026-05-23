import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ParentViewService {
  constructor(private prisma: PrismaService) {}

  /**
   * Generate weekly summary for parents
   */
  async generateWeeklySummary(studentId: string, weekStart: Date, weekEnd: Date) {
    // Get student info
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      include: {
        studentProfile: {
          include: {
            yearGroup: true,
          },
        },
      },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    // Get sessions for the week
    const sessions = await (this.prisma as any).learningSession.findMany({
      where: {
        userId: studentId,
        startedAt: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
      include: {
        sessionItems: true,
      },
    });

    // Calculate total study time
    const totalStudyMinutes = sessions.reduce((sum, session) => sum + session.duration, 0);

    // Get subject performance
    const masteryData = await this.prisma.skillMastery.findMany({
      where: { userId: studentId },
      include: {
        subject: {
          select: {
            id: true,
            displayName: true,
          },
        },
        skill: {
          select: {
            displayName: true,
          },
        },
      },
    });

    // Group by subject
    const subjectSummaries = this.generateSubjectSummaries(masteryData);

    // Generate recommendations
    const recommendations = this.generateRecommendations(masteryData, totalStudyMinutes);

    // Generate highlights
    const highlights = this.generateHighlights(sessions, masteryData);

    // Save summary
    const summary = await (this.prisma as any).parentSummary.create({
      data: {
        studentId,
        weekStart,
        weekEnd,
        totalStudyMinutes,
        sessionsCompleted: sessions.filter((s) => s.status === 'completed').length,
        subjectSummaries,
        recommendations,
        highlights,
      },
    });

    return summary;
  }

  /**
   * Get latest parent summary for a student
   */
  async getLatestSummary(studentId: string) {
    return (this.prisma as any).parentSummary.findFirst({
      where: { studentId },
      orderBy: { generatedAt: 'desc' },
    });
  }

  /**
   * Get parent summary for a specific week
   */
  async getWeeklySummary(studentId: string, weekStart: Date) {
    return (this.prisma as any).parentSummary.findUnique({
      where: {
        studentId_weekStart: {
          studentId,
          weekStart,
        },
      },
    });
  }

  /**
   * Generate subject summaries with friendly status
   */
  private generateSubjectSummaries(masteryData: any[]) {
    const bySubject: Record<string, any> = {};

    masteryData.forEach((m) => {
      const subjectId = m.subject.id;
      if (!bySubject[subjectId]) {
        bySubject[subjectId] = {
          subjectName: m.subject.displayName,
          skills: [],
          averageMastery: 0,
        };
      }

      bySubject[subjectId].skills.push({
        skillName: m.skill.displayName,
        masteryPercentage: m.masteryPercentage,
      });
    });

    // Calculate averages and determine status
    const summaries: Record<string, any> = {};

    Object.entries(bySubject).forEach(([subjectId, data]: [string, any]) => {
      const total = data.skills.reduce(
        (sum: number, skill: any) => sum + skill.masteryPercentage,
        0,
      );
      const average = total / data.skills.length;

      let status = 'ON_TRACK';
      let message = `${data.subjectName} is progressing well.`;

      if (average >= 80) {
        status = 'STRONG';
        message = `Excellent progress in ${data.subjectName}!`;
      } else if (average < 50) {
        status = 'NEEDS_SUPPORT';
        message = `${data.subjectName} could use some extra practice.`;
      }

      summaries[data.subjectName] = {
        status,
        message,
        averageMastery: Math.round(average),
      };
    });

    return summaries;
  }

  /**
   * Generate friendly recommendations for parents
   */
  private generateRecommendations(masteryData: any[], totalStudyMinutes: number): string[] {
    const recommendations: string[] = [];

    // Time-based recommendations
    if (totalStudyMinutes < 60) {
      recommendations.push(
        'This week, try to encourage 2-3 short learning sessions (10-15 minutes each).',
      );
    } else if (totalStudyMinutes > 180) {
      recommendations.push(
        'Great dedication this week! Make sure to balance study time with rest and play.',
      );
    }

    // Subject-based recommendations
    const weakSubjects = masteryData
      .reduce((acc, m) => {
        if (!acc[m.subject.id]) {
          acc[m.subject.id] = {
            name: m.subject.displayName,
            total: 0,
            count: 0,
          };
        }
        acc[m.subject.id].total += m.masteryPercentage;
        acc[m.subject.id].count++;
        return acc;
      }, {} as Record<string, any>);

    Object.values(weakSubjects).forEach((subject: any) => {
      const avg = subject.total / subject.count;
      if (avg < 50) {
        recommendations.push(
          `Your child is working hard on ${subject.name}. A short practice pack could help build confidence.`,
        );
      }
    });

    // Positive encouragement
    recommendations.push('Keep celebrating small wins and progress together!');

    return recommendations.slice(0, 4); // Limit to 4 recommendations
  }

  /**
   * Generate positive highlights to share with parents
   */
  private generateHighlights(sessions: any[], masteryData: any[]): string[] {
    const highlights: string[] = [];

    // Session completion highlights
    if (sessions.length >= 3) {
      highlights.push(`Completed ${sessions.length} learning sessions this week! 🎉`);
    }

    // Consistency highlight
    const sessionDates = new Set(
      sessions.map((s) => s.startedAt.toISOString().split('T')[0]),
    );
    if (sessionDates.size >= 3) {
      highlights.push('Practiced on multiple days - great consistency!');
    }

    // Mastery highlights
    const masteryAchievements = masteryData.filter(
      (m) => m.masteryLevel === 'MASTERY' || m.masteryLevel === 'SECURE',
    );

    if (masteryAchievements.length > 0) {
      const randomSkill =
        masteryAchievements[Math.floor(Math.random() * masteryAchievements.length)];
      highlights.push(`Strong performance in ${randomSkill.skill.displayName}!`);
    }

    // Effort highlight
    const totalAttempts = masteryData.reduce((sum, m) => sum + m.totalAttempts, 0);
    if (totalAttempts > 20) {
      highlights.push('Showing great effort and persistence in learning!');
    }

    return highlights.slice(0, 3); // Limit to 3 highlights
  }

  /**
   * Get simple overview for parent
   */
  async getParentOverview(studentId: string) {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: {
        firstName: true,
        lastName: true,
        studentProfile: {
          include: {
            yearGroup: true,
          },
        },
      },
    });

    const masteryData = await this.prisma.skillMastery.findMany({
      where: { userId: studentId },
      include: {
        subject: {
          select: {
            displayName: true,
          },
        },
      },
    });

    const subjectSummaries = this.generateSubjectSummaries(masteryData);

    // Get recent sessions (last 7 days)
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);

    const recentSessions = await (this.prisma as any).learningSession.findMany({
      where: {
        userId: studentId,
        startedAt: { gte: lastWeek },
      },
    });

    const totalStudyMinutes = recentSessions.reduce((sum, s) => sum + s.duration, 0);

    return {
      student: {
        name: `${student?.firstName} ${student?.lastName}`,
        yearGroup: student?.studentProfile?.yearGroup.displayName,
      },
      thisWeek: {
        sessionsCompleted: recentSessions.filter((s) => s.status === 'completed').length,
        totalStudyMinutes,
      },
      subjects: subjectSummaries,
    };
  }
}

