import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class ActivityGenerationService {
  private openai: OpenAI;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  /**
   * Generate quiz questions for a skill
   */
  async generateQuickQuiz(params: {
    subjectId: string;
    skillId: string;
    yearGroup: string;
    difficulty: string;
    questionCount: number;
  }) {
    const { subjectId, skillId, yearGroup, difficulty, questionCount } = params;

    // Get subject and skill info
    const skill = await this.prisma.skill.findUnique({
      where: { id: skillId },
      include: {
        subject: {
          include: {
            yearGroup: true,
          },
        },
      },
    });

    if (!skill) {
      throw new Error('Skill not found');
    }

    const prompt = `Generate ${questionCount} multiple choice questions for ${yearGroup} students on the topic of ${skill.displayName} in ${skill.subject.displayName}.

Difficulty level: ${difficulty}

For each question, provide:
1. The question text
2. Four options (A, B, C, D)
3. The correct answer (letter)
4. A brief explanation of why it's correct

Return as a JSON array with this structure:
[
  {
    "question": "Question text here",
    "options": {
      "A": "Option A",
      "B": "Option B",
      "C": "Option C",
      "D": "Option D"
    },
    "correctAnswer": "A",
    "explanation": "Brief explanation"
  }
]`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-5.5',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert educator creating age-appropriate quiz questions for students.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result.questions || [];
    } catch (error) {
      console.error('Error generating quiz:', error);
      return [];
    }
  }

  /**
   * Generate scaffolded exercises (step-by-step, easier to harder)
   */
  async generateScaffoldedExercises(params: {
    subjectId: string;
    skillId: string;
    yearGroup: string;
    exerciseCount: number;
  }) {
    const { subjectId, skillId, yearGroup, exerciseCount } = params;

    const skill = await this.prisma.skill.findUnique({
      where: { id: skillId },
      include: {
        subject: true,
      },
    });

    if (!skill) {
      throw new Error('Skill not found');
    }

    const prompt = `Generate ${exerciseCount} scaffolded exercises for ${yearGroup} students learning ${skill.displayName} in ${skill.subject.displayName}.

Start with very easy examples and gradually increase difficulty.
Each exercise should build on the previous one.

Return as JSON:
{
  "exercises": [
    {
      "step": 1,
      "difficulty": "very_easy",
      "question": "Question text",
      "guidance": "Step-by-step guidance",
      "expectedAnswer": "Expected answer",
      "hints": ["Hint 1", "Hint 2"]
    }
  ]
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-5.5',
        messages: [
          {
            role: 'system',
            content: 'You are an expert educator creating scaffolded learning exercises.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 2500,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result.exercises || [];
    } catch (error) {
      console.error('Error generating scaffolded exercises:', error);
      return [];
    }
  }

  /**
   * Generate a supercurriculum project
   */
  async generateProject(params: {
    subjectId: string;
    skillId: string;
    yearGroup: string;
    duration: number; // minutes
  }) {
    const { subjectId, skillId, yearGroup, duration } = params;

    const skill = await this.prisma.skill.findUnique({
      where: { id: skillId },
      include: {
        subject: true,
      },
    });

    if (!skill) {
      throw new Error('Skill not found');
    }

    const prompt = `Create an engaging project-based learning activity for ${yearGroup} students on ${skill.displayName} in ${skill.subject.displayName}.

Time available: ${duration} minutes

The project should:
- Be creative and investigative
- Connect to real-world applications
- Include clear success criteria
- Be appropriate for the student's age

Return as JSON:
{
  "title": "Project title",
  "description": "What students will do",
  "learningObjectives": ["Objective 1", "Objective 2"],
  "instructions": [
    {
      "step": 1,
      "instruction": "What to do",
      "estimatedTime": 10
    }
  ],
  "resources": ["Resource 1", "Resource 2"],
  "successCriteria": ["Criteria 1", "Criteria 2"],
  "extensionIdeas": ["Extension 1", "Extension 2"]
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-5.5',
        messages: [
          {
            role: 'system',
            content: 'You are an expert educator creating project-based learning activities.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.8,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result;
    } catch (error) {
      console.error('Error generating project:', error);
      return null;
    }
  }

  /**
   * Generate exam-style questions
   */
  async generateExamQuestions(params: {
    subjectId: string;
    skillId: string;
    yearGroup: string;
    questionCount: number;
  }) {
    const { subjectId, skillId, yearGroup, questionCount } = params;

    const skill = await this.prisma.skill.findUnique({
      where: { id: skillId },
      include: {
        subject: true,
      },
    });

    if (!skill) {
      throw new Error('Skill not found');
    }

    const prompt = `Generate ${questionCount} exam-style questions for ${yearGroup} students on ${skill.displayName} in ${skill.subject.displayName}.

Questions should:
- Match the format of real exams for this year group
- Include mark allocations
- Have clear marking criteria
- Range from easier to more challenging

Return as JSON:
{
  "questions": [
    {
      "questionNumber": 1,
      "question": "Question text",
      "marks": 4,
      "markingCriteria": {
        "1mark": "What gets 1 mark",
        "2marks": "What gets 2 marks",
        "3marks": "What gets 3 marks",
        "4marks": "What gets full marks"
      },
      "modelAnswer": "Example of a full-marks answer"
    }
  ]
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-5.5',
        messages: [
          {
            role: 'system',
            content: 'You are an expert exam writer creating assessment questions.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 2500,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result.questions || [];
    } catch (error) {
      console.error('Error generating exam questions:', error);
      return [];
    }
  }

  /**
   * Generate retrieval practice questions (review of past knowledge)
   */
  async generateRetrievalPractice(params: {
    userId: string;
    subjectId: string;
    questionCount: number;
  }) {
    const { userId, subjectId, questionCount } = params;

    // Get skills the student has practiced before
    const masteryRecords = await this.prisma.skillMastery.findMany({
      where: {
        userId,
        subjectId,
        lastPracticed: { not: null },
      },
      include: {
        skill: true,
      },
      orderBy: {
        lastPracticed: 'asc', // Oldest first for spacing effect
      },
      take: questionCount,
    });

    // Generate quick review questions for these skills
    const questions = [];

    for (const record of masteryRecords) {
      questions.push({
        skillId: record.skillId,
        skillName: record.skill.displayName,
        question: `Quick review: ${record.skill.displayName}`,
        difficulty: this.getDifficultyFromMastery(record.masteryLevel),
        type: 'retrieval_practice',
      });
    }

    return questions;
  }

  /**
   * Generate interleaved practice (mix of different skills)
   */
  async generateInterleavedPractice(params: {
    userId: string;
    subjectId: string;
    exerciseCount: number;
  }) {
    const { userId, subjectId, exerciseCount } = params;

    // Get multiple skills from this subject
    const masteryRecords = await this.prisma.skillMastery.findMany({
      where: {
        userId,
        subjectId,
      },
      include: {
        skill: true,
      },
      take: 3, // Mix 3 different skills
    });

    if (masteryRecords.length === 0) {
      return [];
    }

    // Create a mix of questions from different skills
    const exercises = [];
    for (let i = 0; i < exerciseCount; i++) {
      const record = masteryRecords[i % masteryRecords.length];
      exercises.push({
        skillId: record.skillId,
        skillName: record.skill.displayName,
        orderIndex: i,
        type: 'interleaved',
        difficulty: this.getDifficultyFromMastery(record.masteryLevel),
      });
    }

    return exercises;
  }

  /**
   * Map mastery level to difficulty
   */
  private getDifficultyFromMastery(masteryLevel: string): string {
    switch (masteryLevel) {
      case 'MASTERY':
        return 'hard';
      case 'SECURE':
        return 'medium';
      case 'DEVELOPING':
        return 'easy';
      default:
        return 'very_easy';
    }
  }
}

