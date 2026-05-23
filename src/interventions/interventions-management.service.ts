import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  IdentifyGapsDto,
  CreateSkillGapDto,
  SkillGapDashboardDto,
} from './dto/identify-gaps.dto';
import {
  AssignInterventionDto,
  UpdateInterventionAssignmentDto,
  LogInterventionProgressDto,
  EscalateInterventionDto,
  BackfillAssignmentDto,
  InterventionStatus,
} from './dto/assign-intervention.dto';
import {
  CreateSkillGapAlertDto,
  UpdateAlertDto,
  GetAlertsDto,
} from './dto/alert.dto';

@Injectable()
export class InterventionsManagementService {
  private readonly logger = new Logger(InterventionsManagementService.name);

  constructor(private prisma: PrismaService) {}

  // ============================================
  // GAP IDENTIFICATION
  // ============================================

  /**
   * Automatically scan assessments and identify skill gaps
   * Triggered when students score <50% on skills
   */
  async scanAndIdentifyGaps(minScoreThreshold: number = 50) {
    this.logger.log(`Scanning for skill gaps with threshold ${minScoreThreshold}%`);

    // Get all recent assessments with scores below threshold
    const recentAssessments = await this.prisma.assessment.findMany({
      where: {
        totalScore: {
          lt: minScoreThreshold,
        },
        completedAt: {
          gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
        },
      },
      include: {
        test: {
          include: {
            subject: {
              include: {
                yearGroup: true,
              },
            },
            skill: true,
          },
        },
        user: {
          include: {
            studentProfile: true,
          },
        },
      },
    });

    const gapsCreated = [];

    for (const assessment of recentAssessments) {
      const severity = this.calculateSeverity(assessment.totalScore);

      // Check if gap already exists
      const existingGap = await this.prisma.skillGap.findUnique({
        where: {
          studentId_subjectId_skillId: {
            studentId: assessment.userId,
            subjectId: assessment.test.subjectId,
            skillId: assessment.test.skillId,
          },
        },
      });

      if (existingGap && !existingGap.isResolved) {
        // Update existing gap
        await this.prisma.skillGap.update({
          where: { id: existingGap.id },
          data: {
            severity,
            percentageScore: assessment.totalScore,
            assessmentId: assessment.id,
            lastDetected: new Date(),
          },
        });
      } else if (!existingGap || existingGap.isResolved) {
        // Create new gap
        const gap = await this.prisma.skillGap.create({
          data: {
            studentId: assessment.userId,
            subjectId: assessment.test.subjectId,
            skillId: assessment.test.skillId,
            yearGroupId: assessment.test.subject.yearGroupId,
            severity,
            percentageScore: assessment.totalScore,
            assessmentId: assessment.id,
          },
        });

        gapsCreated.push(gap);

        // Create automated alert
        await this.createAutomatedAlert(gap, assessment);
      }
    }

    this.logger.log(`Created ${gapsCreated.length} new skill gaps`);
    return gapsCreated;
  }

  /**
   * Calculate severity based on score
   */
  private calculateSeverity(score: number): any {
    if (score < 20) return 'CRITICAL';
    if (score < 30) return 'SEVERE';
    if (score < 40) return 'MODERATE';
    return 'MINOR';
  }

  /**
   * Get all skill gaps with filters
   */
  async getSkillGaps(filters: IdentifyGapsDto) {
    const where: any = {};

    if (filters.studentId) where.studentId = filters.studentId;
    if (filters.subjectId) where.subjectId = filters.subjectId;
    if (filters.skillId) where.skillId = filters.skillId;
    if (filters.severity) where.severity = filters.severity;
    if (filters.isResolved !== undefined) where.isResolved = filters.isResolved;

    // Handle class filter
    if (filters.classId) {
      const classStudents = await this.prisma.classStudent.findMany({
        where: { classId: filters.classId },
        select: { studentProfileId: true },
      });

      const studentProfiles = await this.prisma.studentProfile.findMany({
        where: {
          id: { in: classStudents.map((cs) => cs.studentProfileId) },
        },
        select: { userId: true },
      });

      where.studentId = {
        in: studentProfiles.map((sp) => sp.userId),
      };
    }

    return this.prisma.skillGap.findMany({
      where,
      include: {
        interventionAssignments: {
          include: {
            progressLogs: true,
          },
        },
        alerts: true,
      },
      orderBy: [
        { severity: 'desc' },
        { lastDetected: 'desc' },
      ],
    });
  }

