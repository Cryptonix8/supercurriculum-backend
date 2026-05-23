import { Module } from '@nestjs/common';
import { ChallengesController } from './challenges.controller';
import { ChallengesService } from './challenges.service';
import { GamificationModule } from '../gamification/gamification.module';
import { BadgesModule } from '../badges/badges.module';

@Module({
  imports: [GamificationModule, BadgesModule],
  controllers: [ChallengesController],
  providers: [ChallengesService],
  exports: [ChallengesService],
})
export class ChallengesModule {}

