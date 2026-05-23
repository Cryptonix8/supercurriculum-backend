import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ParentViewService } from './parent-view.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('parent-view')
@UseGuards(JwtAuthGuard)
export class ParentViewController {
  constructor(private readonly parentViewService: ParentViewService) {}

  /**
   * Get simple overview for a student
   */
  @Get('student/:studentId/overview')
  async getOverview(@Param('studentId') studentId: string) {
    return this.parentViewService.getParentOverview(studentId);
  }

  /**
   * Get latest weekly summary
   */
  @Get('student/:studentId/latest-summary')
  async getLatestSummary(@Param('studentId') studentId: string) {
    return this.parentViewService.getLatestSummary(studentId);
  }

  /**
   * Generate weekly summary
   */
  @Post('student/:studentId/generate-summary')
  async generateSummary(
    @Param('studentId') studentId: string,
    @Body() data: { weekStart: string; weekEnd: string },
  ) {
    const weekStart = new Date(data.weekStart);
    const weekEnd = new Date(data.weekEnd);

    return this.parentViewService.generateWeeklySummary(studentId, weekStart, weekEnd);
  }

  /**
   * Get weekly summary for a specific week
   */
  @Get('student/:studentId/summary/:weekStart')
  async getWeeklySummary(
    @Param('studentId') studentId: string,
    @Param('weekStart') weekStart: string,
  ) {
    return this.parentViewService.getWeeklySummary(studentId, new Date(weekStart));
  }
}

