import { Controller, Get, Post, Body, Param, UseGuards, Req, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TeachersService } from './teachers.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Teachers')
@Controller('teachers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TEACHER', 'ADMIN')
@ApiBearerAuth()
export class TeachersController {
  constructor(private teachersService: TeachersService) {}

  /**
   * Get my students
   * GET /api/teachers/students
   */
  @Get('students')
  @ApiOperation({ summary: 'Get all students assigned to teacher' })
  async getMyStudents(@Req() req) {
    return this.teachersService.getMyStudents(req.user.id);
  }

  /**
   * Get class overview
   * GET /api/teachers/class-overview
   */
  @Get('class-overview')
  @ApiOperation({ summary: 'Get overview of all classes' })
  async getClassOverview(@Req() req) {
    return this.teachersService.getClassOverview(req.user.id);
  }

  /**
   * Get student progress
   * GET /api/teachers/students/:studentId/progress
   */
  @Get('students/:studentId/progress')
  @ApiOperation({ summary: 'Get detailed progress for specific student' })
  async getStudentProgress(@Req() req, @Param('studentId') studentId: string) {
    return this.teachersService.getStudentProgress(req.user.id, studentId);
  }

  /**
   * Add comment to submission
   * POST /api/teachers/submissions/:submissionId/comment
   */
  @Post('submissions/:submissionId/comment')
  @ApiOperation({ summary: 'Add teacher comment to student submission' })
  async addComment(
    @Req() req,
    @Param('submissionId') submissionId: string,
    @Body('comment') comment: string,
  ) {
    return this.teachersService.addCommentToSubmission(
      req.user.id,
      submissionId,
      comment,
    );
  }

  // ============================================
  // DASHBOARD ENDPOINTS
  // ============================================

  /**
   * Get dashboard statistics
   * GET /api/teachers/dashboard/stats
   */
  @Get('dashboard/stats')
  @ApiOperation({ summary: 'Get teacher dashboard statistics' })
  async getDashboardStats(@Req() req) {
    return this.teachersService.getDashboardStats(req.user.id);
  }

  /**
   * Get recent activity feed
   * GET /api/teachers/dashboard/activity
   */
  @Get('dashboard/activity')
  @ApiOperation({ summary: 'Get recent student activity' })
  async getRecentActivity(
    @Req() req,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.teachersService.getRecentActivity(req.user.id, limitNum);
  }

  /**
   * Get students at risk
   * GET /api/teachers/dashboard/at-risk
   */
  @Get('dashboard/at-risk')
  @ApiOperation({ summary: 'Get list of students at risk' })
  async getStudentsAtRisk(@Req() req) {
    return this.teachersService.getStudentsAtRisk(req.user.id);
  }

  /**
   * Get subject performance overview
   * GET /api/teachers/dashboard/subject-performance
   */
  @Get('dashboard/subject-performance')
  @ApiOperation({ summary: 'Get performance overview by subject' })
  async getSubjectPerformance(@Req() req) {
    return this.teachersService.getSubjectPerformance(req.user.id);
  }
}

