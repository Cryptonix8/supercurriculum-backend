import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SubmissionsService } from './submissions.service';
import { SubmitTaskDto } from './dto/submit-task.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Submissions')
@Controller('submissions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit task work' })
  @ApiResponse({ status: 201, description: 'Task submitted successfully' })
  @ApiResponse({ status: 404, description: 'Activity not found' })
  submitTask(@Body() submitTaskDto: SubmitTaskDto) {
    return this.submissionsService.submitTask(submitTaskDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get my submissions' })
  @ApiResponse({ status: 200, description: 'Submissions retrieved' })
  getMySubmissions(
    @Request() req,
    @Query('subjectId') subjectId?: string,
    @Query('skillId') skillId?: string,
    @Query('activityId') activityId?: string,
  ) {
    return this.submissionsService.getSubmissions(req.user.id, {
      subjectId,
      skillId,
      activityId,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get submission statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved' })
  getStats(@Request() req) {
    return this.submissionsService.getSubmissionStats(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get specific submission' })
  @ApiResponse({ status: 200, description: 'Submission found' })
  @ApiResponse({ status: 404, description: 'Submission not found' })
  getSubmission(@Param('id') id: string, @Request() req) {
    return this.submissionsService.getSubmission(id, req.user.id);
  }

  @Patch(':id/teacher-comment')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @ApiOperation({ summary: 'Add teacher comment (Teacher/Admin)' })
  @ApiResponse({ status: 200, description: 'Comment added' })
  addTeacherComment(
    @Param('id') id: string,
    @Body('comment') comment: string,
    @Request() req,
  ) {
    return this.submissionsService.addTeacherComment(id, comment, req.user.id);
  }

  @Post(':id/regenerate-feedback')
  @ApiOperation({ summary: 'Regenerate AI feedback for submission' })
  @ApiResponse({ status: 200, description: 'Feedback regenerated' })
  regenerateFeedback(@Param('id') id: string, @Request() req) {
    return this.submissionsService.regenerateFeedback(id, req.user.id);
  }
}
