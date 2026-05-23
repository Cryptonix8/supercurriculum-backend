import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ParentsService } from './parents.service';

@Controller('parents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PARENT', 'ADMIN')
export class ParentsController {
  constructor(private parentsService: ParentsService) {}

  /**
   * Get my children
   * GET /api/parents/children
   */
  @Get('children')
  async getMyChildren(@Req() req) {
    return this.parentsService.getMyChildren(req.user.id);
  }

  /**
   * Link a child to parent account
   * POST /api/parents/children/link
   */
  @Post('children/link')
  async linkChild(
    @Req() req,
    @Body('childEmail') childEmail: string,
    @Body('verificationCode') verificationCode?: string,
  ) {
    return this.parentsService.linkChild(
      req.user.id,
      childEmail,
      verificationCode,
    );
  }

  /**
   * Get child's progress
   * GET /api/parents/children/:childId/progress
   */
  @Get('children/:childId/progress')
  async getChildProgress(@Req() req, @Param('childId') childId: string) {
    return this.parentsService.getChildProgress(req.user.id, childId);
  }

  /**
   * Get child's weekly plan
   * GET /api/parents/children/:childId/weekly-plan
   */
  @Get('children/:childId/weekly-plan')
  async getChildWeeklyPlan(@Req() req, @Param('childId') childId: string) {
    return this.parentsService.getChildWeeklyPlan(req.user.id, childId);
  }
}

