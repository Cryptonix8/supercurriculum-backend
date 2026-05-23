import { Controller, Get, Post, Body, Param, UseGuards, Req, Query } from '@nestjs/common';
import { AiTutorService } from './ai-tutor.service';
import { AdaptiveLearningService } from './adaptive-learning.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OnboardingCompleteGuard } from '../onboarding-tests/guards/onboarding-complete.guard';

@Controller('ai-tutor')
@UseGuards(JwtAuthGuard, OnboardingCompleteGuard)
export class AiTutorController {
  constructor(
    private readonly aiTutorService: AiTutorService,
    private readonly adaptiveLearning: AdaptiveLearningService,
  ) {}

  /**
   * Generate a new learning session
   */
  @Post('session/generate')
  async generateSession(
    @Req() req: any,
    @Body()
    data: {
      subjectId?: string;
      duration?: number;
    },
  ) {
    return this.aiTutorService.generateSession({
      userId: req.user.id,
      ...data,
    });
  }

  /**
   * Get session details
   */
  @Get('session/:sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
    return this.adaptiveLearning.getSession(sessionId);
  }

  /**
   * Submit an answer to a session item
   */
  @Post('session/:sessionId/answer')
  async submitAnswer(
    @Param('sessionId') sessionId: string,
    @Body()
    data: {
      itemId: string;
      answer: string;
      timeSpent: number;
    },
  ) {
    return this.adaptiveLearning.processAnswer({
      sessionId,
      ...data,
    });
  }

  /**
   * Request a hint for a question
   */
  @Post('session/:sessionId/hint')
  async getHint(
    @Param('sessionId') sessionId: string,
    @Body()
    data: {
      itemId: string;
      hintLevel: number; // 1, 2, or 3
    },
  ) {
    return this.adaptiveLearning.provideHint({
      sessionId,
      ...data,
    });
  }

  /**
   * Complete a session
   */
  @Post('session/:sessionId/complete')
  async completeSession(@Param('sessionId') sessionId: string) {
    return this.aiTutorService.completeSession(sessionId);
  }

  /**
   * Get session history
   */
  @Get('sessions/history')
  async getSessionHistory(@Req() req: any, @Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit) : 10;
    return this.adaptiveLearning.getSessionHistory(req.user.id, limitNum);
  }
}

