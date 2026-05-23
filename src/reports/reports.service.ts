import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  GenerateReportDto,
  ReportType,
  StudentReportData,
  ClassReportData,
  ParentFriendlyReportData,
} from './dto/report.dto';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Generate report based on type
   */
  async generateReport(dto: GenerateReportDto) {
    this.logger.log(`Generating ${dto.reportType} report`);

    switch (dto.reportType) {
      case ReportType.STUDENT:
        return this.generateStudentReport(dto);
      case ReportType.CLASS:
        return this.generateClassReport(dto);
      case ReportType.PARENT_FRIENDLY:
        return this.generateParentFriendlyReport(dto);
      case ReportType.CUSTOM:
        return this.generateCustomReport(dto);
      default:
        throw new Error('Invalid report type');
    }
  }

  /**
   * Generate Student Report
   */
  async generateStudentReport(dto: GenerateReportDto): Promise<StudentReportData> {
    if (!dto.studentId) {
      throw new Error('Student ID is required for student reports');
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const endDate = dto.endDate ? new Date(dto.endDate) : new Date();

    // Fetch student data
    const student = await this.prisma.user.findUnique({
      where: { id: dto.studentId },
      include: {
        studentProfile: {
          include: {
            yearGroup: true,
          },
        },
      },
    });

    if (!student || !student.studentProfile) {
      throw new NotFoundException('Student not found');
    }

    // Overall Progress
    const overallProgress = await this.calculateOverallProgress(dto.studentId, startDate, endDate);

    // Subject Breakdown
    const subjectBreakdown = await this.calculateSubjectBreakdown(dto.studentId, dto.subjectIds, startDate, endDate);

    // Diagnostic Tests
    const diagnosticTests = await this.getDiagnosticTestResults(dto.studentId, startDate, endDate);

    // Areas Needing Attention
    const areasNeedingAttention = await this.getAreasNeedingAttention(dto.studentId);

    // Engagement Metrics
    const engagement = await this.calculateEngagementMetrics(dto.studentId, startDate, endDate);

    // Teacher Comments
    const teacherComments = await this.getTeacherComments(dto.studentId, startDate, endDate);

    // Achievements
    const achievements = await this.getAchievements(dto.studentId, startDate, endDate);

    return {
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        yearGroup: student.studentProfile.yearGroup.displayName,
      },
      overallProgress,
      subjectBreakdown,
      diagnosticTests,
      areasNeedingAttention,
      engagement,
      teacherComments,
      achievements,
    };
  }

  /**
   * Generate Class Report
   */
  async generateClassReport(dto: GenerateReportDto): Promise<ClassReportData> {
    if (!dto.classId) {
      throw new Error('Class ID is required for class reports');
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = dto.endDate ? new Date(dto.endDate) : new Date();

    // Fetch class data
    const classData = await this.prisma.class.findUnique({
      where: { id: dto.classId },
      include: {
        yearGroup: true,
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

    if (!classData) {
      throw new NotFoundException('Class not found');
    }

    const studentIds = classData.classStudents.map((cs) => cs.studentProfile.userId);

    // Performance Overview
    const performanceOverview = await this.calculateClassPerformance(studentIds, startDate, endDate);

    // Subject Comparison
    const subjectComparison = await this.calculateSubjectComparison(studentIds, dto.subjectIds, startDate, endDate);

    // Engagement Statistics
    const engagementStatistics = await this.calculateClassEngagement(studentIds, startDate, endDate);

    // Top Performers
    const topPerformers = await this.getTopPerformers(studentIds, startDate, endDate);

    // Students At Risk
    const studentsAtRisk = await this.getStudentsAtRisk(studentIds);

    // Activity Completion
    const activityCompletion = await this.calculateActivityCompletion(studentIds, startDate, endDate);

    return {
      class: {
        id: classData.id,
        name: classData.name,
        yearGroup: classData.yearGroup?.displayName || 'N/A',
        totalStudents: studentIds.length,
      },
      performanceOverview,
      subjectComparison,
      engagementStatistics,
      topPerformers,
      studentsAtRisk,
      activityCompletion,
    };
  }

  /**
   * Generate Parent-Friendly Report
   */
  async generateParentFriendlyReport(dto: GenerateReportDto): Promise<ParentFriendlyReportData> {
    if (!dto.studentId) {
      throw new Error('Student ID is required for parent-friendly reports');
    }

    const studentReport = await this.generateStudentReport(dto);

    // Convert to parent-friendly format
    const overallStatus = this.calculateOverallStatus(studentReport.overallProgress.averageScore);

    const subjects = studentReport.subjectBreakdown.map((subject) => ({
      name: subject.subjectName,
      status: this.calculateOverallStatus(subject.averageScore),
      description: this.generateParentFriendlyDescription(subject),
      icon: this.getSubjectIcon(subject.subjectName),
    }));

    const keyAchievements = this.extractKeyAchievements(studentReport);
    const areasForGrowth = this.extractAreasForGrowth(studentReport);
    const homeSupport = this.generateHomeSupport(studentReport);
    const nextSteps = this.generateNextSteps(studentReport);

    return {
      student: {
        firstName: studentReport.student.firstName,
        lastName: studentReport.student.lastName,
        yearGroup: studentReport.student.yearGroup,
      },
      overallStatus,
      summary: this.generateParentSummary(studentReport, overallStatus),
      subjects,
      keyAchievements,
      areasForGrowth,
      homeSupport,
      nextSteps,
      teacherMessage: dto.teacherCommentary || this.generateDefaultTeacherMessage(overallStatus),
    };
  }

  /**
   * Generate Custom Report
   */
  async generateCustomReport(dto: GenerateReportDto) {
    // Build custom report based on selected metrics
    const reportData: any = {};

    if (dto.studentId) {
      const studentReport = await this.generateStudentReport(dto);
      
      // Filter based on selected metrics
      if (dto.metrics?.includes('progress')) {
        reportData.progress = studentReport.overallProgress;
      }
      if (dto.metrics?.includes('subjects')) {
        reportData.subjects = studentReport.subjectBreakdown;
      }
      if (dto.metrics?.includes('diagnostics')) {
        reportData.diagnostics = studentReport.diagnosticTests;
      }
      if (dto.metrics?.includes('engagement')) {
        reportData.engagement = studentReport.engagement;
      }
      if (dto.metrics?.includes('comments')) {
        reportData.comments = studentReport.teacherComments;
      }
    }

    if (dto.classId) {
      const classReport = await this.generateClassReport(dto);
      
      if (dto.metrics?.includes('class_performance')) {
        reportData.classPerformance = classReport.performanceOverview;
      }
      if (dto.metrics?.includes('subject_comparison')) {
        reportData.subjectComparison = classReport.subjectComparison;
      }
    }

    return reportData;
  }

  // ============================================
  // HELPER METHODS - DATA AGGREGATION
  // ============================================

  private async calculateOverallProgress(studentId: string, startDate: Date, endDate: Date) {
    const [submissions, plannedTasks, snapshots] = await Promise.all([
      this.prisma.submission.count({
        where: {
          userId: studentId,
          submittedAt: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.plannedTask.count({
        where: {
          plan: { userId: studentId },
          scheduledFor: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.progressSnapshot.findMany({
        where: {
          userId: studentId,
          date: { gte: startDate, lte: endDate },
        },
        orderBy: { date: 'desc' },
        take: 1,
      }),
    ]);

    const latestSnapshot = snapshots[0];

    return {
      averageScore: latestSnapshot?.averageScore || 0,
      completionRate: plannedTasks > 0 ? (submissions / plannedTasks) * 100 : 0,
      totalActivitiesCompleted: submissions,
      totalActivitiesAssigned: plannedTasks,
      weekStreak: latestSnapshot?.weekStreak || 0,
    };
  }

  private async calculateSubjectBreakdown(studentId: string, subjectIds: string[] | undefined, startDate: Date, endDate: Date) {
    const where: any = { userId: studentId };
    if (subjectIds && subjectIds.length > 0) {
      where.subjectId = { in: subjectIds };
    }

    const skillMasteries = await this.prisma.skillMastery.findMany({
      where,
      include: {
        subject: true,
        skill: true,
      },
    });

    const subjectMap = new Map<string, any>();

    for (const mastery of skillMasteries) {
      if (!subjectMap.has(mastery.subjectId)) {
        subjectMap.set(mastery.subjectId, {
          subjectId: mastery.subjectId,
          subjectName: mastery.subject.displayName,
          totalScore: 0,
          count: 0,
          timeSpent: 0,
          activitiesCompleted: 0,
        });
      }

      const subjectData = subjectMap.get(mastery.subjectId);
      subjectData.totalScore += mastery.masteryPercentage;
      subjectData.count++;
    }

    return Array.from(subjectMap.values()).map((subject) => ({
      ...subject,
      averageScore: subject.count > 0 ? subject.totalScore / subject.count : 0,
      masteryLevel: this.getMasteryLevel(subject.totalScore / subject.count),
      trend: 'stable' as 'up' | 'down' | 'stable',
    }));
  }

  private async getDiagnosticTestResults(studentId: string, startDate: Date, endDate: Date) {
    const assessments = await this.prisma.assessment.findMany({
      where: {
        userId: studentId,
        completedAt: { gte: startDate, lte: endDate },
      },
      include: {
        test: {
          include: {
            skill: true,
            subject: true,
          },
        },
        skillPerformances: true,
      },
      orderBy: { completedAt: 'desc' },
    });

    return assessments.map((assessment) => ({
      testId: assessment.testId,
      testName: assessment.test.title,
      date: assessment.completedAt.toISOString(),
      score: assessment.totalScore,
      skillPerformances: assessment.skillPerformances.map((sp) => ({
        skillName: assessment.test.skill.displayName,
        score: sp.score,
        performance: sp.performance,
      })),
    }));
  }

  private async getAreasNeedingAttention(studentId: string) {
    const skillGaps = await (this.prisma as any).skillGap.findMany({
      where: {
        studentId,
        isResolved: false,
      },
      take: 5,
      orderBy: { severity: 'desc' },
    });

    return skillGaps.map((gap: any) => ({
      subjectName: gap.subjectId,
      skillName: gap.skillId,
      currentLevel: gap.severity,
      recommendation: this.generateRecommendation(gap.severity),
    }));
  }

  private async calculateEngagementMetrics(studentId: string, startDate: Date, endDate: Date) {
    const sessions = await this.prisma.learningSession.findMany({
      where: {
        userId: studentId,
        startedAt: { gte: startDate, lte: endDate },
      },
    });

    const totalTimeSpent = sessions.reduce((sum, session) => sum + session.duration, 0);
    const lastSession = sessions.length > 0 ? sessions[sessions.length - 1] : null;

    return {
      totalTimeSpent,
      averageSessionDuration: sessions.length > 0 ? totalTimeSpent / sessions.length : 0,
      lastActive: lastSession?.startedAt.toISOString() || 'N/A',
      loginFrequency: sessions.length,
    };
  }

  private async getTeacherComments(studentId: string, startDate: Date, endDate: Date) {
    const notes = await (this.prisma as any).teacherNote.findMany({
      where: {
        studentId,
        createdAt: { gte: startDate, lte: endDate },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return notes.map((note: any) => ({
      date: note.createdAt.toISOString(),
      teacher: note.teacherId,
      comment: note.content,
      category: note.noteCategory,
    }));
  }

  private async getAchievements(studentId: string, startDate: Date, endDate: Date) {
    const userBadges = await this.prisma.userBadge.findMany({
      where: {
        userId: studentId,
        earnedAt: { gte: startDate, lte: endDate },
      },
      include: {
        badge: true,
      },
      orderBy: { earnedAt: 'desc' },
    });

    return userBadges.map((ub) => ({
      badgeName: ub.badge.displayName,
      earnedAt: ub.earnedAt.toISOString(),
      description: ub.badge.description,
    }));
  }

  private async calculateClassPerformance(studentIds: string[], startDate: Date, endDate: Date) {
    const snapshots = await this.prisma.progressSnapshot.findMany({
      where: {
        userId: { in: studentIds },
        date: { gte: startDate, lte: endDate },
      },
    });

    const totalScore = snapshots.reduce((sum, s) => sum + (s.averageScore || 0), 0);
    const totalCompletion = snapshots.reduce((sum, s) => sum + s.tasksCompleted, 0);
    const totalAssigned = snapshots.reduce((sum, s) => sum + s.tasksAssigned, 0);

    return {
      averageScore: snapshots.length > 0 ? totalScore / snapshots.length : 0,
      averageCompletionRate: totalAssigned > 0 ? (totalCompletion / totalAssigned) * 100 : 0,
      totalActivitiesCompleted: totalCompletion,
      averageEngagementScore: 75, // Placeholder
    };
  }

  private async calculateSubjectComparison(studentIds: string[], subjectIds: string[] | undefined, startDate: Date, endDate: Date) {
    const where: any = { userId: { in: studentIds } };
    if (subjectIds && subjectIds.length > 0) {
      where.subjectId = { in: subjectIds };
    }

    const skillMasteries = await this.prisma.skillMastery.findMany({
      where,
      include: {
        subject: true,
      },
    });

    const subjectMap = new Map<string, any>();

    for (const mastery of skillMasteries) {
      if (!subjectMap.has(mastery.subjectId)) {
        subjectMap.set(mastery.subjectId, {
          subjectName: mastery.subject.displayName,
          totalScore: 0,
          count: 0,
          struggling: 0,
          excelling: 0,
        });
      }

      const subjectData = subjectMap.get(mastery.subjectId);
      subjectData.totalScore += mastery.masteryPercentage;
      subjectData.count++;

      if (mastery.masteryPercentage < 50) subjectData.struggling++;
      if (mastery.masteryPercentage >= 80) subjectData.excelling++;
    }

    return Array.from(subjectMap.values()).map((subject) => ({
      subjectName: subject.subjectName,
      averageScore: subject.count > 0 ? subject.totalScore / subject.count : 0,
      completionRate: 75, // Placeholder
      studentsStruggling: subject.struggling,
      studentsExcelling: subject.excelling,
    }));
  }

  private async calculateClassEngagement(studentIds: string[], startDate: Date, endDate: Date) {
    const sessions = await this.prisma.learningSession.findMany({
      where: {
        userId: { in: studentIds },
        startedAt: { gte: startDate, lte: endDate },
      },
    });

    const activeStudents = new Set(sessions.map((s) => s.userId)).size;
    const totalTime = sessions.reduce((sum, s) => sum + s.duration, 0);

    return {
      averageTimeSpent: sessions.length > 0 ? totalTime / sessions.length : 0,
      activeStudents,
      inactiveStudents: studentIds.length - activeStudents,
      averageLoginFrequency: activeStudents > 0 ? sessions.length / activeStudents : 0,
    };
  }

  private async getTopPerformers(studentIds: string[], startDate: Date, endDate: Date) {
    const snapshots = await this.prisma.progressSnapshot.findMany({
      where: {
        userId: { in: studentIds },
        date: { gte: startDate, lte: endDate },
      },
      include: {
        user: true,
      },
      orderBy: { averageScore: 'desc' },
      take: 5,
    });

    return snapshots.map((s) => ({
      studentName: `${s.user.firstName} ${s.user.lastName}`,
      averageScore: s.averageScore || 0,
      completionRate: s.tasksAssigned > 0 ? (s.tasksCompleted / s.tasksAssigned) * 100 : 0,
    }));
  }

  private async getStudentsAtRisk(studentIds: string[]) {
    const skillGaps = await (this.prisma as any).skillGap.findMany({
      where: {
        studentId: { in: studentIds },
        isResolved: false,
        severity: { in: ['CRITICAL', 'SEVERE'] },
      },
      take: 10,
    });

    const studentMap = new Map<string, any>();

    for (const gap of skillGaps) {
      if (!studentMap.has(gap.studentId)) {
        studentMap.set(gap.studentId, {
          studentName: gap.studentId,
          averageScore: gap.percentageScore,
          areasOfConcern: [],
          lastActive: 'N/A',
        });
      }

      studentMap.get(gap.studentId).areasOfConcern.push(`${gap.skillId} (${gap.severity})`);
    }

    return Array.from(studentMap.values());
  }

  private async calculateActivityCompletion(studentIds: string[], startDate: Date, endDate: Date) {
    const tasks = await this.prisma.plannedTask.findMany({
      where: {
        plan: { userId: { in: studentIds } },
        scheduledFor: { gte: startDate, lte: endDate },
      },
    });

    return {
      completed: tasks.filter((t) => t.status === 'COMPLETED').length,
      inProgress: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
      notStarted: tasks.filter((t) => t.status === 'PENDING').length,
      overdue: 0, // Placeholder
    };
  }

  // ============================================
  // HELPER METHODS - FORMATTING
  // ============================================

  private calculateOverallStatus(averageScore: number): 'On Track' | 'Needs Support' | 'Strong' {
    if (averageScore >= 75) return 'Strong';
    if (averageScore >= 50) return 'On Track';
    return 'Needs Support';
  }

  private getMasteryLevel(percentage: number): string {
    if (percentage >= 80) return 'MASTERY';
    if (percentage >= 60) return 'SECURE';
    if (percentage >= 40) return 'DEVELOPING';
    return 'BEGINNER';
  }

  private generateRecommendation(severity: string): string {
    switch (severity) {
      case 'CRITICAL':
        return 'Immediate intervention required. Schedule one-on-one support sessions.';
      case 'SEVERE':
        return 'Targeted intervention needed. Assign additional practice activities.';
      case 'MODERATE':
        return 'Monitor progress. Provide scaffolded support as needed.';
      default:
        return 'Continue regular practice to build confidence.';
    }
  }

  private generateParentFriendlyDescription(subject: any): string {
    if (subject.averageScore >= 75) {
      return `${subject.subjectName} is a strength! Your child is performing well and showing good understanding.`;
    } else if (subject.averageScore >= 50) {
      return `${subject.subjectName} is progressing well. Your child is on track and developing their skills.`;
    } else {
      return `${subject.subjectName} needs some extra support. Additional practice at home would be beneficial.`;
    }
  }

  private getSubjectIcon(subjectName: string): string {
    const iconMap: Record<string, string> = {
      'English': '📚',
      'Maths': '🔢',
      'Science': '🔬',
      'History': '📜',
      'Geography': '🗺️',
    };
    return iconMap[subjectName] || '📖';
  }

  private extractKeyAchievements(report: StudentReportData): string[] {
    const achievements: string[] = [];

    if (report.overallProgress.weekStreak > 0) {
      achievements.push(`${report.overallProgress.weekStreak} week learning streak!`);
    }

    if (report.overallProgress.completionRate >= 80) {
      achievements.push('Excellent completion rate');
    }

    report.achievements.slice(0, 3).forEach((achievement) => {
      achievements.push(`Earned "${achievement.badgeName}" badge`);
    });

    return achievements.slice(0, 5);
  }

  private extractAreasForGrowth(report: StudentReportData) {
    return report.areasNeedingAttention.slice(0, 3).map((area) => ({
      area: area.skillName,
      suggestion: area.recommendation,
    }));
  }

  private generateHomeSupport(report: StudentReportData) {
    const recommendations: string[] = [
      'Set aside 15-20 minutes daily for practice',
      'Encourage completion of assigned activities',
      'Celebrate small wins and progress',
    ];

    const resources = [
      {
        title: 'Online Practice Resources',
        description: 'Khan Academy and BBC Bitesize offer free educational content',
      },
      {
        title: 'Reading Together',
        description: 'Spend 10 minutes reading together each evening',
      },
    ];

    return { recommendations, resources };
  }

  private generateNextSteps(report: StudentReportData): string[] {
    const steps: string[] = [];

    if (report.areasNeedingAttention.length > 0) {
      steps.push(`Focus on improving ${report.areasNeedingAttention[0].skillName}`);
    }

    steps.push('Continue regular practice sessions');
    steps.push('Complete upcoming diagnostic assessments');

    return steps;
  }

  private generateParentSummary(report: StudentReportData, status: string): string {
    const firstName = report.student.firstName;

    if (status === 'Strong') {
      return `${firstName} is doing excellently! They are showing strong performance across subjects and are engaged with their learning.`;
    } else if (status === 'On Track') {
      return `${firstName} is making good progress and is on track with their learning goals. Continue to encourage their efforts!`;
    } else {
      return `${firstName} is working hard but needs some extra support in certain areas. We're providing targeted help to address these needs.`;
    }
  }

  private generateDefaultTeacherMessage(status: string): string {
    if (status === 'Strong') {
      return 'Your child is demonstrating excellent progress and engagement. Keep up the great work!';
    } else if (status === 'On Track') {
      return 'Your child is making steady progress. Continue to support their learning at home.';
    } else {
      return 'We are working closely with your child to provide targeted support. Please encourage practice at home.';
    }
  }
}

