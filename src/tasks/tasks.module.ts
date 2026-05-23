import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { GamificationModule } from '../gamification/gamification.module';
import { BadgesModule } from '../badges/badges.module';

@Module({
  imports: [GamificationModule, BadgesModule],
  providers: [TasksService],
  controllers: [TasksController],
  exports: [TasksService],
})
export class TasksModule {}

