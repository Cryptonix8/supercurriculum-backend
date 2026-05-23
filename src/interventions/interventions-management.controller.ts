import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { InterventionsManagementService } from './interventions-management.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
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
} from './dto/assign-intervention.dto';
import {
  CreateSkillGapAlertDto,
  UpdateAlertDto,
  GetAlertsDto,
} from './dto/alert.dto';
import {
  CreateMiniAssessmentDto,
  SubmitMiniAssessmentDto,
  UpdateMiniAssessmentDto,
  GetMiniAssessmentsDto,
} from './dto/mini-assessment.dto';
import { MiniAssessmentsService } from './mini-assessments.service';

@ApiTags('Intervention Management')
@Controller('interventions/management')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class InterventionsManagementController {
  constructor(
    private readonly managementService: InterventionsManagementService,
    private readonly miniAssessmentsService: MiniAssessmentsService,
  ) {}

  // ============================================
  // GAP IDENTIFICATION
  // ============================================

  @Post('scan-gaps')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({
    summary: 'Scan assessments and automatically identify skill gaps (Admin/Teacher)',
  })
  @ApiResponse({ status: 200, description: 'Gaps identified and created' })
  @ApiQuery({ name: 'threshold', required: false, type: Number })
  async scanGaps(@Query('threshold') threshold?: string) {
    const thresholdValue = threshold ? parseInt(threshold) : 50;
    return this.managementService.scanAndIdentifyGaps(thresholdValue);
  }

  @Get('gaps')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Get all skill gaps with filters (Admin/Teacher)' })
  @ApiResponse({ status: 200, description: 'Skill gaps retrieved' })
  async getGaps(@Query() filters: IdentifyGapsDto) {
    return this.managementService.getSkillGaps(filters);
  }

  @Get('gaps/skill/:skillId')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({
    summary: 'Get all students with gaps in a specific skill (Admin/Teacher)',
  })
  @ApiResponse({ status: 200, description: 'Students with gaps retrieved' })
  @ApiQuery({ name: 'subjectId', required: false })
  async getStudentsWithSkillGaps(
    @Param('skillId') skillId: string,
    @Query('subjectId') subjectId?: string,
  ) {
    return this.managementService.getStudentsWithSkillGaps(skillId, subjectId);
  }

  @Post('gaps')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Manually create a skill gap (Admin/Teacher)' })
  @ApiResponse({ status: 201, description: 'Skill gap created' })
  async createGap(@Body() dto: CreateSkillGapDto) {
    return this.managementService.createSkillGap(dto);
  }

  @Patch('gaps/:id/resolve')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Mark a skill gap as resolved (Admin/Teacher)' })
  @ApiResponse({ status: 200, description: 'Skill gap resolved' })
  async resolveGap(@Param('id') id: string) {
    return this.managementService.resolveSkillGap(id);
  }

  // ============================================
  // DASHBOARD
  // ============================================

  @Get('dashboard')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({
    summary: 'Get skill gap dashboard with analytics (Admin/Teacher)',
  })
  @ApiResponse({ status: 200, description: 'Dashboard data retrieved' })
  async getDashboard(@Query() filters: SkillGapDashboardDto) {
    return this.managementService.getSkillGapDashboard(filters);
  }

  // ============================================
  // INTERVENTION ASSIGNMENT
  // ============================================

  @Post('assignments')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({
    summary: 'Assign targeted intervention to a student (Admin/Teacher)',
  })
  @ApiResponse({ status: 201, description: 'Intervention assigned' })
  async assignIntervention(@Body() dto: AssignInterventionDto) {
    return this.managementService.assignIntervention(dto);
  }

  @Post('assignments/backfill')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({
    summary: 'Assign backfill intervention (e.g., Year 8 student works on Year 6 content) (Admin/Teacher)',
  })
  @ApiResponse({ status: 201, description: 'Backfill intervention assigned' })
  async assignBackfill(@Body() dto: BackfillAssignmentDto) {
    return this.managementService.assignBackfill(dto);
  }

  @Get('assignments')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Get all intervention assignments (Admin/Teacher)' })
  @ApiResponse({ status: 200, description: 'Assignments retrieved' })
  @ApiQuery({ name: 'studentId', required: false })
  @ApiQuery({ name: 'teacherId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'priority', required: false })
  async getAssignments(
    @Query('studentId') studentId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
  ) {
    return this.managementService.getInterventionAssignments({
      studentId,
      teacherId,
      status,
      priority,
    });
  }

  @Get('assignments/my-assignments')
  @ApiOperation({ summary: 'Get my intervention assignments (Student)' })
  @ApiResponse({ status: 200, description: 'My assignments retrieved' })
  async getMyAssignments(@Request() req) {
    return this.managementService.getInterventionAssignments({
      studentId: req.user.id,
    });
  }

  @Get('assignments/:id')
  @ApiOperation({ summary: 'Get intervention assignment by ID' })
  @ApiResponse({ status: 200, description: 'Assignment retrieved' })
  async getAssignment(@Param('id') id: string) {
    return this.managementService.getInterventionAssignment(id);
  }

  @Patch('assignments/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Update intervention assignment (Admin/Teacher)' })
  @ApiResponse({ status: 200, description: 'Assignment updated' })
  async updateAssignment(
    @Param('id') id: string,
    @Body() dto: UpdateInterventionAssignmentDto,
  ) {
    return this.managementService.updateInterventionAssignment(id, dto);
  }

  // ============================================
  // PROGRESS TRACKING
  // ============================================

  @Post('progress')
  @ApiOperation({ summary: 'Log progress on an intervention assignment' })
  @ApiResponse({ status: 201, description: 'Progress logged' })
  async logProgress(@Body() dto: LogInterventionProgressDto) {
    return this.managementService.logInterventionProgress(dto);
  }

  @Post('assignments/:id/escalate')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Escalate a failing intervention (Admin/Teacher)' })
  @ApiResponse({ status: 200, description: 'Intervention escalated' })
  async escalate(@Body() dto: EscalateInterventionDto) {
    return this.managementService.escalateIntervention(dto);
  }

  // ============================================
  // ALERTS
  // ============================================

  @Post('alerts')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Create a skill gap alert (Admin/Teacher)' })
  @ApiResponse({ status: 201, description: 'Alert created' })
  async createAlert(@Body() dto: CreateSkillGapAlertDto) {
    return this.managementService.createAlert(dto);
  }

  @Get('alerts')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Get alerts (Admin/Teacher)' })
  @ApiResponse({ status: 200, description: 'Alerts retrieved' })
  async getAlerts(@Query() filters: GetAlertsDto) {
    return this.managementService.getAlerts(filters);
  }

  @Get('alerts/my-alerts')
  @UseGuards(RolesGuard)
  @Roles('TEACHER')
  @ApiOperation({ summary: 'Get my alerts (Teacher)' })
  @ApiResponse({ status: 200, description: 'My alerts retrieved' })
  async getMyAlerts(@Request() req) {
    return this.managementService.getAlerts({
      teacherId: req.user.id,
      unreadOnly: false,
    });
  }

  @Patch('alerts/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Update an alert (Admin/Teacher)' })
  @ApiResponse({ status: 200, description: 'Alert updated' })
  async updateAlert(@Param('id') id: string, @Body() dto: UpdateAlertDto) {
    return this.managementService.updateAlert(id, dto);
  }

  @Patch('alerts/:id/read')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark alert as read (Admin/Teacher)' })
  @ApiResponse({ status: 200, description: 'Alert marked as read' })
  async markAlertAsRead(@Param('id') id: string) {
    return this.managementService.markAlertAsRead(id);
  }

  @Patch('alerts/:id/snooze')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Snooze an alert (Admin/Teacher)' })
  @ApiResponse({ status: 200, description: 'Alert snoozed' })
  async snoozeAlert(
    @Param('id') id: string,
    @Body('until') until: string,
  ) {
    return this.managementService.snoozeAlert(id, new Date(until));
  }

  // ============================================
  // MINI-ASSESSMENTS (GAP CLOSURE VERIFICATION)
  // ============================================

  @Post('mini-assessments')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({
    summary: 'Create a mini-assessment for gap closure verification (Admin/Teacher)',
  })
  @ApiResponse({ status: 201, description: 'Mini-assessment created' })
  async createMiniAssessment(@Body() dto: CreateMiniAssessmentDto) {
    return this.miniAssessmentsService.createMiniAssessment(dto);
  }

  @Post('mini-assessments/generate/:skillGapId')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({
    summary: 'Auto-generate mini-assessment from skill gap (Admin/Teacher)',
  })
  @ApiResponse({ status: 201, description: 'Mini-assessment generated' })
  async generateMiniAssessment(
    @Param('skillGapId') skillGapId: string,
    @Request() req,
  ) {
    return this.miniAssessmentsService.generateMiniAssessmentFromGap(
      skillGapId,
      req.user.id,
    );
  }

  @Get('mini-assessments')
  @ApiOperation({ summary: 'Get mini-assessments with filters' })
  @ApiResponse({ status: 200, description: 'Mini-assessments retrieved' })
  async getMiniAssessments(@Query() filters: GetMiniAssessmentsDto) {
    return this.miniAssessmentsService.getMiniAssessments(filters);
  }

  @Get('mini-assessments/my-assessments')
  @ApiOperation({ summary: 'Get my mini-assessments (Student)' })
  @ApiResponse({ status: 200, description: 'My assessments retrieved' })
  async getMyMiniAssessments(@Request() req) {
    return this.miniAssessmentsService.getStudentMiniAssessments(req.user.id);
  }

  @Get('mini-assessments/:id')
  @ApiOperation({ summary: 'Get mini-assessment by ID' })
  @ApiResponse({ status: 200, description: 'Mini-assessment retrieved' })
  async getMiniAssessmentById(@Param('id') id: string) {
    return this.miniAssessmentsService.getMiniAssessmentById(id);
  }

  @Post('mini-assessments/:id/start')
  @ApiOperation({ summary: 'Start a mini-assessment (Student)' })
  @ApiResponse({ status: 200, description: 'Mini-assessment started' })
  async startMiniAssessment(@Param('id') id: string) {
    return this.miniAssessmentsService.startMiniAssessment(id);
  }

  @Post('mini-assessments/submit')
  @ApiOperation({ summary: 'Submit a mini-assessment (Student)' })
  @ApiResponse({ status: 200, description: 'Mini-assessment submitted and graded' })
  async submitMiniAssessment(@Body() dto: SubmitMiniAssessmentDto) {
    return this.miniAssessmentsService.submitMiniAssessment(dto);
  }

  @Patch('mini-assessments/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Update mini-assessment (Admin/Teacher)' })
  @ApiResponse({ status: 200, description: 'Mini-assessment updated' })
  async updateMiniAssessment(
    @Param('id') id: string,
    @Body() dto: UpdateMiniAssessmentDto,
  ) {
    return this.miniAssessmentsService.updateMiniAssessment(id, dto);
  }

  @Delete('mini-assessments/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Delete mini-assessment (Admin/Teacher)' })
  @ApiResponse({ status: 200, description: 'Mini-assessment deleted' })
  async deleteMiniAssessment(@Param('id') id: string) {
    return this.miniAssessmentsService.deleteMiniAssessment(id);
  }
}

