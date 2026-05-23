import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { WeeklyPlansService } from './weekly-plans.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OnboardingCompleteGuard } from '../onboarding-tests/guards/onboarding-complete.guard';

@ApiTags('Planning')
@Controller('weekly-plans')
@UseGuards(JwtAuthGuard, OnboardingCompleteGuard)
@ApiBearerAuth()
export class WeeklyPlansController {
  constructor(private readonly weeklyPlansService: WeeklyPlansService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate new weekly plan with optional subject selection' })
  @ApiResponse({ status: 201, description: 'Plan generated successfully' })
  @ApiResponse({ status: 400, description: 'Cannot generate plan' })
  @ApiQuery({ name: 'force', required: false, type: Boolean, description: 'Force regeneration even if plan exists' })
  async generate(
    @Request() req, 
    @Query('force') force?: string,
    @Query('subjectIds') subjectIds?: string, // Comma-separated subject IDs
  ) {
    try {
      const forceRegenerate = force === 'true';
      const selectedSubjectIds = subjectIds ? subjectIds.split(',').filter(id => id.trim()) : undefined;
      
      console.log(`[WeeklyPlansController] Starting plan generation for user ${req.user.id}, force=${forceRegenerate}`);
      
      const result = await this.weeklyPlansService.generateWeeklyPlan(req.user.id, forceRegenerate, selectedSubjectIds);
      
      console.log(`[WeeklyPlansController] Plan generation completed successfully`);
      return result;
    } catch (error) {
      // Log the full error for debugging
      console.error('[WeeklyPlansController] Error generating weekly plan:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
        userId: req.user?.id,
      });
      
      // Ensure we always return a proper HTTP error response
      // Re-throw to let NestJS exception filter handle it
      throw error;
    }
  }

  @Get('active')
  @ApiOperation({ summary: 'Get current active plan' })
  @ApiResponse({ status: 200, description: 'Active plan retrieved' })
  @ApiResponse({ status: 404, description: 'No active plan found' })
  getActive(@Request() req) {
    return this.weeklyPlansService.getActivePlan(req.user.id);
  }

  @Get('available-subjects')
  @ApiOperation({ summary: 'Get available subjects for weekly plan selection' })
  @ApiResponse({ status: 200, description: 'Available subjects retrieved' })
  async getAvailableSubjects(@Request() req) {
    return this.weeklyPlansService.getAvailableSubjects(req.user.id);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get plan history' })
  @ApiResponse({ status: 200, description: 'Plan history retrieved' })
  getHistory(@Request() req) {
    return this.weeklyPlansService.getPlanHistory(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get specific plan by ID' })
  @ApiResponse({ status: 200, description: 'Plan found' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  getPlan(@Param('id') id: string, @Request() req) {
    return this.weeklyPlansService.getPlanById(id, req.user.id);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Mark plan as completed' })
  @ApiResponse({ status: 200, description: 'Plan marked as completed' })
  completePlan(@Param('id') id: string, @Request() req) {
    return this.weeklyPlansService.completePlan(id, req.user.id);
  }
}
