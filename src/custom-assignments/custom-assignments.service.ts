import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { CreateCustomAssignmentDto } from './dto/create-custom-assignment.dto';
import { UpdateCustomAssignmentDto } from './dto/update-custom-assignment.dto';
import { AssignToStudentsDto, ShareAssignmentDto } from './dto/assign-to-students.dto';
import { AssignmentStatus, AssignmentVisibility } from '@prisma/client';

@Injectable()
export class CustomAssignmentsService {
  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) {}

  /**
   * Generate a custom assignment using AI
   */
  async generateAssignment(
    dto: CreateCustomAssignmentDto,
    userId: string,
  ) {
    // Validate subject and year group if provided
    if (dto.subjectId) {
      const subject = await this.prisma.subject.findUnique({
        where: { id: dto.subjectId },
        include: { yearGroup: true },
      });

      if (!subject) {
        throw new NotFoundException('Subject not found');
      }
    }

    if (dto.yearGroupId) {
      const yearGroup = await this.prisma.yearGroup.findUnique({
        where: { id: dto.yearGroupId },
      });

      if (!yearGroup) {
        throw new NotFoundException('Year group not found');
      }
    }

    // Build enhanced prompt with context
    const enhancedPrompt = this.buildEnhancedPrompt(dto);

    // Generate content using AI
    const aiResponse = await this.aiService.generateCompletion({
      prompt: enhancedPrompt,
      maxTokens: 3000,
      temperature: 0.7,
    });

    // Parse AI response to structured format
    const content = this.parseAIResponse(aiResponse, dto);

    // Generate title if not provided
    const title = dto.title || this.generateTitle(dto);

    // Create assignment
    const assignment = await this.prisma.customAssignment.create({
      data: {
        title,
        description: dto.description,
        aiPrompt: dto.aiPrompt,
        subjectId: dto.subjectId,
        yearGroupId: dto.yearGroupId,
        topic: dto.topic,
        difficulty: dto.difficulty,
        duration: dto.duration,
        questionCount: dto.questionCount,
        content,
        generationModel: 'gpt-5.5', // or get from config
        createdById: userId,
        status: AssignmentStatus.DRAFT,
        visibility: AssignmentVisibility.PRIVATE,
      },
      include: {
        subject: true,
        yearGroup: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    // Add tags if provided
    if (dto.tags && dto.tags.length > 0) {
      await this.prisma.customAssignmentTag.createMany({
        data: dto.tags.map(tag => ({
          assignmentId: assignment.id,
          tag: tag.toLowerCase(),
        })),
      });
    }

    return assignment;
  }

  /**
   * Get all assignments (with filters)
   */
  async getAllAssignments(filters: {
    createdById?: string;
    subjectId?: string;
    yearGroupId?: string;
    status?: AssignmentStatus;
    visibility?: AssignmentVisibility;
    tag?: string;
    search?: string;
  }) {
    const where: any = {};

    if (filters.createdById) {
      where.createdById = filters.createdById;
    }

    if (filters.subjectId) {
      where.subjectId = filters.subjectId;
    }

    if (filters.yearGroupId) {
      where.yearGroupId = filters.yearGroupId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.visibility) {
      where.visibility = filters.visibility;
    }

    if (filters.tag) {
      where.tags = {
        some: {
          tag: filters.tag.toLowerCase(),
        },
      };
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { topic: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const assignments = await this.prisma.customAssignment.findMany({
      where,
      include: {
        subject: true,
        yearGroup: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        tags: true,
        _count: {
          select: {
            assignedTo: true,
            sharedWith: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return assignments;
  }

  /**
   * Get shared assignments (assignments shared with current user)
   */
  async getSharedAssignments(userId: string) {
    const sharedAssignments = await this.prisma.customAssignmentShare.findMany({
      where: { sharedWithId: userId },
      include: {
        assignment: {
          include: {
            subject: true,
            yearGroup: true,
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            tags: true,
          },
        },
        sharedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return sharedAssignments.map(sa => ({
      ...sa.assignment,
      sharedBy: sa.sharedBy,
      canEdit: sa.canEdit,
      sharedAt: sa.sharedAt,
    }));
  }

  /**
   * Get a specific assignment
   */
  async getAssignment(assignmentId: string, userId: string) {
    const assignment = await this.prisma.customAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        subject: true,
        yearGroup: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        tags: true,
        assignedTo: {
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        sharedWith: {
          include: {
            sharedWith: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    // Check access permissions
    const hasAccess = await this.checkAccess(assignmentId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this assignment');
    }

    return assignment;
  }

  /**
   * Update an assignment
   */
  async updateAssignment(
    assignmentId: string,
    dto: UpdateCustomAssignmentDto,
    userId: string,
  ) {
    const assignment = await this.prisma.customAssignment.findUnique({
      where: { id: assignmentId },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    // Check if user can edit
    const canEdit = await this.checkEditPermission(assignmentId, userId);
    if (!canEdit) {
      throw new ForbiddenException('You do not have permission to edit this assignment');
    }

    const updateData: any = {};

    if (dto.title) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.difficulty) updateData.difficulty = dto.difficulty;
    if (dto.status) {
      updateData.status = dto.status;
      if (dto.status === AssignmentStatus.PUBLISHED && !assignment.publishedAt) {
        updateData.publishedAt = new Date();
      }
    }
    if (dto.visibility) updateData.visibility = dto.visibility;
    if (dto.duration) updateData.duration = dto.duration;
    if (dto.isTemplate !== undefined) updateData.isTemplate = dto.isTemplate;

    // Update assignment
    const updatedAssignment = await this.prisma.customAssignment.update({
      where: { id: assignmentId },
      data: updateData,
      include: {
        subject: true,
        yearGroup: true,
        tags: true,
      },
    });

    // Update tags if provided
    if (dto.tags) {
      // Delete existing tags
      await this.prisma.customAssignmentTag.deleteMany({
        where: { assignmentId },
      });

      // Create new tags
      if (dto.tags.length > 0) {
        await this.prisma.customAssignmentTag.createMany({
          data: dto.tags.map(tag => ({
            assignmentId,
            tag: tag.toLowerCase(),
          })),
        });
      }
    }

    return updatedAssignment;
  }

  /**
   * Delete an assignment
   */
  async deleteAssignment(assignmentId: string, userId: string) {
    const assignment = await this.prisma.customAssignment.findUnique({
      where: { id: assignmentId },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    if (assignment.createdById !== userId) {
      throw new ForbiddenException('You can only delete assignments you created');
    }

    await this.prisma.customAssignment.delete({
      where: { id: assignmentId },
    });

    return { message: 'Assignment deleted successfully' };
  }

  /**
   * Assign to students
   */
  async assignToStudents(
    assignmentId: string,
    dto: AssignToStudentsDto,
    userId: string,
  ) {
    const assignment = await this.prisma.customAssignment.findUnique({
      where: { id: assignmentId },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    const canEdit = await this.checkEditPermission(assignmentId, userId);
    if (!canEdit) {
      throw new ForbiddenException('You do not have permission to assign this');
    }

    // Verify students exist
    const students = await this.prisma.user.findMany({
      where: {
        id: { in: dto.studentIds },
        role: 'STUDENT',
      },
    });

    if (students.length !== dto.studentIds.length) {
      throw new BadRequestException('One or more student IDs are invalid');
    }

    // Create assignments
    const assignments = await Promise.all(
      dto.studentIds.map(studentId =>
        this.prisma.customAssignmentStudent.upsert({
          where: {
            assignmentId_studentId: {
              assignmentId,
              studentId,
            },
          },
          create: {
            assignmentId,
            studentId,
            dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          },
          update: {
            dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          },
        })
      )
    );

    // Increment usage count
    await this.prisma.customAssignment.update({
      where: { id: assignmentId },
      data: {
        usageCount: { increment: 1 },
      },
    });

    return {
      message: `Assignment assigned to ${assignments.length} students`,
      assignments,
    };
  }

  /**
   * Share assignment with other teachers
   */
  async shareAssignment(
    assignmentId: string,
    dto: ShareAssignmentDto,
    userId: string,
  ) {
    const assignment = await this.prisma.customAssignment.findUnique({
      where: { id: assignmentId },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    if (assignment.createdById !== userId) {
      throw new ForbiddenException('You can only share assignments you created');
    }

    // Verify teachers exist
    const teachers = await this.prisma.user.findMany({
      where: {
        id: { in: dto.teacherIds },
        role: { in: ['TEACHER', 'ADMIN'] },
      },
    });

    if (teachers.length !== dto.teacherIds.length) {
      throw new BadRequestException('One or more teacher IDs are invalid');
    }

    // Create shares
    const shares = await Promise.all(
      dto.teacherIds.map(teacherId =>
        this.prisma.customAssignmentShare.upsert({
          where: {
            assignmentId_sharedWithId: {
              assignmentId,
              sharedWithId: teacherId,
            },
          },
          create: {
            assignmentId,
            sharedWithId: teacherId,
            sharedById: userId,
            canEdit: dto.canEdit || false,
          },
          update: {
            canEdit: dto.canEdit || false,
          },
        })
      )
    );

    return {
      message: `Assignment shared with ${shares.length} teachers`,
      shares,
    };
  }

  /**
   * Get assignment statistics
   */
  async getAssignmentStats(assignmentId: string, userId: string) {
    const hasAccess = await this.checkAccess(assignmentId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this assignment');
    }

    const assignments = await this.prisma.customAssignmentStudent.findMany({
      where: { assignmentId },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    const total = assignments.length;
    const completed = assignments.filter(a => a.completedAt).length;
    const averageScore = assignments.filter(a => a.score !== null).length > 0
      ? assignments
          .filter(a => a.score !== null)
          .reduce((sum, a) => sum + a.score!, 0) / assignments.filter(a => a.score !== null).length
      : null;

    const averageTimeSpent = assignments.filter(a => a.timeSpent !== null).length > 0
      ? assignments
          .filter(a => a.timeSpent !== null)
          .reduce((sum, a) => sum + a.timeSpent!, 0) / assignments.filter(a => a.timeSpent !== null).length
      : null;

    return {
      total,
      completed,
      pending: total - completed,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      averageScore: averageScore ? Math.round(averageScore * 10) / 10 : null,
      averageTimeSpent: averageTimeSpent ? Math.round(averageTimeSpent) : null,
      assignments: assignments.map(a => ({
        student: a.student,
        assignedAt: a.assignedAt,
        dueDate: a.dueDate,
        completedAt: a.completedAt,
        score: a.score,
        timeSpent: a.timeSpent,
      })),
    };
  }

  // Helper methods

  private buildEnhancedPrompt(dto: CreateCustomAssignmentDto): string {
    let prompt = dto.aiPrompt;

    // Add context
    const context: string[] = [];

    if (dto.questionCount) {
      context.push(`Number of questions: ${dto.questionCount}`);
    }

    if (dto.difficulty) {
      context.push(`Difficulty level: ${dto.difficulty}`);
    }

    if (dto.duration) {
      context.push(`Estimated duration: ${dto.duration} minutes`);
    }

    if (dto.topic) {
      context.push(`Topic: ${dto.topic}`);
    }

    if (context.length > 0) {
      prompt += '\n\nAdditional requirements:\n- ' + context.join('\n- ');
    }

    // Add formatting instructions
    prompt += '\n\nPlease format the response as a JSON object with the following structure:';
    prompt += '\n{';
    prompt += '\n  "questions": [';
    prompt += '\n    {';
    prompt += '\n      "question": "Question text",';
    prompt += '\n      "type": "multiple-choice" | "short-answer" | "essay" | "true-false",';
    prompt += '\n      "options": ["Option A", "Option B", "Option C", "Option D"], // for MCQ';
    prompt += '\n      "correctAnswer": "Answer or index",';
    prompt += '\n      "explanation": "Explanation of the answer",';
    prompt += '\n      "points": 1';
    prompt += '\n    }';
    prompt += '\n  ],';
    prompt += '\n  "instructions": "General instructions for students"';
    prompt += '\n}';

    return prompt;
  }

  private parseAIResponse(aiResponse: string, dto: CreateCustomAssignmentDto): any {
    try {
      // Try to parse as JSON
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback: create structured format from text
      return {
        rawContent: aiResponse,
        questions: [],
        instructions: 'Please complete the following assignment.',
      };
    } catch (error) {
      // If parsing fails, store as raw content
      return {
        rawContent: aiResponse,
        questions: [],
        instructions: 'Please complete the following assignment.',
      };
    }
  }

  private generateTitle(dto: CreateCustomAssignmentDto): string {
    const parts: string[] = [];

    if (dto.topic) {
      parts.push(dto.topic);
    }

    if (dto.questionCount) {
      parts.push(`${dto.questionCount} Questions`);
    } else {
      parts.push('Assignment');
    }

    return parts.join(' - ');
  }

  private async checkAccess(assignmentId: string, userId: string): Promise<boolean> {
    const assignment = await this.prisma.customAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        sharedWith: {
          where: { sharedWithId: userId },
        },
      },
    });

    if (!assignment) {
      return false;
    }

    // Owner has access
    if (assignment.createdById === userId) {
      return true;
    }

    // Shared with user
    if (assignment.sharedWith.length > 0) {
      return true;
    }

    // Public assignments
    if (assignment.visibility === AssignmentVisibility.PUBLIC) {
      return true;
    }

    // Shared with school
    if (assignment.visibility === AssignmentVisibility.SHARED_WITH_SCHOOL) {
      // TODO: Add school/organization check
      return true;
    }

    return false;
  }

  private async checkEditPermission(assignmentId: string, userId: string): Promise<boolean> {
    const assignment = await this.prisma.customAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        sharedWith: {
          where: {
            sharedWithId: userId,
            canEdit: true,
          },
        },
      },
    });

    if (!assignment) {
      return false;
    }

    // Owner can edit
    if (assignment.createdById === userId) {
      return true;
    }

    // Shared with edit permission
    if (assignment.sharedWith.length > 0) {
      return true;
    }

    return false;
  }
}

