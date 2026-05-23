import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChallengesService } from './challenges.service';

@ApiTags('Challenges')
@Controller('challenges')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  @Get()
  getChallenges(
    @Req() req: any,
    @Query('createdById') createdById?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    const resolvedCreatedBy = createdById || req.user.id;
    const resolvedActiveOnly = activeOnly === 'true';
    return this.challengesService.getChallenges(resolvedCreatedBy, resolvedActiveOnly);
  }

  @Post()
  createChallenge(
    @Req() req: any,
    @Body()
    data: {
      title: string;
      description: string;
      subjectId?: string;
      skillId?: string;
      scope?: 'PERSONAL' | 'CLASSROOM';
      targetCount?: number;
      xpReward?: number;
      startDate?: string;
      endDate?: string;
    },
  ) {
    return this.challengesService.createChallenge(req.user.id, data);
  }

  @Post(':challengeId/assign')
  assignChallenge(
    @Req() req: any,
    @Param('challengeId') challengeId: string,
    @Body()
    data: {
      studentIds: string[];
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.challengesService.assignChallenge(
      challengeId,
      req.user.id,
      data.studentIds || [],
      data.metadata,
    );
  }

  @Get('my')
  getMyChallenges(@Req() req: any) {
    return this.challengesService.getMyChallenges(req.user.id);
  }

  @Patch('assignments/:assignmentId')
  updateMyChallengeProgress(
    @Req() req: any,
    @Param('assignmentId') assignmentId: string,
    @Body()
    data: {
      status?: 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';
      progress?: number;
      source?: 'MANUAL' | 'SYSTEM_EVENT';
    },
  ) {
    return this.challengesService.updateMyChallengeProgress(req.user.id, assignmentId, data);
  }

  @Get('teacher/overview')
  getTeacherOverview(@Req() req: any, @Query('teacherId') teacherId?: string) {
    return this.challengesService.getTeacherChallengeOverview(teacherId || req.user.id);
  }
}

