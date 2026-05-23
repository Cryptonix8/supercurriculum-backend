import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'TEACHER')
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('visualizations')
  @ApiOperation({ summary: 'Get comprehensive visualization data' })
  async getVisualizations(
    @Query('yearGroupId') yearGroupId?: string,
    @Query('classId') classId?: string,
    @Query('timeRange') timeRange?: string,
  ) {
    return this.analyticsService.getVisualizationData({
      yearGroupId,
      classId,
      timeRange: timeRange as 'week' | 'month',
    });
  }
}

