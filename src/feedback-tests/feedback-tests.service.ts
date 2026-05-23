import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFeedbackTestDto } from './dto/create-feedback-test.dto';
import { UpdateFeedbackTestDto } from './dto/update-feedback-test.dto';

@Injectable()
export class FeedbackTestsService {
  private readonly logger = new Logger(FeedbackTestsService.name);
  
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new feedback test with questions
   */
  async create(createFeedbackTestDto: CreateFeedbackTestDto) {
    const { questions, ...testData } = createFeedbackTestDto;

    // Check if test already exists for this subject + skill
    const existing = await this.prisma.feedbackTest.findUnique({
      where: {
        subjectId_skillId: {
          subjectId: testData.subjectId,
          skillId: testData.skillId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException(
        'A feedback test already exists for this subject and skill',
      );
    }

    return this.prisma.feedbackTest.create({
      data: {
        ...testData,
        questions: {
          create: questions.map((q, index) => ({
            statement: q.statement,
            orderIndex: index,
          })),
        },
      },
      include: {
        subject: true,
        skill: true,
        questions: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });
  }

  /**
   * Get all feedback tests
   * Auto-generates tests for subjects that don't have any
   */
  async findAll(subjectId?: string, skillId?: string, yearGroupId?: string) {
    // If filtering by subject, ensure tests exist for all skills
    if (subjectId) {
      await this.ensureTestsExistForSubject(subjectId);
    }

    const where: any = {
      isActive: true,
    };

    if (subjectId) where.subjectId = subjectId;
    if (skillId) where.skillId = skillId;
    if (yearGroupId) {
      where.subject = {
        yearGroupId: yearGroupId,
      };
    }

    return this.prisma.feedbackTest.findMany({
      where,
      include: {
        subject: {
          include: {
            yearGroup: true,
          },
        },
        skill: true,
        questions: {
          orderBy: { orderIndex: 'asc' },
        },
        _count: {
          select: { assessments: true },
        },
      },
    });
  }

  /**
   * Ensure feedback tests exist for all skills in a subject
   * Auto-generates any missing tests
   */
  private async ensureTestsExistForSubject(subjectId: string) {
    // Get all skills for this subject
    const skills = await this.prisma.skill.findMany({
      where: { subjectId },
    });

    // Check which skills already have tests
    const existingTests = await this.prisma.feedbackTest.findMany({
      where: { subjectId },
      select: { skillId: true },
    });
    const existingSkillIds = new Set(existingTests.map(t => t.skillId));

    // Generate tests for skills that don't have one
    for (const skill of skills) {
      if (!existingSkillIds.has(skill.id)) {
        try {
          await this.autoGenerateTest(subjectId, skill.id);
        } catch (error) {
          this.logger.warn(`Could not auto-generate test for skill ${skill.id}:`, error);
        }
      }
    }
  }

  /**
   * Get feedback test by ID
   */
  async findOne(id: string) {
    const test = await this.prisma.feedbackTest.findUnique({
      where: { id },
      include: {
        subject: true,
        skill: true,
        questions: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!test) {
      throw new NotFoundException(`Feedback test with ID ${id} not found`);
    }

    return test;
  }

  /**
   * Get test for specific subject and skill
   * Auto-generates a test if one doesn't exist (no admin intervention needed)
   */
  async findBySubjectAndSkill(subjectId: string, skillId: string) {
    let test = await this.prisma.feedbackTest.findUnique({
      where: {
        subjectId_skillId: {
          subjectId,
          skillId,
        },
      },
      include: {
        subject: true,
        skill: true,
        questions: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    // Auto-generate test if it doesn't exist
    if (!test) {
      this.logger.log(`No test found for subject ${subjectId} and skill ${skillId}, auto-generating...`);
      test = await this.autoGenerateTest(subjectId, skillId);
    }

    return test;
  }

  /**
   * Auto-generate a feedback test for a subject/skill combination
   * This allows the system to work without admin intervention
   */
  private async autoGenerateTest(subjectId: string, skillId: string) {
    // Get subject and skill details
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
      include: { yearGroup: true },
    });

    const skill = await this.prisma.skill.findUnique({
      where: { id: skillId },
    });

    if (!subject || !skill) {
      throw new NotFoundException('Subject or skill not found');
    }

    // Generate self-assessment questions based on the skill
    const questions = this.generateQuestionsForSkill(skill.displayName, skill.description || '');

    // Create the test with questions
    const test = await this.prisma.feedbackTest.create({
      data: {
        subjectId,
        skillId,
        title: `${skill.displayName} Self-Assessment`,
        description: `Assess your confidence and ability in ${skill.displayName} for ${subject.displayName}.`,
        questions: {
          create: questions.map((statement, index) => ({
            statement,
            orderIndex: index,
          })),
        },
      },
      include: {
        subject: true,
        skill: true,
        questions: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    this.logger.log(`Auto-generated feedback test: ${test.title}`);
    return test;
  }

  /**
   * Generate self-assessment questions for a skill
   */
  private generateQuestionsForSkill(skillName: string, skillDescription: string): string[] {
    // Generic self-assessment question templates that work for any skill
    const templates = [
      `I feel confident in my ${skillName.toLowerCase()} abilities.`,
      `I can demonstrate ${skillName.toLowerCase()} skills independently.`,
      `I understand the key concepts related to ${skillName.toLowerCase()}.`,
      `I can apply ${skillName.toLowerCase()} skills to new situations.`,
      `I can explain ${skillName.toLowerCase()} concepts to others.`,
      `I can identify my strengths in ${skillName.toLowerCase()}.`,
      `I know what areas of ${skillName.toLowerCase()} I need to improve.`,
      `I feel prepared when faced with ${skillName.toLowerCase()} tasks.`,
    ];

    return templates;
  }

  /**
   * Update feedback test
   */
  async update(id: string, updateFeedbackTestDto: UpdateFeedbackTestDto) {
    const test = await this.findOne(id);
    const { questions, ...testData } = updateFeedbackTestDto;

    // If questions are provided, update them
    if (questions) {
      // Delete existing questions
      await this.prisma.testQuestion.deleteMany({
        where: { testId: id },
      });

      // Create new questions
      await this.prisma.testQuestion.createMany({
        data: questions.map((q, index) => ({
          testId: id,
          statement: q.statement,
          orderIndex: index,
        })),
      });
    }

    // Update test data
    return this.prisma.feedbackTest.update({
      where: { id },
      data: testData,
      include: {
        subject: true,
        skill: true,
        questions: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });
  }

  /**
   * Delete feedback test (soft delete)
   */
  async remove(id: string) {
    await this.findOne(id);
    
    return this.prisma.feedbackTest.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Get all tests for a year group (via subjects)
   */
  async findByYearGroup(yearGroupId: string) {
    return this.prisma.feedbackTest.findMany({
      where: {
        isActive: true,
        subject: {
          yearGroupId,
        },
      },
      include: {
        subject: true,
        skill: true,
        questions: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });
  }
}
