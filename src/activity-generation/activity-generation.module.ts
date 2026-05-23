import { Module } from '@nestjs/common';
import { ActivityGenerationService } from './activity-generation.service';
import { ActivityGenerationController } from './activity-generation.controller';
import { AutoExerciseGeneratorService } from './auto-exercise-generator.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ActivityGenerationController],
  providers: [ActivityGenerationService, AutoExerciseGeneratorService],
  exports: [ActivityGenerationService, AutoExerciseGeneratorService],
})
export class ActivityGenerationModule {}

