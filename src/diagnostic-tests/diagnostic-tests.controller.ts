import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiBearerAuth, 
  ApiOperation, 
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { DiagnosticTestsService } from './diagnostic-tests.service';
import { CreateDiagnosticTestScheduleDto } from './dto/create-diagnostic-test-schedule.dto';
import { UpdateDiagnosticTestScheduleDto } from './dto/update-diagnostic-test-schedule.dto';
import { DiagnosticTestAnalyticsQueryDto } from './dto/diagnostic-test-analytics.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DiagnosticTestStatus } from '@prisma/client';

@ApiTags('Diagnostic Tests')
@Controller('diagnostic-tests')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DiagnosticTestsController {
  constructor(private readonly diagnosticTestsService: DiagnosticTestsService) {}

  @Post('schedules')
  @ApiOperation({ summary: 'Schedule a new diagnostic test' })
  @ApiResponse({ status: 201, description: 'Diagnostic test scheduled successfully' })
  async createSchedule(
    @Body() dto: CreateDiagnosticTestScheduleDto,
    @Request() req,
  ) {
    return this.diagnosticTestsService.createSchedule(dto, req.user.userId);
  }

  @Get('schedules')
  @ApiOperation({ summary: 'Get all diagnostic test schedules' })
  @ApiQuery({ name: 'yearGroupId', required: false, description: 'Filter by year group' })
  @ApiQuery({ 
    name: 'status', 
    required: false, 
    enum: DiagnosticTestStatus,
    description: 'Filter by status' 
  })
  @ApiResponse({ status: 200, description: 'List of diagnostic test schedules' })
  async getAllSchedules(
    @Query('yearGroupId') yearGroupId?: string,
    @Query('status') status?: DiagnosticTestStatus,
  ) {
    return this.diagnosticTestsService.getAllSchedules({
      yearGroupId,
      status,
    });
  }

  @Get('schedules/:id')
  @ApiOperation({ summary: 'Get a specific diagnostic test schedule' })
  @ApiResponse({ status: 200, description: 'Diagnostic test schedule details' })
  @ApiResponse({ status: 404, description: 'Schedule not found' })
  async getScheduleById(@Param('id') id: string) {
    return this.diagnosticTestsService.getScheduleById(id);
  }

  @Put('schedules/:id')
  @ApiOperation({ summary: 'Update a diagnostic test schedule' })
  @ApiResponse({ status: 200, description: 'Schedule updated successfully' })
  @ApiResponse({ status: 404, description: 'Schedule not found' })
  async updateSchedule(
    @Param('id') id: string,
    @Body() dto: UpdateDiagnosticTestScheduleDto,
  ) {
    return this.diagnosticTestsService.updateSchedule(id, dto);
  }

  @Delete('schedules/:id')
  @ApiOperation({ summary: 'Delete a diagnostic test schedule' })
  @ApiResponse({ status: 200, description: 'Schedule deleted successfully' })
  @ApiResponse({ status: 404, description: 'Schedule not found' })
  async deleteSchedule(@Param('id') id: string) {
    return this.diagnosticTestsService.deleteSchedule(id);
  }

  @Get('results')
  @ApiOperation({ summary: 'Get diagnostic test results with analytics' })
  @ApiQuery({ name: 'scheduleId', required: false })
  @ApiQuery({ name: 'studentId', required: false })
  @ApiQuery({ name: 'classId', required: false })
  @ApiQuery({ name: 'yearGroupId', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiResponse({ status: 200, description: 'Test results and analytics' })
  async getTestResults(@Query() query: DiagnosticTestAnalyticsQueryDto) {
    return this.diagnosticTestsService.getTestResults(query);
  }

  @Get('analytics/class/:classId')
  @ApiOperation({ summary: 'Get class averages for diagnostic tests' })
  @ApiQuery({ name: 'scheduleId', required: false })
  @ApiResponse({ status: 200, description: 'Class averages and statistics' })
  async getClassAverages(
    @Param('classId') classId: string,
    @Query('scheduleId') scheduleId?: string,
  ) {
    return this.diagnosticTestsService.getClassAverages(classId, scheduleId);
  }

  @Get('analytics/compare')
  @ApiOperation({ summary: 'Compare pre/post test scores' })
  @ApiQuery({ name: 'preTestId', required: true, description: 'Pre-test assessment ID' })
  @ApiQuery({ name: 'postTestId', required: true, description: 'Post-test assessment ID' })
  @ApiResponse({ status: 200, description: 'Pre/post test comparison' })
  async comparePrePostScores(
    @Query('preTestId') preTestId: string,
    @Query('postTestId') postTestId: string,
  ) {
    return this.diagnosticTestsService.comparePrePostScores(preTestId, postTestId);
  }

  @Get('analytics/skill-gaps')
  @ApiOperation({ summary: 'Identify skill gaps from test results' })
  @ApiQuery({ name: 'scheduleId', required: false })
  @ApiQuery({ name: 'studentId', required: false })
  @ApiQuery({ name: 'classId', required: false })
  @ApiQuery({ name: 'yearGroupId', required: false })
  @ApiResponse({ status: 200, description: 'Skill gaps analysis' })
  async identifySkillGaps(@Query() query: DiagnosticTestAnalyticsQueryDto) {
    return this.diagnosticTestsService.identifySkillGaps(query);
  }

  @Get('analytics/year-on-year/:yearGroupId')
  @ApiOperation({ summary: 'Get year-on-year comparison for a year group' })
  @ApiResponse({ status: 200, description: 'Year-on-year comparison data' })
  async getYearOnYearComparison(@Param('yearGroupId') yearGroupId: string) {
    return this.diagnosticTestsService.getYearOnYearComparison(yearGroupId);
  }
}

