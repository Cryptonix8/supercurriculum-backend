import { Injectable } from '@nestjs/common';
import { SupercurriculumService } from '../supercurriculum/supercurriculum.service';
import { Band } from '@prisma/client';

/**
 * Service that implements OpenAI function calling for SuperCurriculum
 */
@Injectable()
export class OpenAIFunctionsService {
  constructor(
    private supercurriculumService: SupercurriculumService,
  ) {}

  /**
   * Define the functions that OpenAI can call
   */
  getFunctionDefinitions() {
    return [
      {
        name: 'get_intervention_guidance',
        description: 'Get intervention guidance for a student based on their assessment score in a specific subject and skill',
        parameters: {
          type: 'object',
          properties: {
            subject: {
              type: 'string',
              description: 'The subject name (e.g., "english", "maths", "science")',
              enum: [
                'english',
                'maths',
                'science',
                'history',
                'geography',
                'art_design',
                'design_technology',
                'music',
                'pe',
                'religious_education',
                'eal',
                'spanish',
                'greek',
                'pshe_citizenship',
              ],
            },
            skill: {
              type: 'string',
              description: 'The skill name (e.g., "reading", "writing", "listening", "problem_solving")',
            },
            band: {
              type: 'string',
              description: 'The performance band based on assessment score: NEEDS_SUPPORT (1-2), DEVELOPING (3), SECURE (4-5)',
              enum: ['NEEDS_SUPPORT', 'DEVELOPING', 'SECURE'],
            },
            yearGroup: {
              type: 'string',
              description: 'The student\'s year group',
              enum: ['year_7', 'year_8', 'year_9'],
              default: 'year_7',
            },
          },
          required: ['subject', 'skill', 'band'],
        },
      },
      {
        name: 'get_recommended_activities',
        description: 'Get a list of recommended SuperCurriculum activities for a specific subject, skill, and performance band',
        parameters: {
          type: 'object',
          properties: {
            subject: {
              type: 'string',
              description: 'The subject name',
            },
            skill: {
              type: 'string',
              description: 'The skill name',
            },
            band: {
              type: 'string',
              description: 'The performance band',
              enum: ['NEEDS_SUPPORT', 'DEVELOPING', 'SECURE'],
            },
            yearGroup: {
              type: 'string',
              description: 'The student\'s year group',
              default: 'year_7',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of activities to return',
              default: 5,
              minimum: 1,
              maximum: 20,
            },
          },
          required: ['subject', 'skill', 'band'],
        },
      },
      {
        name: 'calculate_student_band',
        description: 'Calculate a student\'s performance band from their feedback test scores (4 questions, 1-5 scale)',
        parameters: {
          type: 'object',
          properties: {
            scores: {
              type: 'array',
              items: {
                type: 'number',
                minimum: 1,
                maximum: 5,
              },
              minItems: 4,
              maxItems: 4,
              description: 'Array of exactly 4 scores (1-5 scale) from the feedback test',
            },
          },
          required: ['scores'],
        },
      },
      {
        name: 'get_subject_info',
        description: 'Get information about a specific subject including why SuperCurriculum matters',
        parameters: {
          type: 'object',
          properties: {
            subject: {
              type: 'string',
              description: 'The subject name',
            },
            yearGroup: {
              type: 'string',
              description: 'The year group',
              default: 'year_7',
            },
          },
          required: ['subject'],
        },
      },
      {
        name: 'get_student_recommendations',
        description: 'Get personalized recommendations for a student based on their current performance bands',
        parameters: {
          type: 'object',
          properties: {
            userId: {
              type: 'string',
              description: 'The student\'s user ID',
            },
          },
          required: ['userId'],
        },
      },
    ];
  }

  /**
   * Handle a function call from OpenAI
   */
  async handleFunctionCall(functionName: string, args: any) {
    switch (functionName) {
      case 'get_intervention_guidance':
        return this.getInterventionGuidance(args);

      case 'get_recommended_activities':
        return this.getRecommendedActivities(args);

      case 'calculate_student_band':
        return this.calculateStudentBand(args);

      case 'get_subject_info':
        return this.getSubjectInfo(args);

      case 'get_student_recommendations':
        return this.getStudentRecommendations(args);

      default:
        throw new Error(`Unknown function: ${functionName}`);
    }
  }

  /**
   * Get intervention guidance for subject + skill + band
   */
  private async getInterventionGuidance(args: {
    subject: string;
    skill: string;
    band: Band;
    yearGroup?: string;
  }) {
    const intervention = await this.supercurriculumService.getIntervention(
      args.subject,
      args.skill,
      args.band,
      args.yearGroup || 'year_7',
    );

    if (!intervention) {
      return {
        error: `No intervention found for ${args.subject} - ${args.skill} at ${args.band} level`,
        suggestion: 'This combination may not exist in the database yet.',
      };
    }

    return intervention;
  }

