import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Band } from '@prisma/client';

/**
 * Service to provide comprehensive SuperCurriculum data for AI/OpenAI consumption
 */
@Injectable()
export class SupercurriculumService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get complete SuperCurriculum structure for a year group
   * This returns ALL data needed for OpenAI to make recommendations
   */
  async getCompleteStructure(yearGroupName: string, locale: string = 'en-GB') {
    const yearGroup = await this.prisma.yearGroup.findUnique({
      where: { 
        name_locale: {
          name: yearGroupName,
          locale: locale,
        },
      },
      include: {
        subjects: {
          where: { isActive: true },
          orderBy: { orderIndex: 'asc' },
          include: {
            skills: {
              orderBy: { orderIndex: 'asc' },
              include: {
                feedbackTests: {
                  where: { isActive: true },
                  include: {
                    questions: {
                      orderBy: { orderIndex: 'asc' },
                    },
                  },
                },
                interventions: {
                  orderBy: { band: 'asc' },
                },
                activities: {
                  where: { isActive: true },
                  orderBy: [
                    { difficulty: 'asc' },
                    { activityType: 'asc' },
                  ],
                },
              },
            },
          },
        },
      },
    });

    if (!yearGroup) {
      throw new Error(`Year group ${yearGroupName} not found`);
    }

    // Transform into a clean structure for AI consumption
    return {
      yearGroup: {
        name: yearGroup.name,
        displayName: yearGroup.displayName,
      },
      subjects: yearGroup.subjects.map(subject => ({
        name: subject.name,
        displayName: subject.displayName,
        description: subject.description,
        whyMatters: subject.whyMatters,
        skills: subject.skills.map(skill => ({
          name: skill.name,
          displayName: skill.displayName,
          description: skill.description,
          
          // Feedback test structure
          feedbackTest: skill.feedbackTests[0] ? {
            title: skill.feedbackTests[0].title,
            description: skill.feedbackTests[0].description,
            questions: skill.feedbackTests[0].questions.map(q => ({
              statement: q.statement,
              orderIndex: q.orderIndex,
            })),
            scoringGuide: {
              '1-2': 'NEEDS_SUPPORT - Student requires foundational support',
              '3': 'DEVELOPING - Student is making progress',
              '4-5': 'SECURE - Student demonstrates strong understanding',
            },
          } : null,

          // Intervention framework
          interventions: {
            NEEDS_SUPPORT: this.findIntervention(skill.interventions, Band.NEEDS_SUPPORT),
            DEVELOPING: this.findIntervention(skill.interventions, Band.DEVELOPING),
            SECURE: this.findIntervention(skill.interventions, Band.SECURE),
          },

          // Activities organized by band
          activities: {
            NEEDS_SUPPORT: skill.activities
              .filter(a => a.difficulty === Band.NEEDS_SUPPORT)
              .map(a => this.formatActivity(a)),
            DEVELOPING: skill.activities
              .filter(a => a.difficulty === Band.DEVELOPING)
              .map(a => this.formatActivity(a)),
            SECURE: skill.activities
              .filter(a => a.difficulty === Band.SECURE)
              .map(a => this.formatActivity(a)),
          },
        })),
      })),
    };
  }

  /**
   * Get intervention guidance for specific subject/skill/band
   */
  async getIntervention(
    subjectName: string,
    skillName: string,
    band: Band,
    yearGroupName: string = 'year_7',
  ) {
    const intervention = await this.prisma.intervention.findFirst({
      where: {
        band,
        skill: {
          name: skillName,
          subject: {
            name: subjectName,
            yearGroup: {
              name: yearGroupName,
            },
          },
        },
      },
      include: {
        subject: true,
        skill: true,
      },
    });

    if (!intervention) {
      return null;
    }

    return {
      subject: intervention.subject.displayName,
      skill: intervention.skill.displayName,
      band: intervention.band,
      description: intervention.description,
      taskGuidance: intervention.taskGuidance,
      expectedOutcome: intervention.expectedOutcome,
    };
  }

  /**
   * Get activities for a specific subject/skill/band
   */
  async getActivities(
    subjectName: string,
    skillName: string,
    band: Band,
    yearGroupName: string = 'year_7',
    limit: number = 10,
  ) {
    const activities = await this.prisma.activity.findMany({
      where: {
        difficulty: band,
        isActive: true,
        skill: {
          name: skillName,
        },
        subject: {
          name: subjectName,
          yearGroup: {
            name: yearGroupName,
          },
        },
      },
      include: {
        subject: true,
        skill: true,
      },
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return activities.map(activity => ({
      id: activity.id,
      title: activity.title,
      description: activity.description,
      instructions: activity.instructions,
      activityType: activity.activityType,
      difficulty: activity.difficulty,
      estimatedMinutes: activity.estimatedMinutes,
      externalUrl: activity.externalUrl,
      resources: activity.resources,
      subject: activity.subject.displayName,
      skill: activity.skill.displayName,
    }));
  }

  /**
   * Get student's current bands and corresponding interventions
   */
  async getStudentRecommendations(userId: string) {
    const studentBands = await this.prisma.studentBand.findMany({
      where: { userId },
      include: {
        subject: {
          include: {
            yearGroup: true,
          },
        },
        skill: true,
      },
    });

    const recommendations = await Promise.all(
      studentBands.map(async band => {
        // Get intervention guidance
        const intervention = await this.getIntervention(
          band.subject.name,
          band.skill.name,
          band.currentBand,
          band.subject.yearGroup.name,
        );

        // Get recommended activities
        const activities = await this.getActivities(
          band.subject.name,
          band.skill.name,
          band.currentBand,
          band.subject.yearGroup.name,
          5, // Top 5 activities
        );

        return {
          subject: band.subject.displayName,
          skill: band.skill.displayName,
          currentBand: band.currentBand,
          lastUpdated: band.lastUpdated,
          intervention,
          recommendedActivities: activities,
        };
      }),
    );

    return recommendations;
  }

  /**
   * Generate a comprehensive OpenAI reference document
   * This can be included in the system prompt or used for RAG
   */
  async generateOpenAIReference(yearGroupName: string = 'year_7') {
    const structure = await this.getCompleteStructure(yearGroupName);

    return {
      systemContext: this.buildSystemContext(structure),
      structuredData: structure,
      instructions: {
        usage: 'Use this data to recommend activities based on student assessment scores',
        scoringGuide: {
          'Average 1-2': 'NEEDS_SUPPORT band - recommend foundational activities',
          'Average 3': 'DEVELOPING band - recommend practice activities',
          'Average 4-5': 'SECURE band - recommend extension activities',
        },
        workflow: [
          '1. Student takes feedback test (4 questions, 1-5 scale)',
          '2. Calculate average score',
          '3. Map to band (NEEDS_SUPPORT/DEVELOPING/SECURE)',
          '4. Look up intervention guidance for that subject+skill+band',
          '5. Recommend 3-5 activities from that band',
        ],
      },
    };
  }

  /**
   * Export all data as JSON file for OpenAI reference
   */
  async exportForOpenAI() {
    const yearGroups = ['year_7', 'year_8', 'year_9'];
    
    const allData = await Promise.all(
      yearGroups.map(async yearGroup => {
        return this.generateOpenAIReference(yearGroup);
      }),
    );

    return {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      description: 'Complete SuperCurriculum structure for AI-powered recommendations',
      yearGroups: allData,
    };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private findIntervention(interventions: any[], band: Band) {
    const intervention = interventions.find(i => i.band === band);
    if (!intervention) return null;

    return {
      description: intervention.description,
      taskGuidance: intervention.taskGuidance,
      expectedOutcome: intervention.expectedOutcome,
    };
  }

  private formatActivity(activity: any) {
    return {
      id: activity.id,
      title: activity.title,
      description: activity.description,
      instructions: activity.instructions,
      activityType: activity.activityType,
      estimatedMinutes: activity.estimatedMinutes,
      externalUrl: activity.externalUrl,
      resources: activity.resources,
    };
  }

  private buildSystemContext(structure: any): string {
    return `
# SuperCurriculum System Context

You are an AI assistant for the SuperCurriculum system. You help students in ${structure.yearGroup.displayName} 
develop skills beyond the core curriculum through enrichment activities.

## Available Subjects

${structure.subjects.map((s: any) => `
### ${s.displayName}

**Why SuperCurriculum matters in ${s.displayName}:**
${s.whyMatters}

**Skills:**
${s.skills.map((sk: any) => `- ${sk.displayName}: ${sk.description}`).join('\n')}
`).join('\n')}

## How to Use This System

1. When a student reports their assessment score, calculate the average
2. Map the average to a band:
   - 1-2 = NEEDS_SUPPORT
   - 3 = DEVELOPING
   - 4-5 = SECURE
3. Look up the intervention guidance for that subject + skill + band
4. Recommend 3-5 activities from the appropriate band

## Example Conversation

Student: "I just took my English Reading assessment. I scored: 2, 3, 2, 3 on the four questions."
AI: "Your average score is 2.5, which puts you in the DEVELOPING band for Reading. 
Here's what I recommend: [Look up intervention for english + reading + DEVELOPING]
Here are some activities to help you improve: [List 3-5 activities from DEVELOPING band]"
    `.trim();
  }
}

