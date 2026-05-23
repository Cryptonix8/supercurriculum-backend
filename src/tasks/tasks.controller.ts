import { Controller, Get, Patch, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OnboardingCompleteGuard } from '../onboarding-tests/guards/onboarding-complete.guard';

@ApiTags('Planning')
@Controller('tasks')
@UseGuards(JwtAuthGuard, OnboardingCompleteGuard)
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('today')
  getTodayTasks(@Request() req) {
    return this.tasksService.getTodayTasks(req.user.id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.tasksService.updateTaskStatus(id, status);
  }
}

