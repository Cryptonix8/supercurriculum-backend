import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { TeacherControlsService } from './teacher-controls.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CreateTeacherNoteDto,
  UpdateTeacherNoteDto,
  GetTeacherNotesDto,
} from './dto/teacher-note.dto';

@ApiTags('Teacher Controls')
@Controller('teacher-controls')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TeacherControlsController {
  constructor(private readonly teacherControlsService: TeacherControlsService) {}

  /**
   * Get students at risk
   */
  @Get('students-at-risk')
  async getStudentsAtRisk(@Req() req: any) {
    return this.teacherControlsService.getStudentsAtRisk(req.user.id);
  }

  /**
   * Get intervention suggestions for a student
   */
  @Get('student/:studentId/intervention-suggestions')
  async getInterventionSuggestions(@Param('studentId') studentId: string) {
    return this.teacherControlsService.getInterventionSuggestions(studentId);
  }

  /**
   * Create an override
   */
  @Post('override')
  async createOverride(
    @Req() req: any,
    @Body()
    data: {
      studentId: string;
      subjectId?: string;
      skillId?: string;
      overrideType: string;
      settings: any;
      reason?: string;
      expiresAt?: string;
    },
  ) {
    return this.teacherControlsService.createOverride({
      teacherId: req.user.id,
      studentId: data.studentId,
      subjectId: data.subjectId,
      skillId: data.skillId,
      overrideType: data.overrideType,
      settings: data.settings,
      reason: data.reason,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    });
  }

  /**
   * Create a backfill override
   */
  @Post('override/backfill')
  async createBackfillOverride(
    @Req() req: any,
    @Body()
    data: {
      studentId: string;
      subjectId: string;
      skillId: string;
      targetYearGroup: string;
      reason: string;
    },
  ) {
    return this.teacherControlsService.createBackfillOverride({
      teacherId: req.user.id,
      ...data,
    });
  }

  /**
   * Get student overrides
   */
  @Get('student/:studentId/overrides')
  async getStudentOverrides(@Param('studentId') studentId: string) {
    return this.teacherControlsService.getStudentOverrides(studentId);
  }

  /**
   * Deactivate an override
   */
  @Delete('override/:overrideId')
  async deactivateOverride(@Param('overrideId') overrideId: string) {
    return this.teacherControlsService.deactivateOverride(overrideId);
  }

  /**
   * Add a note about a student
   */
  @Post('note')
  async addNote(
    @Req() req: any,
    @Body()
    data: {
      studentId: string;
      subjectId?: string;
      skillId?: string;
      noteType: string;
      content: string;
      isVisibleToStudent?: boolean;
      isVisibleToParent?: boolean;
    },
  ) {
    return this.teacherControlsService.addNote({
      teacherId: req.user.id,
      ...data,
    });
  }

  /**
   * Get notes for a student
   */
  @Get('student/:studentId/notes')
  async getStudentNotes(@Req() req: any, @Param('studentId') studentId: string) {
    return this.teacherControlsService.getStudentNotes(studentId, req.user.id);
  }

  /**
   * Assign a template to a student
   */
  @Post('assign-template')
  async assignTemplate(
    @Req() req: any,
    @Body()
    data: {
      studentId: string;
      templateName: string;
      subjectId: string;
      skillId?: string;
      customSettings?: any;
    },
  ) {
    return this.teacherControlsService.assignTemplate({
      teacherId: req.user.id,
      ...data,
    });
  }

  // ============================================
  // TEACHER NOTES - ENHANCED
  // ============================================

  /**
   * Create a teacher note
   */
  @Post('notes')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @ApiOperation({ summary: 'Create a teacher note about a student' })
  @ApiResponse({ status: 201, description: 'Note created successfully' })
  async createTeacherNote(@Body() dto: CreateTeacherNoteDto) {
    return this.teacherControlsService.createTeacherNote(dto);
  }

  /**
   * Get teacher notes with filters
   */
  @Get('notes')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @ApiOperation({ summary: 'Get teacher notes with filters' })
  @ApiResponse({ status: 200, description: 'Notes retrieved successfully' })
  async getTeacherNotes(@Query() filters: GetTeacherNotesDto) {
    return this.teacherControlsService.getTeacherNotes(filters);
  }

  /**
   * Get a specific teacher note
   */
  @Get('notes/:noteId')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @ApiOperation({ summary: 'Get a specific teacher note by ID' })
  @ApiResponse({ status: 200, description: 'Note retrieved successfully' })
  async getTeacherNoteById(@Param('noteId') noteId: string) {
    return this.teacherControlsService.getTeacherNoteById(noteId);
  }

  /**
   * Update a teacher note
   */
  @Patch('notes/:noteId')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @ApiOperation({ summary: 'Update a teacher note' })
  @ApiResponse({ status: 200, description: 'Note updated successfully' })
  async updateTeacherNote(
    @Param('noteId') noteId: string,
    @Body() dto: UpdateTeacherNoteDto,
  ) {
    return this.teacherControlsService.updateTeacherNote(noteId, dto);
  }

  /**
   * Delete a teacher note
   */
  @Delete('notes/:noteId')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @ApiOperation({ summary: 'Delete a teacher note' })
  @ApiResponse({ status: 200, description: 'Note deleted successfully' })
  async deleteTeacherNote(@Param('noteId') noteId: string) {
    return this.teacherControlsService.deleteTeacherNote(noteId);
  }

  /**
   * Get notes flagged for follow-up
   */
  @Get('notes/follow-up/pending')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @ApiOperation({ summary: 'Get notes flagged for follow-up' })
  @ApiResponse({ status: 200, description: 'Follow-up notes retrieved' })
  async getFollowUpNotes(@Req() req: any) {
    return this.teacherControlsService.getFollowUpNotes(req.user.id);
  }

  /**
   * Mark follow-up as completed
   */
  @Patch('notes/:noteId/complete-follow-up')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @ApiOperation({ summary: 'Mark follow-up as completed' })
  @ApiResponse({ status: 200, description: 'Follow-up marked as completed' })
  async completeFollowUp(@Param('noteId') noteId: string) {
    return this.teacherControlsService.completeFollowUp(noteId);
  }

  /**
   * Add attachment to a note
   */
  @Post('notes/:noteId/attachments')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @ApiOperation({ summary: 'Add attachment to a note' })
  @ApiResponse({ status: 201, description: 'Attachment added successfully' })
  async addAttachment(
    @Param('noteId') noteId: string,
    @Body()
    attachment: {
      url: string;
      filename: string;
      fileType: string;
      uploadedAt: string;
    },
  ) {
    return this.teacherControlsService.addAttachment(noteId, attachment);
  }

  /**
   * Remove attachment from a note
   */
  @Delete('notes/:noteId/attachments')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @ApiOperation({ summary: 'Remove attachment from a note' })
  @ApiResponse({ status: 200, description: 'Attachment removed successfully' })
  async removeAttachment(
    @Param('noteId') noteId: string,
    @Body('attachmentUrl') attachmentUrl: string,
  ) {
    return this.teacherControlsService.removeAttachment(noteId, attachmentUrl);
  }
}

