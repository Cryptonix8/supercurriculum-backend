import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ActivityGenerationService } from './activity-generation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('activity-generation')
@UseGuards(JwtAuthGuard)
export class ActivityGenerationController {
  constructor(private readonly activityGeneration: ActivityGenerationService) {}

  /**
   * Generate quick quiz
   */
  @Post('quick-quiz')
  async generateQuickQuiz(
    @Body()
    data: {
      subjectId: string;
      skillId: string;
      yearGroup: string;
      difficulty: string;
      questionCount?: number;
    },
  ) {
    return this.activityGeneration.generateQuickQuiz({
      ...data,
      questionCount: data.questionCount || 5,
    });
  }

  /**
   * Generate scaffolded exercises
   */
  @Post('scaffolded-exercises')
  async generateScaffoldedExercises(
    @Body()
    data: {
      subjectId: string;
      skillId: string;
      yearGroup: string;
      exerciseCount?: number;
    },
  ) {
    return this.activityGeneration.generateScaffoldedExercises({
      ...data,
      exerciseCount: data.exerciseCount || 6,
    });
  }

  /**
   * Generate project
   */
  @Post('project')
  async generateProject(
    @Body()
    data: {
      subjectId: string;
      skillId: string;
      yearGroup: string;
      duration: number;
    },
  ) {
    return this.activityGeneration.generateProject(data);
  }

  /**
   * Generate exam-style questions
   */
  @Post('exam-questions')
  async generateExamQuestions(
    @Body()
    data: {
      subjectId: string;
      skillId: string;
      yearGroup: string;
      questionCount?: number;
    },
  ) {
    return this.activityGeneration.generateExamQuestions({
      ...data,
      questionCount: data.questionCount || 3,
    });
  }

  /**
   * Generate retrieval practice
   */
  @Post('retrieval-practice')
  async generateRetrievalPractice(
    @Req() req: any,
    @Body()
    data: {
      subjectId: string;
      questionCount?: number;
    },
  ) {
    return this.activityGeneration.generateRetrievalPractice({
      userId: req.user.id,
      subjectId: data.subjectId,
      questionCount: data.questionCount || 4,
    });
  }

  /**
   * Generate interleaved practice
   */
  @Post('interleaved-practice')
  async generateInterleavedPractice(
    @Req() req: any,
    @Body()
    data: {
      subjectId: string;
      exerciseCount?: number;
    },
  ) {
    return this.activityGeneration.generateInterleavedPractice({
      userId: req.user.id,
      subjectId: data.subjectId,
      exerciseCount: data.exerciseCount || 6,
    });
  }
}

