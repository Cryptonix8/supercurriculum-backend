import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TutorSimulationService } from './tutor-simulation.service';
import { TutorSimulationController } from './tutor-simulation.controller';

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [TutorSimulationController],
  providers: [TutorSimulationService],
  exports: [TutorSimulationService],
})
export class TutorSimulationModule {}
