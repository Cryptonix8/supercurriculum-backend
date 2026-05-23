import { Module } from '@nestjs/common';
import { FeedbackTestsService } from './feedback-tests.service';
import { FeedbackTestsController } from './feedback-tests.controller';

@Module({
  providers: [FeedbackTestsService],
  controllers: [FeedbackTestsController],
  exports: [FeedbackTestsService],
})
export class FeedbackTestsModule {}

