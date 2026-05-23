import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { formatCurriculumTopicDisplay } from '../common/activity-content.util';

@Injectable()
export class AiAgentToolsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /**
   * Tool 1: curriculum_lookup
   * Retrieves curriculum content from database
   */
  async curriculumLookup(params: {
    yearGroupId?: string;
    subjectId?: string;
    keyStage?: string;
    topicName?: string;
    locale?: string;
  }) {
    try {
      const where: any = {};

      if (params.yearGroupId) where.yearGroupId = params.yearGroupId;
      if (params.subjectId) where.subjectId = params.subjectId;
      if (params.keyStage) where.keyStage = params.keyStage;
      const locale = params.locale || 'en-GB';
      if (locale === 'el-GR') {
        where.locale = 'el-GR';
      } else {
        where.OR = [{ locale: 'en-GB' }, { locale: null }];
      }
      if (params.topicName) {
        where.topicName = {
          contains: params.topicName,
          mode: 'insensitive',
        };
      }

      const topics = await this.prisma.curriculumTopic.findMany({
        where,
        include: {
          yearGroup: true,
          subject: true,
          supercurriculumActivities: {
            where: { teacherApproved: true },
            take: 5,
          },
        },
        orderBy: [{ nationalCurriculumRef: 'asc' }, { topicName: 'asc' }],
        take: 80,
      });

      const enrichedTopics = topics.map((t) => ({
        ...t,
        displayName: formatCurriculumTopicDisplay(t),
        unitRef: t.nationalCurriculumRef || null,
      }));

      return {
        success: true,
        topics: enrichedTopics,
        count: enrichedTopics.length,
      };
    } catch (error) {
      console.error('Error in curriculum_lookup:', error);
      return {
        success: false,
        error: 'Failed to retrieve curriculum content',
        topics: [],
        count: 0,
      };
    }
  }

  /**
   * Tool 2: extract_objectives
   * Gets specific learning objectives for a topic
   */
  async extractObjectives(params: {
    topicId?: string;
    yearGroupId?: string;
    subjectId?: string;
    keyStage?: string;
  }) {
    try {
      const where: any = {};

      if (params.topicId) {
        where.id = params.topicId;
      } else {
        if (params.yearGroupId) where.yearGroupId = params.yearGroupId;
        if (params.subjectId) where.subjectId = params.subjectId;
        if (params.keyStage) where.keyStage = params.keyStage;
      }

      const topics = await this.prisma.curriculumTopic.findMany({
        where,
        select: {
          id: true,
          topicName: true,
          learningObjectives: true,
          keySkills: true,
          priorKnowledge: true,
          keyStage: true,
          subject: {
            select: {
              displayName: true,
            },
          },
          yearGroup: {
            select: {
              displayName: true,
            },
          },
        },
        take: 10,
      });

      return {
        success: true,
        objectives: topics,
        count: topics.length,
      };
    } catch (error) {
      console.error('Error in extract_objectives:', error);
      return {
        success: false,
        error: 'Failed to extract learning objectives',
        objectives: [],
        count: 0,
      };
    }
  }

  /**
   * Tool 3: analyze_student
   * Analyzes student data for personalization
   */
  async analyzeStudent(params: { userId: string }) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: params.userId },
        include: {
          studentProfile: {
            include: {
              yearGroup: true,
            },
          },
          studentBands: {
            include: {
              subject: true,
              skill: true,
            },
          },
          skillMastery: {
            include: {
              subject: true,
              skill: true,
            },
            orderBy: {
              masteryPercentage: 'asc',
            },
          },
          weeklyPlans: {
            where: {
              status: 'ACTIVE',
            },
            include: {
              tasks: {
                include: {
                  activity: {
                    include: {
                      subject: true,
                      skill: true,
                    },
                  },
                },
              },
            },
            take: 1,
          },
        },
      });

      if (!user) {
        return {
          success: false,
          error: 'Student not found',
        };
      }

      // Calculate performance metrics
      const completedTasks = await this.prisma.plannedTask.count({
        where: {
          plan: { userId: params.userId },
          status: 'COMPLETED',
        },
      });

      const totalTasks = await this.prisma.plannedTask.count({
        where: {
          plan: { userId: params.userId },
        },
      });

      const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

      // Identify strengths and weaknesses
      const strengths = user.skillMastery
        .filter((sm) => sm.masteryPercentage >= 70)
        .slice(0, 5);

      const weaknesses = user.skillMastery
        .filter((sm) => sm.masteryPercentage < 50)
        .slice(0, 5);

      // Get recent learning sessions
      const recentSessions = await this.prisma.learningSession.findMany({
        where: { userId: params.userId },
        orderBy: { startedAt: 'desc' },
        take: 5,
        include: {
          sessionItems: true,
        },
      });

      // Calculate recent accuracy
      const recentItems = recentSessions
        .flatMap((s: any) => s.sessionItems)
        .filter((item: any) => item.isCorrect !== null);

      const recentAccuracy = recentItems.length > 0
        ? (recentItems.filter((item: any) => item.isCorrect).length / recentItems.length) * 100
        : 0;

      return {
        success: true,
        student: {
          id: user.id,
          name: `${user.firstName} ${user.lastName}`,
          yearGroup: user.studentProfile?.yearGroup?.displayName,
          profile: {
            preferredLearningMode: user.studentProfile?.preferredLearningMode,
            preferredChallengeLevel: user.studentProfile?.preferredChallengeLevel,
            weeklyStudyTime: user.studentProfile?.weeklyStudyTime,
            interests: user.studentProfile?.interests,
            subjectConfidence: user.studentProfile?.subjectConfidence,
          },
          performance: {
            completionRate: completionRate.toFixed(1),
            completedTasks,
            totalTasks,
            recentAccuracy: recentAccuracy.toFixed(1),
          },
          strengths: strengths.map((s) => ({
            subject: s.subject.displayName,
            skill: s.skill.displayName,
            masteryPercentage: s.masteryPercentage,
            masteryLevel: s.masteryLevel,
          })),
          weaknesses: weaknesses.map((w) => ({
            subject: w.subject.displayName,
            skill: w.skill.displayName,
            masteryPercentage: w.masteryPercentage,
            masteryLevel: w.masteryLevel,
          })),
          currentBands: user.studentBands.map((b) => ({
            subject: b.subject.displayName,
            skill: b.skill.displayName,
            band: b.currentBand,
          })),
          activePlan: user.weeklyPlans[0] || null,
        },
      };
    } catch (error) {
      console.error('Error in analyze_student:', error);
      return {
        success: false,
        error: 'Failed to analyze student data',
      };
    }
  }

  /**
   * Tool 4: generate_activity_template
   * Creates structured activities based on curriculum
   */
  async generateActivityTemplate(params: {
    topicId: string;
    extensionLevel: 'BEYOND_CURRICULUM' | 'ENRICHMENT';
    targetYearGroup?: string;
    difficulty?: string;
  }) {
    try {
      const topic = await this.prisma.curriculumTopic.findUnique({
        where: { id: params.topicId },
        include: {
          yearGroup: true,
          subject: true,
        },
      });

      if (!topic) {
        return {
          success: false,
          error: 'Topic not found',
        };
      }

      // Generate a structured template
      const template = {
        title: `${params.extensionLevel === 'BEYOND_CURRICULUM' ? 'Advanced' : 'Enrichment'} Activity: ${topic.topicName}`,
        topicId: topic.id,
        topicName: topic.topicName,
        subject: topic.subject.displayName,
        yearGroup: topic.yearGroup.displayName,
        keyStage: topic.keyStage,
        extensionLevel: params.extensionLevel,
        
        structure: {
          introduction: {
            purpose: `Introduce students to ${params.extensionLevel === 'BEYOND_CURRICULUM' ? 'advanced concepts in' : 'broader applications of'} ${topic.topicName}`,
            hook: 'Start with an engaging question or real-world connection',
          },
          
          learningObjectives: topic.learningObjectives,
          
          mainActivity: {
            instructions: [
              'Step-by-step instructions to be filled by AI or teacher',
              'Should align with learning objectives',
              'Should be appropriate for extension level',
            ],
            resources: [],
            estimatedDuration: params.extensionLevel === 'BEYOND_CURRICULUM' ? '45-60 minutes' : '30-45 minutes',
          },
          
          successCriteria: [
            'Students can demonstrate understanding of core content',
            'Students can apply knowledge to new contexts',
            params.extensionLevel === 'BEYOND_CURRICULUM' 
              ? 'Students can analyze and evaluate at a higher level'
              : 'Students can make connections to real-world applications',
          ],
          
          differentiation: {
            support: 'Scaffolding suggestions for students who need help',
            challenge: 'Extension ideas for students who complete early',
          },
          
          assessment: {
            formative: 'Observation and questioning during activity',
            summative: 'Final output or presentation',
          },
        },
        
        metadata: {
          coreContent: topic.coreContent,
          extendedContent: topic.extendedContent,
          keySkills: topic.keySkills,
          priorKnowledge: topic.priorKnowledge,
          nationalCurriculumRef: topic.nationalCurriculumRef,
        },
      };

      return {
        success: true,
        template,
      };
    } catch (error) {
      console.error('Error in generate_activity_template:', error);
      return {
        success: false,
        error: 'Failed to generate activity template',
      };
    }
  }

  /**
   * Tool 5: validate_standards
   * Checks curriculum alignment with national standards
   */
  async validateStandards(params: {
    activityId?: string;
    topicId?: string;
    keyStage?: string;
    subjectId?: string;
  }) {
    try {
      let standards: any[] = [];

      if (params.activityId) {
        // Get activity and its topic
        const activity = await this.prisma.supercurriculumActivity.findUnique({
          where: { id: params.activityId },
          include: {
            curriculumTopic: {
              include: {
                subject: true,
              },
            },
          },
        });

        if (activity) {
          standards = await this.prisma.curriculumStandard.findMany({
            where: {
              keyStage: activity.curriculumTopic.keyStage,
              subjectId: activity.curriculumTopic.subjectId,
            },
          });

          return {
            success: true,
            activity: {
              id: activity.id,
              title: activity.title,
              curriculumAlignment: activity.curriculumAlignment,
            },
            standards,
            alignmentScore: activity.curriculumAlignment,
            recommendation: this.getAlignmentRecommendation(activity.curriculumAlignment),
          };
        }
      }

      // Otherwise, get standards by filters
      const where: any = {};
      if (params.keyStage) where.keyStage = params.keyStage;
      if (params.subjectId) where.subjectId = params.subjectId;

      standards = await this.prisma.curriculumStandard.findMany({
        where,
        include: {
          subject: true,
        },
        take: 20,
      });

      return {
        success: true,
        standards,
        count: standards.length,
      };
    } catch (error) {
      console.error('Error in validate_standards:', error);
      return {
        success: false,
        error: 'Failed to validate standards',
        standards: [],
      };
    }
  }

  /**
   * Tool 6: find_resources
   * Finds external educational resources (BBC Bitesize, Khan Academy, etc.)
   */
  async findResources(params: {
    topic: string;
    subject: string;
    keyStage?: string;
    yearGroup?: string;
    resourceTypes?: string[];
  }) {
    try {
      // This is a curated list approach. In production, you might integrate with APIs
      // or use web scraping (with proper permissions) to find real-time resources.
      
      const resources: any[] = [];

      // BBC Bitesize resources (curated by key stage and subject)
      const bbcBitesizeLinks = this.getBBCBitesizeLinks(
        params.subject,
        params.keyStage || this.inferKeyStage(params.yearGroup),
        params.topic,
      );
      resources.push(...bbcBitesizeLinks);

      // Khan Academy resources
      const khanAcademyLinks = this.getKhanAcademyLinks(
        params.subject,
        params.topic,
      );
      resources.push(...khanAcademyLinks);

      // Additional educational platforms
      const additionalResources = this.getAdditionalResources(
        params.subject,
        params.topic,
        params.keyStage,
      );
      resources.push(...additionalResources);

      // Filter by resource type if specified
      let filteredResources = resources;
      if (params.resourceTypes && params.resourceTypes.length > 0) {
        filteredResources = resources.filter((r) =>
          params.resourceTypes.includes(r.type),
        );
      }

      return {
        success: true,
        resources: filteredResources,
        count: filteredResources.length,
        searchParams: params,
      };
    } catch (error) {
      console.error('Error in find_resources:', error);
      return {
        success: false,
        error: 'Failed to find resources',
        resources: [],
        count: 0,
      };
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private getAlignmentRecommendation(score: number): string {
    if (score >= 90) return 'Excellent alignment with curriculum standards';
    if (score >= 75) return 'Good alignment, minor adjustments may enhance it';
    if (score >= 60) return 'Moderate alignment, consider reviewing key objectives';
    return 'Low alignment, significant revision recommended';
  }

  private inferKeyStage(yearGroup?: string): string {
    if (!yearGroup) return 'KS3';
    
    const yearNum = parseInt(yearGroup.replace(/\D/g, ''));
    
    if (yearNum >= 5 && yearNum <= 6) return 'KS2';
    if (yearNum >= 7 && yearNum <= 9) return 'KS3';
    if (yearNum >= 10 && yearNum <= 11) return 'KS4';
    if (yearNum >= 12) return 'KS5';
    
    return 'KS3';
  }

  private getBBCBitesizeLinks(subject: string, keyStage: string, topic: string): any[] {
    // Base URLs for BBC Bitesize by key stage
    const baseUrls: any = {
      KS2: 'https://www.bbc.co.uk/bitesize/levels/z3g4d2p',
      KS3: 'https://www.bbc.co.uk/bitesize/levels/z4kw2hv',
      KS4: 'https://www.bbc.co.uk/bitesize/examspecs/z9p3mnb', // GCSE
      KS5: 'https://www.bbc.co.uk/bitesize/levels/zxhfcwx', // A-Level
    };

    const subjectMap: any = {
      english: 'english',
      maths: 'maths',
      mathematics: 'maths',
      science: 'science',
      biology: 'science',
      chemistry: 'science',
      physics: 'science',
      history: 'history',
      geography: 'geography',
      computing: 'computing',
      'computer science': 'computing',
      'design technology': 'design-and-technology',
      art: 'art-and-design',
      music: 'music',
      pe: 'physical-education',
      'physical education': 'physical-education',
    };

    const subjectKey = subjectMap[subject.toLowerCase()] || subject.toLowerCase();
    const ksUrl = baseUrls[keyStage] || baseUrls.KS3;

    return [
      {
        type: 'video',
        platform: 'BBC Bitesize',
        title: `${subject} - ${topic}`,
        url: `${ksUrl}`,
        description: `BBC Bitesize ${keyStage} ${subject} resources`,
        recommended: true,
        free: true,
      },
    ];
  }

  private getKhanAcademyLinks(subject: string, topic: string): any[] {
    const subjectMap: any = {
      maths: 'math',
      mathematics: 'math',
      science: 'science',
      physics: 'physics',
      chemistry: 'chemistry',
      biology: 'biology',
      computing: 'computing',
      'computer science': 'computing',
      economics: 'economics',
      history: 'humanities',
    };

    const subjectKey = subjectMap[subject.toLowerCase()];
    
    if (!subjectKey) return [];

    return [
      {
        type: 'interactive',
        platform: 'Khan Academy',
        title: `${subject} - ${topic}`,
        url: `https://www.khanacademy.org/${subjectKey}`,
        description: `Khan Academy ${subject} practice and videos`,
        recommended: true,
        free: true,
      },
    ];
  }

  private getAdditionalResources(subject: string, topic: string, keyStage?: string): any[] {
    const resources = [];

    // Oak National Academy (UK curriculum-aligned)
    resources.push({
      type: 'video',
      platform: 'Oak National Academy',
      title: `${subject} - ${topic}`,
      url: 'https://www.thenational.academy/',
      description: 'Free video lessons and resources aligned to UK curriculum',
      recommended: true,
      free: true,
    });

    // Seneca Learning (interactive)
    resources.push({
      type: 'interactive',
      platform: 'Seneca Learning',
      title: `${subject} - ${topic}`,
      url: 'https://senecalearning.com/',
      description: 'Interactive revision and practice questions',
      recommended: true,
      free: true,
    });

    // TED-Ed (for enrichment)
    resources.push({
      type: 'video',
      platform: 'TED-Ed',
      title: `Explore ${topic}`,
      url: `https://ed.ted.com/search?qs=${encodeURIComponent(topic)}`,
      description: 'Educational videos and lessons on various topics',
      recommended: false,
      free: true,
    });

    return resources;
  }
}

