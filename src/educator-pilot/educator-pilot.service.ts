import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EducatorPilotService {
  constructor(private prisma: PrismaService) {}

  async createClassInvite(educatorId: string, classId: string, expiresAt?: string) {
    await this.ensureEducatorCanManageClass(educatorId, classId);

    const code = this.generateInviteCode();
    const finalExpiry = expiresAt
      ? new Date(expiresAt)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invite = await (this.prisma as any).classInvite.create({
      data: {
        classId,
        code,
        isActive: true,
        expiresAt: finalExpiry,
      },
      include: {
        class: {
          select: { id: true, name: true },
        },
      },
    });

    await this.logAction(educatorId, 'INVITE_CREATED', {
      classId,
      inviteId: invite.id,
    });

    return invite;
  }

  async redeemInvite(studentId: string, code: string) {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      include: { studentProfile: true },
    });

    if (!student || student.role !== 'STUDENT' || !student.studentProfile) {
      throw new ForbiddenException('Only students can redeem educator invite codes');
    }

    const invite = await (this.prisma as any).classInvite.findUnique({
      where: { code },
      include: { class: true },
    });

    if (!invite || !invite.isActive) {
      throw new NotFoundException('Invalid invite code');
    }

    if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
      throw new BadRequestException('Invite code has expired');
    }

    await this.prisma.classStudent.upsert({
      where: {
        classId_studentProfileId: {
          classId: invite.classId,
          studentProfileId: student.studentProfile.id,
        },
      },
      create: {
        classId: invite.classId,
        studentProfileId: student.studentProfile.id,
      },
      update: {},
    });

    const classTeachers = await this.prisma.classTeacher.findMany({
      where: { classId: invite.classId },
      include: { teacherProfile: true },
    });

    for (const ct of classTeachers) {
      await this.logAction(ct.teacherProfile.userId, 'INVITE_REDEEMED', {
        classId: invite.classId,
        studentId,
      });
    }

    return {
      success: true,
      classId: invite.classId,
      className: invite.class.name,
      message: 'Invite redeemed and educator link created',
    };
  }

  async getStudentSnapshot(educatorId: string, studentId: string) {
    const canAccess = await this.canEducatorAccessStudent(educatorId, studentId);
    if (!canAccess) {
      throw new ForbiddenException('You are not linked to this student');
    }

    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      include: {
        studentProfile: true,
      },
    });

    if (!student || !student.studentProfile) {
      throw new NotFoundException('Student not found');
    }

    await this.logAction(educatorId, 'STUDENT_PROFILE_VIEWED', { studentId });

    const progressSharingEnabled = student.studentProfile.shareProgressMetrics !== false;
    const chatSharingEnabled = student.studentProfile.shareChatTranscripts === true;

    if (!progressSharingEnabled) {
      return {
        student: {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
        },
        privacy: {
          shareProgressMetrics: false,
          shareChatTranscripts: chatSharingEnabled,
        },
        message: 'Student has disabled progress metric sharing',
      };
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sessions = await this.prisma.learningSession.findMany({
      where: {
        userId: studentId,
        startedAt: { gte: thirtyDaysAgo },
      },
      select: {
        duration: true,
        startedAt: true,
        status: true,
      },
    });

    const mastery = await this.prisma.skillMastery.findMany({
      where: { userId: studentId },
      include: {
        subject: { select: { id: true, displayName: true } },
        skill: { select: { id: true, displayName: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const diagnosticPerf = await this.prisma.diagnosticSkillPerformance.findMany({
      where: {
        assessment: { userId: studentId },
      },
      select: {
        errorTags: true,
      },
      take: 200,
    });

    const recentSubmissions = await this.prisma.submission.findMany({
      where: { userId: studentId },
      orderBy: { submittedAt: 'desc' },
      take: 10,
      select: { aiFeedback: true },
    });

    const totalMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);
    const activeDays = new Set(
      sessions.map((s) => new Date(s.startedAt).toISOString().split('T')[0]),
    ).size;

    const topicsBySubject: Record<string, any> = {};
    mastery.forEach((row) => {
      const subjectName = row.subject.displayName;
      if (!topicsBySubject[subjectName]) {
        topicsBySubject[subjectName] = [];
      }
      topicsBySubject[subjectName].push({
        topic: row.skill.displayName,
        masteryPercentage: Math.round(row.masteryPercentage),
        masteryLevel: row.masteryLevel,
        lastPracticed: row.lastPracticed,
      });
    });

    const errorCounts: Record<string, number> = {};
    for (const perf of diagnosticPerf) {
      for (const tag of perf.errorTags || []) {
        errorCounts[tag] = (errorCounts[tag] || 0) + 1;
      }
    }

    const commonMistakes = Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));

    const nextSteps = recentSubmissions
      .map((s: any) => s.aiFeedback?.nextStep)
      .filter(Boolean)
      .slice(0, 3);

    return {
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
      },
      privacy: {
        shareProgressMetrics: true,
        shareChatTranscripts: chatSharingEnabled,
      },
      activitySummary: {
        sessionsLast30Days: sessions.length,
        totalMinutesLast30Days: totalMinutes,
        consistencyDaysLast30Days: activeDays,
      },
      topicProgress: topicsBySubject,
      masterySignals: {
        averageMastery: mastery.length
          ? Math.round(
              mastery.reduce((sum, m) => sum + m.masteryPercentage, 0) / mastery.length,
            )
          : 0,
      },
      commonMistakes,
      tutorRecommendedNext: nextSteps,
    };
  }

  async assignTopicPractice(educatorId: string, payload: {
    studentId: string;
    subjectId: string;
    topic: string;
    chapter?: string;
    targetExercises: number;
    dueDate?: string;
    note?: string;
  }) {
    const canAccess = await this.canEducatorAccessStudent(educatorId, payload.studentId);
    if (!canAccess) {
      throw new ForbiddenException('You are not linked to this student');
    }

    if (payload.targetExercises < 1) {
      throw new BadRequestException('targetExercises must be at least 1');
    }

    const dueDate = payload.dueDate ? new Date(payload.dueDate) : new Date();
    const weekStart = this.getWeekStart(dueDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    let plan = await this.prisma.weeklyPlan.findFirst({
      where: {
        userId: payload.studentId,
        weekStart: { gte: weekStart, lte: weekEnd },
      },
    });

    if (!plan) {
      plan = await this.prisma.weeklyPlan.create({
        data: {
          userId: payload.studentId,
          weekStart,
          weekEnd,
          status: 'ACTIVE',
        },
      });
    }

    const orderIndex = await this.prisma.plannedTask.count({
      where: { planId: plan.id },
    });

    const task = await this.prisma.plannedTask.create({
      data: {
        planId: plan.id,
        scheduledFor: dueDate,
        orderIndex,
        status: 'PENDING',
        activityData: {
          assignmentType: 'EDUCATOR_PRACTICE',
          educatorId,
          subjectId: payload.subjectId,
          topic: payload.topic,
          chapter: payload.chapter || null,
          targetExercises: payload.targetExercises,
          note: payload.note || null,
          title: `Practice: ${payload.topic}`,
          instructions: `Complete ${payload.targetExercises} exercises on ${payload.topic}${payload.chapter ? ` (${payload.chapter})` : ''}.`,
        },
      },
    });

    if (payload.note) {
      await (this.prisma as any).teacherNote.create({
        data: {
          studentId: payload.studentId,
          teacherId: educatorId,
          subjectId: payload.subjectId,
          noteCategory: 'ACADEMIC',
          noteType: 'assignment_note',
          content: payload.note,
          isVisibleToStudent: true,
          isVisibleToParent: false,
          tags: ['educator_assignment'],
        },
      });
    }

    await this.logAction(educatorId, 'TOPIC_ASSIGNMENT_CREATED', {
      studentId: payload.studentId,
      plannedTaskId: task.id,
      subjectId: payload.subjectId,
      topic: payload.topic,
      chapter: payload.chapter || null,
      targetExercises: payload.targetExercises,
      dueDate: dueDate.toISOString(),
    });

    return {
      success: true,
      assignment: task,
    };
  }

  async getMyAssignments(studentId: string) {
    const tasks = await (this.prisma as any).plannedTask.findMany({
      where: {
        plan: { userId: studentId },
        activityData: {
          path: ['assignmentType'],
          equals: 'EDUCATOR_PRACTICE',
        },
      },
      orderBy: { scheduledFor: 'asc' },
    });

    return tasks.map((task) => {
      const data = (task.activityData || {}) as any;
      return {
        id: task.id,
        status: task.status,
        dueDate: task.scheduledFor,
        completedAt: task.completedAt,
        title: data.title || 'Educator assignment',
        topic: data.topic || null,
        chapter: data.chapter || null,
        targetExercises: data.targetExercises || null,
        note: data.note || null,
        subjectId: data.subjectId || null,
      };
    });
  }

  async completeMyAssignment(studentId: string, taskId: string) {
    const task = await (this.prisma as any).plannedTask.findFirst({
      where: {
        id: taskId,
        plan: { userId: studentId },
        activityData: {
          path: ['assignmentType'],
          equals: 'EDUCATOR_PRACTICE',
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Assignment not found');
    }

    return this.prisma.plannedTask.update({
      where: { id: taskId },
      data: {
        status: 'COMPLETED',
        startedAt: task.startedAt || new Date(),
        completedAt: new Date(),
      },
    });
  }

  private async ensureEducatorCanManageClass(educatorId: string, classId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: educatorId },
      include: { teacherProfile: true },
    });

    if (!user || !['TEACHER', 'ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Only educators can manage class invites');
    }

    if (user.role === 'ADMIN') {
      return;
    }

    if (!user.teacherProfile) {
      throw new ForbiddenException('Teacher profile not found');
    }

    const link = await this.prisma.classTeacher.findFirst({
      where: {
        classId,
        teacherProfileId: user.teacherProfile.id,
      },
    });

    if (!link) {
      throw new ForbiddenException('You do not manage this class');
    }
  }

  private async canEducatorAccessStudent(educatorId: string, studentId: string) {
    const educator = await this.prisma.user.findUnique({
      where: { id: educatorId },
      include: { teacherProfile: true },
    });

    if (!educator || !['TEACHER', 'ADMIN'].includes(educator.role)) {
      return false;
    }

    if (educator.role === 'ADMIN') {
      return true;
    }

    if (!educator.teacherProfile) {
      return false;
    }

    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      include: { studentProfile: true },
    });

    if (!student?.studentProfile) {
      return false;
    }

    const classTeacherLinks = await this.prisma.classTeacher.findMany({
      where: { teacherProfileId: educator.teacherProfile.id },
      select: { classId: true },
    });
    const classIds = classTeacherLinks.map((row) => row.classId);
    if (!classIds.length) {
      return false;
    }

    const classStudentLink = await this.prisma.classStudent.findFirst({
      where: {
        classId: { in: classIds },
        studentProfileId: student.studentProfile.id,
      },
    });

    return !!classStudentLink;
  }

  private async logAction(
    educatorId: string,
    action: string,
    metadata?: Record<string, unknown>,
    studentId?: string,
    classId?: string,
  ) {
    await (this.prisma as any).educatorAuditLog.create({
      data: {
        educatorId,
        studentId: studentId || (metadata?.studentId as string | undefined) || null,
        classId: classId || (metadata?.classId as string | undefined) || null,
        action,
        metadata: metadata || {},
      },
    });
  }

  private generateInviteCode() {
    return randomBytes(4).toString('hex').toUpperCase();
  }

  private getWeekStart(date: Date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
  }
}
