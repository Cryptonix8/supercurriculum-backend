import { Module, forwardRef } from '@nestjs/common';
import { WeeklyPlansService } from './weekly-plans.service';
import { WeeklyPlansController } from './weekly-plans.controller';
import { ActivityGenerationModule } from '../activity-generation/activity-generation.module';

@Module({
  imports: [forwardRef(() => ActivityGenerationModule)],
  providers: [WeeklyPlansService],
  controllers: [WeeklyPlansController],
  exports: [WeeklyPlansService],
})
export class WeeklyPlansModule {}

