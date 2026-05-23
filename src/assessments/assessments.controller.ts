import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AssessmentsService } from './assessments.service';
import { SubmitAssessmentDto } from './dto/submit-assessment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Assessments')
@Controller('assessments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AssessmentsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Post('submit')
  @ApiOperation({ summary: 'Submit assessment answers' })
  @ApiResponse({ status: 201, description: 'Assessment submitted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid submission' })
  async submitAssessment(@Body() submitAssessmentDto: SubmitAssessmentDto) {
    return this.assessmentsService.submitAssessment(submitAssessmentDto);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get assessment history for current user' })
  @ApiResponse({ status: 200, description: 'Assessment history retrieved' })
  getHistory(
    @Request() req,
    @Query('subjectId') subjectId?: string,
  ) {
    return this.assessmentsService.getAssessmentHistory(req.user.id, subjectId);
  }

  @Get('bands')
  @ApiOperation({ summary: 'Get current bands for all subjects/skills' })
  @ApiResponse({ status: 200, description: 'Student bands retrieved' })
  getBands(@Request() req) {
    return this.assessmentsService.getStudentBands(req.user.id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get assessment statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved' })
  getStats(@Request() req) {
    return this.assessmentsService.getAssessmentStats(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get specific assessment details' })
  @ApiResponse({ status: 200, description: 'Assessment found' })
  @ApiResponse({ status: 404, description: 'Assessment not found' })
  getAssessment(@Param('id') id: string, @Request() req) {
    return this.assessmentsService.getAssessment(id, req.user.id);
  }
}
