import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { EducatorPilotService } from './educator-pilot.service';

@ApiTags('Educator Pilot')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('educator-pilot')
export class EducatorPilotController {
  constructor(private readonly educatorPilotService: EducatorPilotService) {}

  @Post('invites')
  @Roles('TEACHER', 'ADMIN')
  @ApiOperation({ summary: 'Create a class invite code for students' })
  async createInvite(
    @Req() req: any,
    @Body() body: { classId: string; expiresAt?: string },
  ) {
    return this.educatorPilotService.createClassInvite(
      req.user.id,
      body.classId,
      body.expiresAt,
    );
  }

  @Post('invites/redeem')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Redeem educator invite code to link student' })
  async redeemInvite(@Req() req: any, @Body() body: { code: string }) {
    return this.educatorPilotService.redeemInvite(req.user.id, body.code);
  }

  @Get('students/:studentId/snapshot')
  @Roles('TEACHER', 'ADMIN')
  @ApiOperation({ summary: 'Get educator snapshot for linked student' })
  async getStudentSnapshot(@Req() req: any, @Param('studentId') studentId: string) {
    return this.educatorPilotService.getStudentSnapshot(req.user.id, studentId);
  }

  @Post('assignments')
  @Roles('TEACHER', 'ADMIN')
  @ApiOperation({ summary: 'Assign topic-based practice to a student' })
  async assignTopicPractice(
    @Req() req: any,
    @Body()
    body: {
      studentId: string;
      subjectId: string;
      topic: string;
      chapter?: string;
      targetExercises: number;
      dueDate?: string;
      note?: string;
    },
  ) {
    return this.educatorPilotService.assignTopicPractice(req.user.id, body);
  }

  @Get('my-assignments')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Get current student educator assignments' })
  async getMyAssignments(@Req() req: any) {
    return this.educatorPilotService.getMyAssignments(req.user.id);
  }

  @Patch('my-assignments/:taskId/complete')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Mark educator assignment completed' })
  async completeMyAssignment(@Req() req: any, @Param('taskId') taskId: string) {
    return this.educatorPilotService.completeMyAssignment(req.user.id, taskId);
  }
}
