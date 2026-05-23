import { Module } from '@nestjs/common';
import { AiAgentToolsService } from './ai-agent-tools.service';
import { AiAgentOrchestratorService } from './ai-agent-orchestrator.service';
import { AiAgentToolsController } from './ai-agent-tools.controller';
import { CurriculumManagementController } from './curriculum-management.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [AiAgentToolsService, AiAgentOrchestratorService],
  controllers: [AiAgentToolsController, CurriculumManagementController],
  exports: [AiAgentToolsService, AiAgentOrchestratorService],
})
export class AiAgentToolsModule {}