  /**
   * Get students with gaps in a specific skill
   */
  async getStudentsWithSkillGaps(skillId: string, subjectId?: string) {
    const where: any = {
      skillId,
      isResolved: false,
    };

    if (subjectId) where.subjectId = subjectId;

    const gaps = await this.prisma.skillGap.findMany({
      where,
      include: {
        interventionAssignments: true,
      },
    });

    // Get student details
    const studentIds = gaps.map((g) => g.studentId);
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: studentIds },
      },
      include: {
        studentProfile: {
          include: {
            yearGroup: true,
          },
        },
      },
    });

    return gaps.map((gap) => {
      const user = users.find((u) => u.id === gap.studentId);
      return {
        ...gap,
        student: user,
      };
    });
  }

  /**
   * Create a skill gap manually
   */
  async createSkillGap(dto: CreateSkillGapDto) {
    // Check if already exists
    const existing = await this.prisma.skillGap.findUnique({
      where: {
        studentId_subjectId_skillId: {
          studentId: dto.studentId,
          subjectId: dto.subjectId,
          skillId: dto.skillId,
        },
      },
    });

    if (existing && !existing.isResolved) {
      throw new BadRequestException('An active skill gap already exists for this combination');
    }

    const gap = await this.prisma.skillGap.create({
      data: dto,
    });

    // Create alert
    await this.createAutomatedAlert(gap, null);

    return gap;
  }

  /**
   * Mark a skill gap as resolved
   */
  async resolveSkillGap(gapId: string) {
    return this.prisma.skillGap.update({
      where: { id: gapId },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
      },
    });
  }

  // ============================================
  // DASHBOARD & ANALYTICS
  // ============================================

  /**
   * Get skill gap dashboard data
   */
  async getSkillGapDashboard(filters: SkillGapDashboardDto) {
    const where: any = {
      isResolved: false,
    };

    // Apply filters
    if (filters.subjectId) where.subjectId = filters.subjectId;
    if (filters.yearGroupId) where.yearGroupId = filters.yearGroupId;

    // Handle class filter
    let studentIds: string[] | undefined;
    if (filters.classId) {
      const classStudents = await this.prisma.classStudent.findMany({
        where: { classId: filters.classId },
        select: { studentProfileId: true },
      });

      const studentProfiles = await this.prisma.studentProfile.findMany({
        where: {
          id: { in: classStudents.map((cs) => cs.studentProfileId) },
        },
        select: { userId: true },
      });

      studentIds = studentProfiles.map((sp) => sp.userId);
      where.studentId = { in: studentIds };
    }

    const gaps = await this.prisma.skillGap.findMany({
      where,
      include: {
        interventionAssignments: {
          where: {
            status: { in: ['PENDING', 'IN_PROGRESS'] },
          },
        },
      },
    });

    // Calculate most common gaps
    const gapsBySkill: Record<string, any> = {};
    for (const gap of gaps) {
      const key = `${gap.subjectId}-${gap.skillId}`;
      if (!gapsBySkill[key]) {
        gapsBySkill[key] = {
          subjectId: gap.subjectId,
          skillId: gap.skillId,
          count: 0,
          students: [],
          averageScore: 0,
          totalScore: 0,
        };
      }
      gapsBySkill[key].count++;
      gapsBySkill[key].students.push(gap.studentId);
      gapsBySkill[key].totalScore += gap.percentageScore;
      gapsBySkill[key].averageScore = gapsBySkill[key].totalScore / gapsBySkill[key].count;
    }

    const mostCommonGaps = Object.values(gapsBySkill)
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 10);

    // Students needing urgent intervention (CRITICAL or SEVERE)
    const urgentStudents = gaps.filter(
      (g) => g.severity === 'CRITICAL' || g.severity === 'SEVERE'
    );

    // Progress on interventions
    const activeInterventions = await this.prisma.interventionAssignment.findMany({
      where: {
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        ...(studentIds && { studentId: { in: studentIds } }),
      },
      include: {
        progressLogs: true,
      },
    });

    const interventionProgress = {
      total: activeInterventions.length,
      inProgress: activeInterventions.filter((i) => i.status === 'IN_PROGRESS').length,
      pending: activeInterventions.filter((i) => i.status === 'PENDING').length,
      averageCompletion: this.calculateAverageCompletion(activeInterventions),
    };

    return {
      totalGaps: gaps.length,
      gapsBySeverity: {
        critical: gaps.filter((g) => g.severity === 'CRITICAL').length,
        severe: gaps.filter((g) => g.severity === 'SEVERE').length,
        moderate: gaps.filter((g) => g.severity === 'MODERATE').length,
        minor: gaps.filter((g) => g.severity === 'MINOR').length,
      },
      mostCommonGaps,
      urgentStudents: urgentStudents.length,
      urgentStudentDetails: urgentStudents.slice(0, 20),
      interventionProgress,
      gaps,
    };
  }

  private calculateAverageCompletion(interventions: any[]): number {
    if (interventions.length === 0) return 0;

    const totalCompletion = interventions.reduce((sum, intervention) => {
      const totalLogs = intervention.progressLogs?.length || 0;
      const expectedLogs = intervention.microLessons?.length || 5;
      return sum + (totalLogs / expectedLogs) * 100;
    }, 0);

    return totalCompletion / interventions.length;
  }

  // ============================================
  // INTERVENTION ASSIGNMENT
  // ============================================

  /**
   * Assign targeted intervention to a student
   */
  async assignIntervention(dto: AssignInterventionDto) {
    const assignment = await this.prisma.interventionAssignment.create({
      data: {
        studentId: dto.studentId,
        teacherId: dto.teacherId,
        skillGapId: dto.skillGapId,
        interventionId: dto.interventionId,
        title: dto.title,
        description: dto.description,
        targetSubjectId: dto.targetSubjectId,
        targetSkillId: dto.targetSkillId,
        targetYearGroupId: dto.targetYearGroupId,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        microLessons: dto.microLessons ? JSON.parse(JSON.stringify(dto.microLessons)) : undefined,
        activities: dto.activities ? JSON.parse(JSON.stringify(dto.activities)) : undefined,
        preScore: dto.preScore,
        status: 'PENDING',
      },
    });

    this.logger.log(`Assigned intervention ${assignment.id} to student ${dto.studentId}`);

    // Create notification/alert for the student
    // (Could be expanded with a notification system)

    return assignment;
  }

  /**
   * Force backfill assignment - Year 8 student works on Year 6 content
   */
  async assignBackfill(dto: BackfillAssignmentDto) {
    const student = await this.prisma.user.findUnique({
      where: { id: dto.studentId },
      include: { studentProfile: { include: { yearGroup: true } } },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const targetYearGroup = await this.prisma.yearGroup.findUnique({
      where: { id: dto.targetYearGroupId },
    });

    if (!targetYearGroup) {
      throw new NotFoundException('Target year group not found');
    }

    // Get activities from the target year group for the skill
    const activities = await this.prisma.activity.findMany({
      where: {
        subject: {
          yearGroupId: dto.targetYearGroupId,
        },
        skillId: dto.skillId,
      },
      take: 5,
    });

    const title = `Backfill: ${targetYearGroup.displayName} ${dto.reason}`;
    const description = `This intervention focuses on foundational skills from ${targetYearGroup.displayName} to strengthen your understanding.`;

    return this.assignIntervention({
      studentId: dto.studentId,
      teacherId: dto.teacherId,
      targetSubjectId: dto.subjectId,
      targetSkillId: dto.skillId,
      targetYearGroupId: dto.targetYearGroupId,
      title,
      description,
      priority: dto.priority,
      dueDate: dto.dueDate,
      activities: activities.map((a) => a.id),
    });
  }

  /**
   * Get all intervention assignments with filters
   */
  async getInterventionAssignments(filters: {
    studentId?: string;
    teacherId?: string;
    status?: string;
    priority?: string;
  }) {
    const where: any = {};

    if (filters.studentId) where.studentId = filters.studentId;
    if (filters.teacherId) where.teacherId = filters.teacherId;
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;

    return this.prisma.interventionAssignment.findMany({
      where,
      include: {
        skillGap: true,
        intervention: true,
        progressLogs: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [
        { priority: 'desc' },
        { assignedAt: 'desc' },
      ],
    });
  }

  /**
   * Get intervention assignment by ID
   */
  async getInterventionAssignment(id: string) {
    const assignment = await this.prisma.interventionAssignment.findUnique({
      where: { id },
      include: {
        skillGap: true,
        intervention: true,
        progressLogs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Intervention assignment not found');
    }

    return assignment;
  }

  /**
   * Update intervention assignment
   */
  async updateInterventionAssignment(
    id: string,
    dto: UpdateInterventionAssignmentDto,
  ) {
    const assignment = await this.getInterventionAssignment(id);

    // Calculate improvement if postScore is provided
    let improvementPercentage: number | undefined;
    if (dto.postScore !== undefined && assignment.preScore) {
      improvementPercentage =
        ((dto.postScore - assignment.preScore) / assignment.preScore) * 100;
    }

    // Auto-complete if post score is good
    let status = dto.status;
    if (dto.postScore && dto.postScore >= 70 && !status) {
      status = InterventionStatus.COMPLETED;
    }

    return this.prisma.interventionAssignment.update({
      where: { id },
      data: {
        ...dto,
        ...(status && { status }),
        ...(improvementPercentage !== undefined && { improvementPercentage }),
        ...(status === InterventionStatus.COMPLETED && { completedAt: new Date() }),
      },
    });
  }

  /**
   * Log progress on an intervention
   */
  async logInterventionProgress(dto: LogInterventionProgressDto) {
    const assignment = await this.getInterventionAssignment(dto.assignmentId);

    const progressLog = await this.prisma.interventionProgressLog.create({
      data: {
        assignmentId: dto.assignmentId,
        activityCompleted: dto.activityCompleted,
        score: dto.score,
        timeSpent: dto.timeSpent,
        notes: dto.notes,
        wasSuccessful: dto.wasSuccessful,
      },
    });

    // Update assignment totals
    await this.prisma.interventionAssignment.update({
      where: { id: dto.assignmentId },
      data: {
        attemptsCount: { increment: 1 },
        timeSpent: { increment: dto.timeSpent },
        status: assignment.status === 'PENDING' ? 'IN_PROGRESS' : assignment.status,
        ...(assignment.startedAt === null && { startedAt: new Date() }),
      },
    });

    // Check if intervention is failing and needs escalation
    const allLogs = await this.prisma.interventionProgressLog.findMany({
      where: { assignmentId: dto.assignmentId },
    });

    const recentFailures = allLogs
      .slice(-5)
      .filter((log) => !log.wasSuccessful).length;

    if (recentFailures >= 3) {
      await this.autoEscalateIntervention(dto.assignmentId, 'Multiple failed attempts');
    }

    return progressLog;
  }

  /**
   * Escalate an intervention
   */
  async escalateIntervention(dto: EscalateInterventionDto) {
    return this.prisma.interventionAssignment.update({
      where: { id: dto.assignmentId },
      data: {
        status: 'ESCALATED',
        escalationLevel: { increment: 1 },
        escalatedAt: new Date(),
        escalationNotes: dto.escalationNotes,
      },
    });
  }

  /**
   * Auto-escalate an intervention when it fails
   */
  private async autoEscalateIntervention(assignmentId: string, reason: string) {
    this.logger.warn(`Auto-escalating intervention ${assignmentId}: ${reason}`);

    return this.escalateIntervention({
      assignmentId,
      reason,
      escalationNotes: `Automatically escalated: ${reason}`,
    });
  }

  // ============================================
  // ALERTS
  // ============================================

  /**
   * Create automated alert for skill gap
   */
  private async createAutomatedAlert(gap: any, assessment: any) {
    // Find the student's teachers
    const studentProfile = await this.prisma.studentProfile.findUnique({
      where: { userId: gap.studentId },
      include: {
        classStudents: {
          include: {
            class: {
              include: {
                classTeachers: {
                  include: {
                    teacherProfile: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const teacherIds = studentProfile?.classStudents
      .flatMap((cs) => cs.class.classTeachers)
      .map((ct) => ct.teacherProfile.userId) || [];

    // Create alerts for each teacher
    for (const teacherId of teacherIds) {
      await this.createAlert({
        skillGapId: gap.id,
        studentId: gap.studentId,
        teacherId,
        message: `Student scored ${gap.percentageScore}% on assessment - ${gap.severity} gap detected`,
      });
    }
  }

  /**
   * Create an alert
   */
  async createAlert(dto: CreateSkillGapAlertDto) {
    return this.prisma.skillGapAlert.create({
      data: dto,
    });
  }

  /**
   * Get alerts with filters
   */
  async getAlerts(filters: GetAlertsDto) {
    const where: any = {};

    if (filters.teacherId) where.teacherId = filters.teacherId;
    if (filters.studentId) where.studentId = filters.studentId;
    if (filters.unreadOnly) where.isRead = false;

    return this.prisma.skillGapAlert.findMany({
      where,
      include: {
        skillGap: {
          include: {
            interventionAssignments: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Update alert
   */
  async updateAlert(id: string, dto: UpdateAlertDto) {
    return this.prisma.skillGapAlert.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.isRead && { readAt: new Date() }),
      },
    });
  }

  /**
   * Mark alert as read
   */
  async markAlertAsRead(id: string) {
    return this.updateAlert(id, { isRead: true });
  }

  /**
   * Snooze alert
   */
  async snoozeAlert(id: string, until: Date) {
    return this.updateAlert(id, {
      isSnoozed: true,
      snoozedUntil: until.toISOString(),
    });
  }
}

