import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { YouTubeRecommendationService } from './youtube-recommendation.service';
import { TutorConversationStateService } from './tutor-conversation-state.service';

@Module({
  providers: [AiService, YouTubeRecommendationService, TutorConversationStateService],
  controllers: [AiController],
  exports: [AiService, TutorConversationStateService],
})
export class AiModule {}