  /**
   * Get recommended activities for subject + skill + band
   */
  private async getRecommendedActivities(args: {
    subject: string;
    skill: string;
    band: Band;
    yearGroup?: string;
    limit?: number;
  }) {
    const activities = await this.supercurriculumService.getActivities(
      args.subject,
      args.skill,
      args.band,
      args.yearGroup || 'year_7',
      args.limit || 5,
    );

    if (activities.length === 0) {
      return {
        activities: [],
        message: `No activities found yet for ${args.subject} - ${args.skill} at ${args.band} level.`,
      };
    }

    return {
      activities,
      count: activities.length,
    };
  }

  /**
   * Calculate student's band from their 4 test scores
   */
  private calculateStudentBand(args: { scores: number[] }): {
    scores: number[];
    averageScore: number;
    band: Band;
    interpretation: string;
    recommendations: string[];
  } {
    // Validate scores
    if (args.scores.length !== 4) {
      throw new Error('Exactly 4 scores are required');
    }

    if (args.scores.some(score => score < 1 || score > 5)) {
      throw new Error('All scores must be between 1 and 5');
    }

    // Calculate average
    const average = args.scores.reduce((a, b) => a + b, 0) / args.scores.length;

    let band: Band;
    let interpretation: string;
    let recommendations: string[];

    if (average < 2.5) {
      band = Band.NEEDS_SUPPORT;
      interpretation =
        'Your scores suggest you would benefit from foundational support in this skill. Don\'t worry - everyone starts somewhere, and with the right activities, you\'ll build confidence quickly!';
      recommendations = [
        'Start with shorter, more accessible tasks',
        'Use provided templates and frameworks',
        'Work with others or ask for help when needed',
        'Focus on building your confidence step by step',
      ];
    } else if (average < 3.5) {
      band = Band.DEVELOPING;
      interpretation =
        'You\'re making good progress! Your understanding is developing well. The next step is to practice independently and challenge yourself a bit more.';
      recommendations = [
        'Practice similar tasks independently',
        'Try to explain what you\'ve learned to others',
        'Look for patterns and connections',
        'Push yourself slightly beyond your comfort zone',
      ];
    } else {
      band = Band.SECURE;
      interpretation =
        'Excellent work! You\'re demonstrating strong understanding in this skill. Let\'s challenge you with more advanced and creative tasks.';
      recommendations = [
        'Explore complex and challenging materials',
        'Lead others or teach what you know',
        'Make creative connections between ideas',
        'Pursue independent projects in this area',
      ];
    }

    return {
      scores: args.scores,
      averageScore: parseFloat(average.toFixed(2)),
      band,
      interpretation,
      recommendations,
    };
  }

  /**
   * Get information about a specific subject
   */
  private async getSubjectInfo(args: {
    subject: string;
    yearGroup?: string;
  }) {
    const structure = await this.supercurriculumService.getCompleteStructure(
      args.yearGroup || 'year_7',
    );

    const subject = structure.subjects.find(s => s.name === args.subject);

    if (!subject) {
      return {
        error: `Subject "${args.subject}" not found for ${args.yearGroup || 'year_7'}`,
      };
    }

    return {
      name: subject.name,
      displayName: subject.displayName,
      description: subject.description,
      whyMatters: subject.whyMatters,
      skills: subject.skills.map(skill => ({
        name: skill.name,
        displayName: skill.displayName,
        description: skill.description,
      })),
    };
  }

  /**
   * Get student's personalized recommendations based on their current bands
   */
  private async getStudentRecommendations(args: { userId: string }) {
    return this.supercurriculumService.getStudentRecommendations(args.userId);
  }

  /**
   * Generate the system prompt for OpenAI
   */
  async getSystemPrompt(yearGroup: string = 'year_7'): Promise<string> {
    const reference = await this.supercurriculumService.generateOpenAIReference(yearGroup);

    return `${reference.systemContext}

## Your Role

You are a friendly, encouraging SuperCurriculum AI assistant. Your job is to:
1. Help students understand their assessment results
2. Provide personalized intervention guidance based on their performance band
3. Recommend specific activities that match their current level
4. Encourage and motivate students to engage with enrichment tasks
5. Explain why SuperCurriculum matters for their learning

## How to Respond

When a student shares their assessment scores:
1. **Calculate their band** using calculate_student_band
2. **Get intervention guidance** for their subject+skill+band
3. **Get recommended activities** (3-5 activities)
4. **Present in a friendly, encouraging way**

Always:
- Be encouraging and positive
- Explain things clearly
- Break down complex tasks into steps
- Celebrate their progress
- Help them see why this work matters

Example format:
"Great job completing your assessment! Your score of [X] puts you in the [BAND] range for [Subject] [Skill]. 
[Encouraging interpretation]

Here's what I recommend:
[Intervention guidance]

Recommended activities:
1. [Activity title] - [Time] - [Brief description]
2. ...

Which activity sounds most interesting to you?"
`;
  }
}

