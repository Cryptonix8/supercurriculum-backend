import { Controller, Get, NotFoundException, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TutorSimulationService } from './tutor-simulation.service';

@ApiTags('Tutor simulation (QA)')
@Controller('tutor-simulation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class TutorSimulationController {
  constructor(private readonly tutorSimulationService: TutorSimulationService) {}

  @Post('run')
  @ApiOperation({
    summary: 'Run full tutor simulation (multi-scenario, scored). Long-running.',
  })
  async run(@Request() req: { user?: { id: string } }) {
    return this.tutorSimulationService.runFullSimulation({
      triggeredByUserId: req.user?.id,
      triggerSource: 'admin',
    });
  }

  @Get('runs')
  @ApiOperation({ summary: 'List recent simulation runs' })
  async listRuns(@Query('limit') limit?: string) {
    const n = Math.min(100, Math.max(1, parseInt(limit || '30', 10) || 30));
    return this.tutorSimulationService.listRuns(n);
  }

  @Get('runs/:id')
  @ApiOperation({ summary: 'Get one simulation run with transcripts' })
  async getRun(@Param('id') id: string) {
    const run = await this.tutorSimulationService.getRun(id);
    if (!run) {
      throw new NotFoundException('Simulation run not found');
    }
    return run;
  }

  @Get('meta')
  @ApiOperation({ summary: 'Scenario set and tutor config versions (no LLM calls)' })
  meta() {
    return {
      scenarioSetVersion: this.tutorSimulationService.getScenarioSet().version,
      scenarioCount: this.tutorSimulationService.getScenarioSet().scenarios.length,
      tutorConfigVersion: this.tutorSimulationService.getTutorConfigVersion(),
    };
  }
}
