import { Module } from '@nestjs/common';
import { AiTutorService } from './ai-tutor.service';
import { AdaptiveLearningService } from './adaptive-learning.service';
import { AiTutorController } from './ai-tutor.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SkillMasteryModule } from '../skill-mastery/skill-mastery.module';
import { GamificationModule } from '../gamification/gamification.module';
import { BadgesModule } from '../badges/badges.module';

@Module({
  imports: [PrismaModule, SkillMasteryModule, GamificationModule, BadgesModule],
  controllers: [AiTutorController],
  providers: [AiTutorService, AdaptiveLearningService],
  exports: [AiTutorService, AdaptiveLearningService],
})
export class AiTutorModule {}

