import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { SkillMasteryService } from './skill-mastery.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('skill-mastery')
@UseGuards(JwtAuthGuard)
export class SkillMasteryController {
  constructor(private readonly skillMasteryService: SkillMasteryService) {}

  @Get('my-mastery')
  async getMyMastery(@Req() req: any) {
    return this.skillMasteryService.getSkillMastery(req.user.id);
  }

  @Get('my-mastery/subject/:subjectId')
  async getMyMasteryBySubject(@Req() req: any, @Param('subjectId') subjectId: string) {
    return this.skillMasteryService.getSkillMastery(req.user.id, subjectId);
  }

  @Get('my-mastery/overview')
  async getMasteryOverview(@Req() req: any) {
    return this.skillMasteryService.getMasteryOverview(req.user.id);
  }

  @Get('intervention-needed')
  async getInterventionNeeded(@Req() req: any) {
    return this.skillMasteryService.getSkillsNeedingIntervention(req.user.id);
  }

  @Post('update')
  async updateMastery(
    @Req() req: any,
    @Body()
    data: {
      subjectId: string;
      skillId: string;
      isCorrect: boolean;
      hintsUsed?: number;
    },
  ) {
    return this.skillMasteryService.updateSkillMastery({
      userId: req.user.id,
      ...data,
    });
  }

  // Admin/Teacher routes
  @Get('student/:studentId')
  async getStudentMastery(@Param('studentId') studentId: string) {
    return this.skillMasteryService.getSkillMastery(studentId);
  }

  @Get('student/:studentId/overview')
  async getStudentMasteryOverview(@Param('studentId') studentId: string) {
    return this.skillMasteryService.getMasteryOverview(studentId);
  }
}

