import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTeacherNoteDto,
  UpdateTeacherNoteDto,
  GetTeacherNotesDto,
} from './dto/teacher-note.dto';

@Injectable()
export class TeacherControlsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a teacher override for a student
   */
  async createOverride(params: {
    teacherId: string;
    studentId: string;
    subjectId?: string;
    skillId?: string;
    overrideType: string;
    settings: any;
    reason?: string;
    expiresAt?: Date;
  }) {
    const { teacherId, studentId, subjectId, skillId, overrideType, settings, reason, expiresAt } =
      params;

    return (this.prisma as any).teacherOverride.create({
      data: {
        teacherId,
        studentId,
        subjectId,
        skillId,
        overrideType,
        settings,
        reason,
        expiresAt,
      },
    });
  }

  /**
   * Get active overrides for a student
   */
  async getStudentOverrides(studentId: string) {
    return (this.prisma as any).teacherOverride.findMany({
      where: {
        studentId,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Deactivate an override
   */
  async deactivateOverride(overrideId: string) {
    return (this.prisma as any).teacherOverride.update({
      where: { id: overrideId },
      data: { isActive: false },
    });
  }

  /**
   * Create a backfill override (force student to work on older year content)
   */
  async createBackfillOverride(params: {
    teacherId: string;
    studentId: string;
    subjectId: string;
    skillId: string;
    targetYearGroup: string;
    reason: string;
  }) {
    return this.createOverride({
      teacherId: params.teacherId,
      studentId: params.studentId,
      subjectId: params.subjectId,
      skillId: params.skillId,
      overrideType: 'backfill',
      settings: {
        targetYearGroup: params.targetYearGroup,
        focusAreas: ['remedial_practice'],
      },
      reason: params.reason,
    });
  }

  // ============================================
  // TEACHER NOTES - ENHANCED
  // ============================================

  /**
   * Create a teacher note about a student
   */
  async createTeacherNote(dto: CreateTeacherNoteDto) {
    return (this.prisma as any).teacherNote.create({
      data: {
        teacherId: dto.teacherId,
        studentId: dto.studentId,
        subjectId: dto.subjectId,
        skillId: dto.skillId,
        noteCategory: dto.noteCategory,
        noteType: dto.noteType,
        content: dto.content,
        isVisibleToStudent: dto.isVisibleToStudent || false,
        isVisibleToParent: dto.isVisibleToParent || false,
        flaggedForFollowUp: dto.flaggedForFollowUp || false,
        followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : null,
        attachments: dto.attachments || [],
        tags: dto.tags || [],
      },
    });
  }

  /**
   * Update a teacher note
   */
  async updateTeacherNote(noteId: string, dto: UpdateTeacherNoteDto) {
    const note = await (this.prisma as any).teacherNote.findUnique({
      where: { id: noteId },
    });

    if (!note) {
      throw new NotFoundException('Teacher note not found');
    }

    return (this.prisma as any).teacherNote.update({
      where: { id: noteId },
      data: {
        ...dto,
        ...(dto.followUpDate && { followUpDate: new Date(dto.followUpDate) }),
      },
    });
  }

  /**
   * Get teacher notes with filters
   */
  async getTeacherNotes(filters: GetTeacherNotesDto) {
    const where: any = {};

    if (filters.studentId) where.studentId = filters.studentId;
    if (filters.teacherId) where.teacherId = filters.teacherId;
    if (filters.subjectId) where.subjectId = filters.subjectId;
    if (filters.skillId) where.skillId = filters.skillId;
    if (filters.noteCategory) where.noteCategory = filters.noteCategory;
    if (filters.noteType) where.noteType = filters.noteType;
    if (filters.flaggedForFollowUp !== undefined)
      where.flaggedForFollowUp = filters.flaggedForFollowUp;
    if (filters.followUpCompleted !== undefined)
      where.followUpCompleted = filters.followUpCompleted;
    if (filters.visibleToStudentOnly)
      where.isVisibleToStudent = true;

    return (this.prisma as any).teacherNote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a single teacher note by ID
   */
  async getTeacherNoteById(noteId: string) {
    const note = await (this.prisma as any).teacherNote.findUnique({
      where: { id: noteId },
    });

    if (!note) {
      throw new NotFoundException('Teacher note not found');
    }

    return note;
  }

  /**
   * Delete a teacher note
   */
  async deleteTeacherNote(noteId: string) {
    const note = await (this.prisma as any).teacherNote.findUnique({
      where: { id: noteId },
    });

    if (!note) {
      throw new NotFoundException('Teacher note not found');
    }

    return (this.prisma as any).teacherNote.delete({
      where: { id: noteId },
    });
  }

  /**
   * Get notes flagged for follow-up
   */
  async getFollowUpNotes(teacherId?: string) {
    const where: any = {
      flaggedForFollowUp: true,
      followUpCompleted: false,
    };

    if (teacherId) {
      where.teacherId = teacherId;
    }

    return (this.prisma as any).teacherNote.findMany({
      where,
      orderBy: { followUpDate: 'asc' },
    });
  }

  /**
   * Mark follow-up as completed
   */
  async completeFollowUp(noteId: string) {
    return (this.prisma as any).teacherNote.update({
      where: { id: noteId },
      data: {
        followUpCompleted: true,
      },
    });
  }

  /**
   * Add attachment to a note
   */
  async addAttachment(
    noteId: string,
    attachment: {
      url: string;
      filename: string;
      fileType: string;
      uploadedAt: string;
    },
  ) {
    const note = await this.getTeacherNoteById(noteId);
    const attachments = (note.attachments || []) as any[];
    attachments.push(attachment);

    return (this.prisma as any).teacherNote.update({
      where: { id: noteId },
      data: {
        attachments,
      },
    });
  }

  /**
   * Remove attachment from a note
   */
  async removeAttachment(noteId: string, attachmentUrl: string) {
    const note = await this.getTeacherNoteById(noteId);
    const attachments = ((note.attachments || []) as any[]).filter(
      (a: any) => a.url !== attachmentUrl,
    );

    return (this.prisma as any).teacherNote.update({
      where: { id: noteId },
      data: {
        attachments,
      },
    });
  }

  // Legacy method for backward compatibility
  async addNote(params: {
    teacherId: string;
    studentId: string;
    subjectId?: string;
    skillId?: string;
    noteType: string;
    content: string;
    isVisibleToStudent?: boolean;
    isVisibleToParent?: boolean;
  }) {
    return this.createTeacherNote({
      ...params,
      noteCategory: 'GENERAL' as any,
    });
  }

  // Legacy method for backward compatibility
  async getStudentNotes(studentId: string, teacherId?: string) {
    return this.getTeacherNotes({ studentId, teacherId });
  }

  /**
   * Get students at risk (with skill gaps)
   */
  async getStudentsAtRisk(teacherId: string) {
    // Get all students with low mastery levels
    const studentsWithLowMastery = await this.prisma.skillMastery.findMany({
      where: {
        masteryPercentage: { lt: 50 },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        subject: {
          select: {
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

    // Group by student
    const byStudent: Record<string, any> = {};

    studentsWithLowMastery.forEach((mastery) => {
      const studentId = mastery.userId;

      if (!byStudent[studentId]) {
        byStudent[studentId] = {
          studentId,
          studentName: `${mastery.user.firstName} ${mastery.user.lastName}`,
          email: mastery.user.email,
          skillGaps: [],
          averageMastery: 0,
        };
      }

      byStudent[studentId].skillGaps.push({
        subject: mastery.subject.displayName,
        skill: mastery.skill.displayName,
        masteryPercentage: mastery.masteryPercentage,
      });
    });

    // Calculate average mastery for each student
    Object.values(byStudent).forEach((student: any) => {
      const total = student.skillGaps.reduce(
        (sum: number, gap: any) => sum + gap.masteryPercentage,
        0,
      );
      student.averageMastery = Math.round((total / student.skillGaps.length) * 10) / 10;
      student.gapCount = student.skillGaps.length;
    });

    // Sort by gap count and average mastery
    return Object.values(byStudent).sort((a: any, b: any) => {
      if (b.gapCount !== a.gapCount) {
        return b.gapCount - a.gapCount;
      }
      return a.averageMastery - b.averageMastery;
    });
  }

  /**
   * Generate intervention suggestions for a student
   */
  async getInterventionSuggestions(studentId: string) {
    const skillGaps = await this.prisma.skillMastery.findMany({
      where: {
        userId: studentId,
        masteryPercentage: { lt: 50 },
      },
      include: {
        subject: {
          select: {
            id: true,
            displayName: true,
          },
        },
        skill: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
      orderBy: {
        masteryPercentage: 'asc',
      },
      take: 5, // Top 5 weakest skills
    });

    return skillGaps.map((gap) => ({
      subjectId: gap.subject.id,
      subjectName: gap.subject.displayName,
      skillId: gap.skill.id,
      skillName: gap.skill.displayName,
      currentMastery: gap.masteryPercentage,
      suggestion: this.generateSuggestion(gap),
    }));
  }

  /**
   * Generate a suggestion for a skill gap
   */
  private generateSuggestion(gap: any): string {
    const skillName = gap.skill.displayName;
    const mastery = gap.masteryPercentage;

    if (mastery < 30) {
      return `Recommend intensive ${skillName} intervention pack (Level 1 - Foundations)`;
    } else if (mastery < 50) {
      return `Assign ${skillName} practice pack (Level 2 - Building Confidence)`;
    } else {
      return `Continue regular ${skillName} practice to build towards secure mastery`;
    }
  }

  /**
   * Assign a custom activity template to a student
   */
  async assignTemplate(params: {
    teacherId: string;
    studentId: string;
    templateName: string;
    subjectId: string;
    skillId?: string;
    customSettings?: any;
  }) {
    const { teacherId, studentId, templateName, subjectId, skillId, customSettings } = params;

    // This creates an override that tells the AI Tutor to use this template
    return this.createOverride({
      teacherId,
      studentId,
      subjectId,
      skillId,
      overrideType: 'custom_template',
      settings: {
        templateName,
        customSettings: customSettings || {},
      },
      reason: `Teacher assigned template: ${templateName}`,
    });
  }
}

