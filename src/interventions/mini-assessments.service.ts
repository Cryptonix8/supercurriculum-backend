import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateMiniAssessmentDto,
  SubmitMiniAssessmentDto,
  UpdateMiniAssessmentDto,
  GetMiniAssessmentsDto,
  MiniAssessmentStatus,
  MiniAssessmentQuestion,
} from './dto/mini-assessment.dto';

@Injectable()
export class MiniAssessmentsService {
  private readonly logger = new Logger(MiniAssessmentsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create a mini-assessment
   */
  async createMiniAssessment(dto: CreateMiniAssessmentDto) {
    this.logger.log(`Creating mini-assessment for student ${dto.studentId}`);

    const assessment = await (this.prisma as any).miniAssessment.create({
      data: {
        interventionAssignmentId: dto.interventionAssignmentId,
        studentId: dto.studentId,
        teacherId: dto.teacherId,
        skillGapId: dto.skillGapId,
        title: dto.title,
        description: dto.description,
        targetSkillId: dto.targetSkillId,
        targetSubjectId: dto.targetSubjectId,
        questions: dto.questions,
        totalQuestions: dto.totalQuestions,
        passingScore: dto.passingScore || 70.0,
        status: MiniAssessmentStatus.PENDING,
      },
    });

    this.logger.log(`Mini-assessment ${assessment.id} created`);
    return assessment;
  }

  /**
   * Get mini-assessments with filters
   */
  async getMiniAssessments(filters: GetMiniAssessmentsDto) {
    const where: any = {};

    if (filters.studentId) where.studentId = filters.studentId;
    if (filters.teacherId) where.teacherId = filters.teacherId;
    if (filters.interventionAssignmentId)
      where.interventionAssignmentId = filters.interventionAssignmentId;
    if (filters.skillGapId) where.skillGapId = filters.skillGapId;
    if (filters.status) where.status = filters.status;

    return (this.prisma as any).miniAssessment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a mini-assessment by ID
   */
  async getMiniAssessmentById(id: string) {
    const assessment = await (this.prisma as any).miniAssessment.findUnique({
      where: { id },
    });

    if (!assessment) {
      throw new NotFoundException('Mini-assessment not found');
    }

    return assessment;
  }

  /**
   * Start a mini-assessment
   */
  async startMiniAssessment(id: string) {
    const assessment = await this.getMiniAssessmentById(id);

    if (assessment.status !== MiniAssessmentStatus.PENDING) {
      throw new BadRequestException('Assessment has already been started');
    }

    return (this.prisma as any).miniAssessment.update({
      where: { id },
      data: {
        status: MiniAssessmentStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
    });
  }

  /**
   * Submit a mini-assessment and calculate score
   */
  async submitMiniAssessment(dto: SubmitMiniAssessmentDto) {
    const assessment = await this.getMiniAssessmentById(dto.assessmentId);

    if (
      assessment.status !== MiniAssessmentStatus.PENDING &&
      assessment.status !== MiniAssessmentStatus.IN_PROGRESS
    ) {
      throw new BadRequestException(
        'Assessment is not available for submission',
      );
    }

    // Calculate score
    const questions = assessment.questions as MiniAssessmentQuestion[];
    let correctCount = 0;
    let totalPoints = 0;
    let earnedPoints = 0;

    const gradedAnswers: any = {};

    questions.forEach((question) => {
      const studentAnswer = dto.studentAnswers[question.id];
      const isCorrect =
        studentAnswer?.toLowerCase()?.trim() ===
        question.correctAnswer?.toLowerCase()?.trim();

      if (isCorrect) {
        correctCount++;
        earnedPoints += question.points;
      }

      totalPoints += question.points;

      gradedAnswers[question.id] = {
        studentAnswer,
        correctAnswer: question.correctAnswer,
        isCorrect,
        points: question.points,
        earnedPoints: isCorrect ? question.points : 0,
      };
    });

    const scorePercentage =
      totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
    const passed = scorePercentage >= assessment.passingScore;

    // Generate feedback
    const feedback = this.generateFeedback(
      scorePercentage,
      correctCount,
      questions.length,
      passed,
    );

    // Update assessment
    const updated = await (this.prisma as any).miniAssessment.update({
      where: { id: dto.assessmentId },
      data: {
        status: passed
          ? MiniAssessmentStatus.PASSED
          : MiniAssessmentStatus.FAILED,
        completedAt: new Date(),
        studentAnswers: gradedAnswers,
        score: scorePercentage,
        passed,
        feedback,
        timeSpent: dto.timeSpent || 0,
        attemptsCount: { increment: 1 },
      },
    });

    // If passed and linked to intervention assignment, update the assignment
    if (passed && assessment.interventionAssignmentId) {
      await this.handlePassedAssessment(
        assessment.interventionAssignmentId,
        scorePercentage,
      );
    }

    // If passed and linked to skill gap, resolve the gap
    if (passed && assessment.skillGapId) {
      await this.resolveSkillGap(assessment.skillGapId);
    }

    this.logger.log(
      `Mini-assessment ${dto.assessmentId} submitted. Score: ${scorePercentage}%, Passed: ${passed}`,
    );

    return updated;
  }

  /**
   * Generate feedback based on score
   */
  private generateFeedback(
    score: number,
    correct: number,
    total: number,
    passed: boolean,
  ): string {
    if (passed) {
      if (score >= 90) {
        return `Excellent work! You scored ${score.toFixed(1)}% (${correct}/${total} correct). You've demonstrated strong mastery of this skill. Keep up the great work!`;
      } else if (score >= 80) {
        return `Great job! You scored ${score.toFixed(1)}% (${correct}/${total} correct). You've passed the assessment and shown good understanding of the skill.`;
      } else {
        return `Well done! You scored ${score.toFixed(1)}% (${correct}/${total} correct) and passed the assessment. You're making good progress!`;
      }
    } else {
      if (score >= 60) {
        return `You scored ${score.toFixed(1)}% (${correct}/${total} correct). You're close to passing! Review the areas where you had difficulty and try again.`;
      } else if (score >= 40) {
        return `You scored ${score.toFixed(1)}% (${correct}/${total} correct). You need more practice with this skill. Review the learning materials and try the assessment again.`;
      } else {
        return `You scored ${score.toFixed(1)}% (${correct}/${total} correct). This skill needs significant review. Please work through the intervention materials again and ask your teacher for additional support.`;
      }
    }
  }

  /**
   * Handle passed assessment - update intervention assignment
   */
  private async handlePassedAssessment(
    assignmentId: string,
    score: number,
  ) {
    try {
      const assignment = await this.prisma.interventionAssignment.findUnique({
        where: { id: assignmentId },
      });

      if (assignment) {
        // Calculate improvement if pre-score exists
        let improvementPercentage: number | undefined;
        if (assignment.preScore) {
          improvementPercentage =
            ((score - assignment.preScore) / assignment.preScore) * 100;
        }

        await this.prisma.interventionAssignment.update({
          where: { id: assignmentId },
          data: {
            postScore: score,
            improvementPercentage,
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        });

        this.logger.log(
          `Intervention assignment ${assignmentId} marked as completed`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error updating intervention assignment: ${error.message}`,
      );
    }
  }

  /**
   * Resolve skill gap when mini-assessment is passed
   */
  private async resolveSkillGap(skillGapId: string) {
    try {
      await (this.prisma as any).skillGap.update({
        where: { id: skillGapId },
        data: {
          isResolved: true,
          resolvedAt: new Date(),
          notes: 'Resolved via mini-assessment completion',
        },
      });

      this.logger.log(`Skill gap ${skillGapId} marked as resolved`);
    } catch (error) {
      this.logger.error(`Error resolving skill gap: ${error.message}`);
    }
  }

  /**
   * Update mini-assessment
   */
  async updateMiniAssessment(id: string, dto: UpdateMiniAssessmentDto) {
    await this.getMiniAssessmentById(id);

    return (this.prisma as any).miniAssessment.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * Delete mini-assessment
   */
  async deleteMiniAssessment(id: string) {
    await this.getMiniAssessmentById(id);

    return (this.prisma as any).miniAssessment.delete({
      where: { id },
    });
  }

  /**
   * Get mini-assessments for a student
   */
  async getStudentMiniAssessments(studentId: string) {
    return this.getMiniAssessments({ studentId });
  }

  /**
   * Generate automatic mini-assessment from skill gap
   */
  async generateMiniAssessmentFromGap(
    skillGapId: string,
    teacherId?: string,
  ) {
    const skillGap = await (this.prisma as any).skillGap.findUnique({
      where: { id: skillGapId },
    });

    if (!skillGap) {
      throw new NotFoundException('Skill gap not found');
    }

    // In a real implementation, this would call an AI service to generate questions
    // For now, we'll create a placeholder structure
    const questions: MiniAssessmentQuestion[] = [
      {
        id: '1',
        question: 'Sample question 1 for the skill',
        type: 'multiple_choice',
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctAnswer: 'Option A',
        points: 25,
        explanation: 'Explanation for question 1',
      },
      {
        id: '2',
        question: 'Sample question 2 for the skill',
        type: 'multiple_choice',
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctAnswer: 'Option B',
        points: 25,
        explanation: 'Explanation for question 2',
      },
      {
        id: '3',
        question: 'Sample question 3 for the skill',
        type: 'short_answer',
        correctAnswer: 'Expected answer',
        points: 25,
        explanation: 'Explanation for question 3',
      },
      {
        id: '4',
        question: 'Sample question 4 for the skill',
        type: 'true_false',
        options: ['True', 'False'],
        correctAnswer: 'True',
        points: 25,
        explanation: 'Explanation for question 4',
      },
    ];

    return this.createMiniAssessment({
      studentId: skillGap.studentId,
      teacherId,
      skillGapId,
      title: `Mini-Assessment: Verify Gap Closure`,
      description:
        'Complete this assessment to confirm you have mastered the skill',
      targetSkillId: skillGap.skillId,
      targetSubjectId: skillGap.subjectId,
      questions,
      totalQuestions: questions.length,
      passingScore: 70.0,
    });
  }
}

