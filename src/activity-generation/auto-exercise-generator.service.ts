import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ActivityType, Band, ExtensionLevel, GeneratedBy } from '@prisma/client';
import { normalizeActivityContent } from '../common/activity-content.util';

/**
 * Auto Exercise Generator Service
 * 
 * This service automatically generates exercises for students based on
 * curriculum data when they complete onboarding. No admin/teacher intervention required.
 */
@Injectable()
export class AutoExerciseGeneratorService {
  private readonly logger = new Logger(AutoExerciseGeneratorService.name);
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

  private pickCurriculumTopic(curriculumTopics: any[], skill: any) {
    if (!curriculumTopics?.length) return null;
    const skillName = (skill.displayName || skill.name || '').toLowerCase();
    const matched = curriculumTopics.find(
      (t) =>
        Array.isArray(t.keySkills) &&
        t.keySkills.some((k: string) => {
          const key = String(k).toLowerCase();
          return skillName.includes(key) || key.includes(skillName);
        }),
    );
    return matched || curriculumTopics[0];
  }

  /**
   * Generate initial exercises for a new student based on their year group
   * Called when student completes onboarding/profile setup
   */
  async generateInitialExercisesForStudent(userId: string, yearGroupId: string) {
    this.logger.log(`Generating initial exercises for student ${userId} in year group ${yearGroupId}`);

    try {
      // Get all subjects and skills for this year group
      const subjects = await this.prisma.subject.findMany({
        where: {
          yearGroupId,
          isActive: true,
        },
        include: {
          skills: {
            orderBy: { orderIndex: 'asc' },
          },
          yearGroup: true,
        },
        orderBy: { orderIndex: 'asc' },
      });

      // Get curriculum topics for this year group
      const curriculumTopics = await this.prisma.curriculumTopic.findMany({
        where: { yearGroupId },
        include: {
          subject: true,
        },
      });

      const generatedActivities = [];

      // Generate activities for each subject
      for (const subject of subjects) {
        // Check if there are enough activities for this subject already
        const existingActivitiesCount = await this.prisma.activity.count({
          where: {
            subjectId: subject.id,
            isActive: true,
          },
        });

        // Only generate if we have fewer than 10 activities per skill
        const neededPerSkill = 10;
        const activitiesNeeded = (subject.skills.length * neededPerSkill) - existingActivitiesCount;

        if (activitiesNeeded > 0) {
          // Get relevant curriculum topics for this subject
          const subjectTopics = curriculumTopics.filter(t => t.subjectId === subject.id);

          // Generate activities for each skill at each difficulty level
          for (let skillIndex = 0; skillIndex < subject.skills.length; skillIndex++) {
            const skill = subject.skills[skillIndex];
            const topicForSkill =
              subjectTopics.length > 0
                ? [subjectTopics[skillIndex % subjectTopics.length]]
                : [];
            for (const band of [Band.DEVELOPING, Band.SECURE]) {
              const activity = await this.generateActivityForSkill({
                subject,
                skill,
                yearGroup: subject.yearGroup,
                difficulty: band,
                curriculumTopics: topicForSkill,
              });

              if (activity) {
                generatedActivities.push(activity);
              }
            }
          }
        }
      }

      this.logger.log(`Generated ${generatedActivities.length} activities for student ${userId}`);
      return generatedActivities;
    } catch (error) {
      this.logger.error(`Error generating exercises for student ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Generate a single activity for a specific skill and difficulty level
   */
  private async generateActivityForSkill(params: {
    subject: any;
    skill: any;
    yearGroup: any;
    difficulty: Band;
    curriculumTopics: any[];
  }) {
    const { subject, skill, yearGroup, difficulty, curriculumTopics } = params;

    // Check if a similar activity already exists
    const existingActivity = await this.prisma.activity.findFirst({
      where: {
        subjectId: subject.id,
        skillId: skill.id,
        difficulty: difficulty,
        isActive: true,
      },
    });

    if (existingActivity) {
      return null; // Skip if activity already exists
    }

    const primaryTopic = this.pickCurriculumTopic(curriculumTopics, skill);

    // Build curriculum context (prefer one unit/topic for specificity)
    const topicsForPrompt = primaryTopic ? [primaryTopic] : curriculumTopics;
    const curriculumContext =
      topicsForPrompt.length > 0
        ? topicsForPrompt
            .map((t) => {
              const unit = t.nationalCurriculumRef ? ` [${t.nationalCurriculumRef}]` : '';
              return `- ${t.topicName}${unit}: ${t.coreContent || ''}`;
            })
            .join('\n')
        : '';

    // Determine activity type based on subject and skill
    const activityType = this.determineActivityType(subject.name, skill.name);

    // Generate activity using AI - with ACTUAL PROBLEMS/CONTENT
    const prompt = `Generate a ${difficulty === Band.DEVELOPING ? 'beginner-friendly' : 'intermediate'} learning activity for ${yearGroup.displayName} students.

Subject: ${subject.displayName}
Skill: ${skill.displayName} - ${skill.description || ''}
Difficulty: ${difficulty}

${curriculumContext ? `Curriculum Topics:\n${curriculumContext}` : ''}

IMPORTANT: You must generate ACTUAL PROBLEMS/CONTENT that students can work on, not just instructions about what to do.

RULES:
- DO NOT include any image or picture references - we cannot display images
- All content must be TEXT-BASED (questions, passages, problems, prompts)
- Include the actual content students need to complete the activity

Create an engaging activity that:
1. Is appropriate for ${yearGroup.displayName} students
2. Focuses on the "${skill.displayName}" skill
3. ${difficulty === Band.DEVELOPING ? 'Provides scaffolding and clear guidance' : 'Offers some challenge while remaining accessible'}
4. Takes about 15-20 minutes to complete
5. Includes SPECIFIC text-based problems, questions, or content to work with
6. Includes at least 3 items in "items" whenever type is "problems" or "reading" (each with a clear "question")

CRITICAL JSON: Every object in "content.items" MUST include a non-empty string field "question". Optional "hint" only supplements the question.

Return as JSON:
{
  "title": "Short, engaging title",
  "description": "Brief description of what students will learn",
  "instructions": "Clear instructions on how to complete the activity",
  "content": {
    "type": "problems|reading|writing|creative",
    "items": [
      // For math/science: actual problems with answers
      // { "question": "What is 5 + 3?", "answer": "8", "hint": "Count on from 5" }
      // For reading: passage text and comprehension questions
      // For writing: prompt and success criteria
    ]
  },
  "estimatedMinutes": 15
}

Example for Maths - Algebra:
{
  "title": "Solve for X",
  "description": "Practice solving simple equations",
  "instructions": "Solve each equation to find the value of x. Show your working.",
  "content": {
    "type": "problems",
    "items": [
      { "question": "x + 5 = 12", "answer": "x = 7", "hint": "Subtract 5 from both sides" },
      { "question": "2x = 10", "answer": "x = 5", "hint": "Divide both sides by 2" },
      { "question": "x - 3 = 8", "answer": "x = 11", "hint": "Add 3 to both sides" }
    ]
  },
  "estimatedMinutes": 15
}

Example for English - Reading:
{
  "title": "The Lost Key",
  "description": "Read a short story and answer comprehension questions",
  "instructions": "Read the passage below, then answer the questions.",
  "content": {
    "type": "reading",
    "passage": "Maya found a rusty key in her grandmother's garden...",
    "items": [
      { "question": "Where did Maya find the key?", "answer": "In her grandmother's garden" },
      { "question": "How did Maya feel when she found it?", "answer": "Curious and excited" }
    ]
  },
  "estimatedMinutes": 15
}

Generate appropriate content for ${subject.displayName} - ${skill.displayName}.`;

    try {
      if (!this.openai) {
        this.logger.warn('OpenAI not configured, skipping AI generation');
        return null;
      }

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert curriculum designer creating engaging, age-appropriate learning activities.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');

      // Handle instructions being either a string or array (AI sometimes returns an array)
      const instructions = Array.isArray(result.instructions) 
        ? result.instructions.join('\n') 
        : (result.instructions || '');

      const locale = subject.locale === 'el-GR' ? 'el-GR' : 'en-GB';

      // Build resources with the actual content/problems
      const resources: any = {};
      if (result.content) {
        resources.content = normalizeActivityContent(result.content, locale);
      }
      if (result.successCriteria) {
        resources.successCriteria = result.successCriteria;
      }
      if (primaryTopic) {
        resources.curriculumTopicId = primaryTopic.id;
        resources.curriculumTopicName = primaryTopic.topicName;
        if (primaryTopic.nationalCurriculumRef) {
          resources.curriculumUnitRef = primaryTopic.nationalCurriculumRef;
        }
      }

      // Create the activity in the database
      const activity = await this.prisma.activity.create({
        data: {
          subjectId: subject.id,
          skillId: skill.id,
          title: result.title,
          description: result.description,
          instructions: instructions,
          resources: Object.keys(resources).length > 0 ? resources : undefined,
          activityType: activityType,
          difficulty: difficulty,
          estimatedMinutes: result.estimatedMinutes || 15,
          isActive: true,
        },
      });

      this.logger.log(`Created activity: ${activity.title} for ${subject.displayName} - ${skill.displayName}`);
      return activity;
    } catch (error) {
      this.logger.error(`Error generating activity for ${subject.displayName} - ${skill.displayName}:`, error);
      return null;
    }
  }

  /**
   * Determine the most appropriate activity type based on subject and skill
   */
  private determineActivityType(subjectName: string, skillName: string): ActivityType {
    const lowerSubject = subjectName.toLowerCase();
    const lowerSkill = skillName.toLowerCase();

    if (lowerSkill.includes('reading') || lowerSkill.includes('comprehension')) {
      return ActivityType.READING;
    }
    if (lowerSkill.includes('writing') || lowerSkill.includes('composition')) {
      return ActivityType.WRITING;
    }
    if (lowerSkill.includes('speaking') || lowerSkill.includes('presentation')) {
      return ActivityType.STUDENT_LED;
    }
    if (lowerSkill.includes('listening')) {
      return ActivityType.LISTENING;
    }
    if (lowerSkill.includes('creative') || lowerSkill.includes('art')) {
      return ActivityType.CREATIVE;
    }
    if (lowerSkill.includes('research') || lowerSkill.includes('investigation')) {
      return ActivityType.RESEARCHING;
    }
    if (lowerSubject.includes('maths') || lowerSubject.includes('math')) {
      return ActivityType.SCAFFOLDED_EXERCISE;
    }
    if (lowerSubject.includes('science')) {
      return ActivityType.RESEARCHING;
    }

    // Default to scaffolded exercise for most cases
    return ActivityType.SCAFFOLDED_EXERCISE;
  }

  /**
   * Generate activities dynamically for weekly plans
   * Each call generates NEW, UNIQUE activities - never reuses the same problems
   * This ensures students always get fresh, personalized content
   */
  async generateDynamicActivitiesForWeeklyPlan(params: {
    studentBands: any[];
    yearGroupId: string;
    locale?: string | null;
    studentInterests?: string[];
    preferredSubjects?: string[];
    personalityTestResults?: any;
    diagnosticTestResults?: any;
    taskCompletionStats?: Record<string, Record<string, { completed: number; total: number }>>;
    count: number; // How many activities to generate
    randomSeed?: string; // Random seed for uniqueness
  }) {
    try {
      const { studentBands, yearGroupId, locale: localeParam, studentInterests = [], preferredSubjects = [], personalityTestResults, diagnosticTestResults, taskCompletionStats = {}, count, randomSeed } = params;
      const effectiveLocale = localeParam === 'el-GR' ? 'el-GR' : 'en-GB';
      
      this.logger.log(`🚀 Starting generation of ${count} dynamic activities for weekly plan`);
      
      if (!studentBands || studentBands.length === 0) {
        throw new Error('No student bands provided. Please ensure your profile is complete and you have completed assessments.');
      }
      
      if (!this.openai) {
        throw new Error('OpenAI API key is not configured. Please contact support.');
      }
      
      this.logger.log(`Student has ${studentBands.length} bands across ${new Set(studentBands.map(b => b.subjectId)).size} subjects`);
      
      const generatedActivities = [];
    // Use random seed if provided, otherwise use timestamp + random
    const timestamp = randomSeed ? parseInt(randomSeed.slice(-10)) || Date.now() : Date.now();
    const uniqueId = randomSeed || `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    
    // Get subjects and skills from bands
    const subjectSkillMap = new Map<string, Set<string>>();
    for (const band of studentBands) {
      if (!subjectSkillMap.has(band.subjectId)) {
        subjectSkillMap.set(band.subjectId, new Set());
      }
      subjectSkillMap.get(band.subjectId)!.add(band.skillId);
    }
    
    // Log which subjects we're working with
    const subjectIds = Array.from(subjectSkillMap.keys());
    this.logger.log(`📚 Generating activities for ${subjectIds.length} subjects (IDs: ${subjectIds.join(', ')})`);
    
    // Get subject and skill details
    const subjects = await this.prisma.subject.findMany({
      where: { id: { in: subjectIds } },
      include: {
        skills: true,
        yearGroup: true,
      },
    });
    
    // Log subject details with skill counts
    const subjectDetails = subjects.map(s => {
      const skillCount = subjectSkillMap.get(s.id)?.size || 0;
      return `${s.displayName} (${skillCount} skills)`;
    });
    this.logger.log(`✅ Found ${subjects.length} subjects: ${subjectDetails.join(', ')}`);
    
    // Get curriculum topics for personalization (filter by locale so Greek students get Greek topics)
    const topicLocaleWhere = effectiveLocale === 'el-GR' ? { locale: 'el-GR' } : { OR: [{ locale: 'en-GB' }, { locale: null }] };
    const curriculumTopics = await this.prisma.curriculumTopic.findMany({
      where: { yearGroupId, ...topicLocaleWhere },
      include: { subject: true },
    });

    // Get supercurriculum activities (enrichment topics from PDFs), same locale
    const supercurriculumActivities = await this.prisma.supercurriculumActivity.findMany({
      where: {
        curriculumTopic: {
          yearGroupId,
          ...topicLocaleWhere,
        },
      },
      include: {
        curriculumTopic: {
          include: { subject: true },
        },
      },
    });
    
    // Prioritize preferred subjects, but ensure variety across ALL subjects
    const sortedSubjects = subjects.sort((a, b) => {
      const aPreferred = preferredSubjects.includes(a.id) ? -1 : 0;
      const bPreferred = preferredSubjects.includes(b.id) ? -1 : 0;
      if (aPreferred !== bPreferred) return aPreferred - bPreferred;
      // If both preferred or both not preferred, maintain original order for variety
      return 0;
    });
    
    this.logger.log(`Distributing ${count} activities across ${sortedSubjects.length} subjects using round-robin for variety`);
    
    // Prepare subject data for round-robin
    const subjectData = sortedSubjects.map(subject => {
      const skillIds = subjectSkillMap.get(subject.id);
      const skills = subject.skills.filter(s => skillIds?.has(s.id));
      const subjectTopics = curriculumTopics.filter(t => t.subjectId === subject.id);
      const subjectSupercurriculum = supercurriculumActivities
        .filter(sa => sa.curriculumTopic?.subjectId === subject.id)
        .map(sa => ({
          topicName: sa.curriculumTopic?.topicName || '',
          extensionLevel: sa.extensionLevel,
          title: sa.title,
          description: sa.description,
        }));
      const band = studentBands.find(b => b.subjectId === subject.id);
      
      return {
        subject,
        skills,
        subjectTopics,
        subjectSupercurriculum,
        difficulty: band?.band || Band.DEVELOPING,
        skillIndex: 0, // Track which skill we're on for this subject
        lastUsedRound: -1, // Track which round this subject was last used
      };
    }).filter(data => data.skills.length > 0); // Only subjects with skills
    
    let generated = 0;
    let round = 0;
    const maxRounds = count * 3; // Safety limit (allow more rounds for retries)
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = subjectData.length * 2; // Stop if all subjects fail twice
    
    // Round-robin through subjects to ensure variety - ONE activity per subject per round
    while (generated < count && round < maxRounds && subjectData.length > 0) {
      round++;
      
      // Safety check: if we've had too many consecutive failures, break
      if (consecutiveFailures >= maxConsecutiveFailures) {
        this.logger.warn(`Stopping generation after ${consecutiveFailures} consecutive failures`);
        break;
      }
      
      // Prepare activities to generate in this round (one per subject, will generate in parallel)
      const activitiesToGenerate: Array<{
        subjectInfo: any;
        subject: any;
        skill: any;
        subjectTopics: any[];
        subjectSupercurriculum: any[];
        difficulty: Band;
        completionRate: number | null;
        needsMorePractice: boolean;
        activityIndex: number;
      }> = [];
      
      for (let subjectIdx = 0; subjectIdx < subjectData.length; subjectIdx++) {
        if (generated + activitiesToGenerate.length >= count) break;
        
        const subjectInfo = subjectData[subjectIdx];
        const { subject, skills, subjectTopics, subjectSupercurriculum, difficulty } = subjectInfo;
        
        // Skip this subject if we already used it in this round
        if (subjectInfo.lastUsedRound === round) {
          continue;
        }
        
        // Get next skill for this subject (round-robin through skills)
        if (subjectInfo.skillIndex >= skills.length) {
          subjectInfo.skillIndex = 0; // Reset to start of skills for this subject
        }
        
        const skill = skills[subjectInfo.skillIndex % skills.length];
        subjectInfo.skillIndex++; // Move to next skill for next time this subject is used
        
        // Get completion stats for this subject/skill
        const completionRate = taskCompletionStats[subject.id]?.[skill.id];
        const needsMorePractice = completionRate && completionRate.completed < 3;
        
        activitiesToGenerate.push({
          subjectInfo,
          subject,
          skill,
          subjectTopics,
          subjectSupercurriculum,
          difficulty,
          completionRate: completionRate ? (completionRate.completed / Math.max(completionRate.total, 1)) : null,
          needsMorePractice,
          activityIndex: generated + activitiesToGenerate.length,
        });
      }
      
      if (activitiesToGenerate.length === 0) {
        break; // No more activities to generate
      }
      
      // Generate all activities in this round IN PARALLEL (much faster!)
      this.logger.log(`🔄 Round ${round}: Generating ${activitiesToGenerate.length} activities in parallel...`);
      const roundStartTime = Date.now();
      
      const generationPromises = activitiesToGenerate.map(async (activityData) => {
        try {
          const activity = await this.generateUniqueActivityForSkill({
            subject: activityData.subject,
            skill: activityData.skill,
            yearGroup: activityData.subject.yearGroup,
            difficulty: activityData.difficulty,
            curriculumTopics: activityData.subjectTopics,
            supercurriculumTopics: activityData.subjectSupercurriculum,
            locale: effectiveLocale,
            studentInterests,
            personalityTestResults,
            diagnosticTestResults,
            completionRate: activityData.completionRate,
            needsMorePractice: activityData.needsMorePractice,
            timestamp,
            uniqueId,
            activityIndex: activityData.activityIndex,
          });
          
          // Validate activity before adding
          if (!activity || !activity.title) {
            throw new Error(`Generated activity is invalid (missing title)`);
          }
          
          return { success: true, activity, subjectInfo: activityData.subjectInfo };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to generate activity for ${activityData.subject.displayName} - ${activityData.skill.displayName}: ${errorMsg}`);
          return { success: false, error: errorMsg, subjectInfo: activityData.subjectInfo };
        }
      });
      
      // Wait for all activities in this round to complete (parallel execution)
      const results = await Promise.all(generationPromises);
      
      const roundEndTime = Date.now();
      const roundDuration = ((roundEndTime - roundStartTime) / 1000).toFixed(1);
      this.logger.log(`⏱️ Round ${round} completed in ${roundDuration}s (parallel generation)`);
      
      // Process results
      let roundGenerated = 0;
      for (const result of results) {
        if (generated >= count) break;
        
        if (result.success && result.activity) {
          generatedActivities.push(result.activity);
          generated++;
          roundGenerated++;
          consecutiveFailures = 0; // Reset failure counter on success
          result.subjectInfo.lastUsedRound = round; // Mark this subject as used in this round
          this.logger.log(`[${generated}/${count}] Generated ${result.activity.title} for ${result.activity.subject?.displayName} - ${result.activity.skill?.displayName}`);
        } else {
          consecutiveFailures++;
        }
      }
      
      // Reset lastUsedRound for all subjects for next round
      for (const subjectInfo of subjectData) {
        subjectInfo.lastUsedRound = -1;
      }
      
      // If we didn't generate anything this round, break to avoid infinite loop
      if (roundGenerated === 0 && generated > 0) {
        this.logger.warn(`No activities generated in round ${round}, stopping`);
        break;
      }
    }
    
      // Log final distribution by subject
      const finalDistribution = new Map<string, number>();
      for (const activity of generatedActivities) {
        const subjectName = activity.subject?.displayName || 'Unknown';
        const count = finalDistribution.get(subjectName) || 0;
        finalDistribution.set(subjectName, count + 1);
      }
      this.logger.log(`✅ Generated ${generatedActivities.length} dynamic activities distributed as: ${Array.from(finalDistribution.entries()).map(([subject, count]) => `${subject} (${count})`).join(', ')}`);
      
      if (generatedActivities.length === 0) {
        throw new Error('Failed to generate any activities. Please check OpenAI API configuration and ensure mandatory tests are completed.');
      }
      
      return generatedActivities;
    } catch (error) {
      this.logger.error('❌ Error in generateDynamicActivitiesForWeeklyPlan:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
        studentBandsCount: params?.studentBands?.length,
        count: params?.count,
      });
      throw error; // Re-throw to be handled by caller
    }
  }

  /**
   * Generate a unique activity with different problems each time
   * Uses timestamp and higher temperature to ensure uniqueness
   */
  private async generateUniqueActivityForSkill(params: {
    subject: any;
    skill: any;
    yearGroup: any;
    difficulty: Band;
    curriculumTopics: any[];
    supercurriculumTopics?: any[];
    locale?: string;
    studentInterests?: string[];
    personalityTestResults?: any;
    diagnosticTestResults?: any;
    completionRate?: number | null;
    needsMorePractice?: boolean;
    timestamp: number;
    uniqueId?: string;
    activityIndex?: number;
  }) {
    const { subject, skill, yearGroup, difficulty, curriculumTopics, supercurriculumTopics = [], locale = 'en-GB', studentInterests, personalityTestResults, diagnosticTestResults, completionRate, needsMorePractice, timestamp, uniqueId, activityIndex = 0 } = params;

    // Build curriculum context from standard curriculum topics
    const curriculumContext = curriculumTopics.length > 0
      ? curriculumTopics.map(t => `- ${t.topicName}: ${t.coreContent || ''}`).join('\n')
      : '';
    
    // Build supercurriculum context from PDFs (enrichment topics)
    const supercurriculumContext = supercurriculumTopics.length > 0
      ? `\n\nSupercurriculum Topics (Enrichment from British National Curriculum PDFs):\n${supercurriculumTopics.map(st => `- ${st.topicName} (${st.extensionLevel}): ${st.title} - ${st.description || ''}`).join('\n')}`
      : '';

    // Build personalization context from test results, completion history, and hobbies
    let personalizationContext = '';
    if (personalityTestResults) {
      personalizationContext += `\nStudent Learning Style: ${JSON.stringify(personalityTestResults)}\n`;
    }
    if (diagnosticTestResults) {
      personalizationContext += `\nKnowledge Gaps: ${JSON.stringify(diagnosticTestResults)}\n`;
    }
    if (studentInterests.length > 0) {
      personalizationContext += `\nStudent Hobbies/Interests: ${studentInterests.join(', ')}\n`;
      personalizationContext += `\nIMPORTANT: Incorporate these interests into the activity to make it engaging and relevant!\n`;
    }
    if (completionRate !== null && completionRate !== undefined) {
      personalizationContext += `\nTask Completion Rate for ${subject.displayName} - ${skill.displayName}: ${(completionRate * 100).toFixed(0)}%\n`;
    }
    if (needsMorePractice) {
      personalizationContext += `\nThis student needs more practice in this area - provide additional scaffolding and support.\n`;
    }

    const activityType = this.determineActivityType(subject.name, skill.name);

    // Generate activity with UNIQUE content - add multiple variation factors
    const variationSeed = uniqueId ? `${uniqueId}-${activityIndex}` : `${timestamp}-${activityIndex}-${Math.random().toString(36).substring(2, 9)}`;
    
    const prompt = `Generate a ${difficulty === Band.DEVELOPING ? 'beginner-friendly' : 'intermediate'} learning activity for ${yearGroup.displayName} students.

Subject: ${subject.displayName}
Skill: ${skill.displayName} - ${skill.description || ''}
Difficulty: ${difficulty}
Variation Seed: ${variationSeed} (CRITICAL: Use this to create COMPLETELY UNIQUE problems - never repeat the same problems, numbers, or scenarios)
Activity Number: ${activityIndex + 1} (this is activity #${activityIndex + 1} in a batch - make it different from others)

${curriculumContext ? `Curriculum Topics:\n${curriculumContext}` : ''}
${supercurriculumContext}
${personalizationContext}

CRITICAL: Generate COMPLETELY DIFFERENT problems/content than any previous generation. Use the variation seed to create variation.

IMPORTANT: You must generate ACTUAL PROBLEMS/CONTENT that students can work on, not just instructions.

RULES:
- DO NOT include any image or picture references - we cannot display images
- All content must be TEXT-BASED (questions, passages, problems, prompts)
- Include the actual content students need to complete the activity
- Generate UNIQUE problems - use different numbers, scenarios, or contexts than typical examples
- Vary the difficulty and approach based on the variation seed
- The TITLE must be COMPLETELY DIFFERENT from any previous activity - use creative, unique titles
- Use the variation seed to inspire different themes, contexts, or approaches

Create an engaging activity that:
1. Is appropriate for ${yearGroup.displayName} students
2. Focuses on the "${skill.displayName}" skill
3. ${difficulty === Band.DEVELOPING ? 'Provides scaffolding and clear guidance' : 'Offers some challenge while remaining accessible'}
4. Takes about 15-20 minutes to complete
5. Includes SPECIFIC text-based problems, questions, or content to work with
6. Is UNIQUE - uses different examples, numbers, or scenarios than standard practice problems
7. Has a CREATIVE, UNIQUE TITLE that reflects the specific content (not generic titles like "Practice" or "Exercise")
${locale === 'el-GR' ? '\nLANGUAGE: The student\'s curriculum is in Greek. You MUST write the ENTIRE activity in Greek (Ελληνικά): title, description, instructions, and all content (questions, problems, passages). Use correct Greek spelling and grammar.' : ''}
CRITICAL JSON: Every object in "content.items" MUST include a non-empty string field "question". Optional "hint" only supplements the question.

Return as JSON:
{
  "title": "Creative, unique title that reflects the specific activity content (e.g., 'The Mystery of Missing Numbers', 'Journey Through Ancient Egypt', 'Build Your Own Robot' - NOT generic titles like 'Math Practice' or 'Reading Exercise')",
  "description": "Brief description of what students will learn",
  "instructions": "Clear instructions on how to complete the activity",
  "content": {
    "type": "problems|reading|writing|creative",
    "items": [
      // For math/science: actual problems with answers (use UNIQUE numbers/scenarios)
      // { "question": "What is 7 + 4?", "answer": "11", "hint": "Count on from 7" }
      // For reading: passage text and comprehension questions
      // For writing: prompt and success criteria
    ]
  },
  "estimatedMinutes": 15
}

Generate appropriate, UNIQUE content for ${subject.displayName} - ${skill.displayName}.`;

    if (!this.openai) {
      const error = new Error('OpenAI API key is not configured. Please set OPENAI_API_KEY in environment variables.');
      this.logger.error('OpenAI not configured - cannot generate activities', error);
      throw error;
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert curriculum designer creating engaging, age-appropriate learning activities. Always generate unique, varied problems - never repeat the same examples.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 1.0, // Maximum temperature for maximum variation and creativity
        max_tokens: 2000, // More tokens for detailed, unique content
        response_format: { type: 'json_object' },
        // Don't use seed - we want maximum variation, not reproducibility
        // Each call should generate different content
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');

      const instructions = Array.isArray(result.instructions) 
        ? result.instructions.join('\n') 
        : (result.instructions || '');

      const resources: any = {};
      if (result.content) {
        resources.content = normalizeActivityContent(result.content, locale);
      }
      if (result.successCriteria) {
        resources.successCriteria = result.successCriteria;
      }

      // Return activity data object (NOT stored in database - generated on-the-fly)
      // This ensures each generation creates completely new, unique activities
      const activityData = {
        title: result.title || `${subject.displayName} Activity`,
        description: result.description,
        instructions: instructions,
        content: resources.content ?? result.content,
        resources: Object.keys(resources).length > 0 ? resources : undefined,
        subjectId: subject.id,
        skillId: skill.id,
        subject: {
          id: subject.id,
          name: subject.name,
          displayName: subject.displayName,
          iconName: subject.iconName,
          colorCode: subject.colorCode,
        },
        skill: {
          id: skill.id,
          name: skill.name,
          displayName: skill.displayName,
        },
        activityType: activityType,
        difficulty: difficulty,
        estimatedMinutes: result.estimatedMinutes || 15,
        generatedAt: new Date().toISOString(),
        variationSeed: uniqueId,
      };

      this.logger.log(`Generated unique activity: ${activityData.title} for ${subject.displayName} - ${skill.displayName}`);
      return activityData;
    } catch (error) {
      this.logger.error(`Error generating unique activity for ${subject.displayName} - ${skill.displayName}:`, error);
      // Re-throw error instead of returning null so we can catch it upstream
      throw error;
    }
  }

  /**
   * Generate exercises on-demand for weekly plan when activities don't exist
   * This ensures the AI always has content to provide, even if admin hasn't created any
   */
  async ensureActivitiesExistForSubjects(yearGroupId: string, subjectIds: string[]) {
    const generatedActivities = [];

    for (const subjectId of subjectIds) {
      const subject = await this.prisma.subject.findUnique({
        where: { id: subjectId },
        include: {
          skills: true,
          yearGroup: true,
        },
      });

      if (!subject) continue;

      // Check if we have enough activities
      const activityCount = await this.prisma.activity.count({
        where: {
          subjectId,
          isActive: true,
        },
      });

      // Generate more if needed (at least 5 activities per subject)
      if (activityCount < 5) {
        for (const skill of subject.skills.slice(0, 3)) {
          for (const band of [Band.DEVELOPING, Band.SECURE]) {
            const activity = await this.generateActivityForSkill({
              subject,
              skill,
              yearGroup: subject.yearGroup,
              difficulty: band,
              curriculumTopics: [],
            });

            if (activity) {
              generatedActivities.push(activity);
            }
          }
        }
      }
    }

    return generatedActivities;
  }

  /**
   * Generate activities for all subjects in a year group
   * Called after curriculum PDF import to pre-generate activities
   * This prevents slow weekly plan generation by having activities ready
   */
  async generateActivitiesForYearGroup(yearGroupId: string, options?: {
    activitiesPerSkill?: number;
    difficulties?: Band[];
  }): Promise<{ generated: number; skipped: number; errors: string[] }> {
    const activitiesPerSkill = options?.activitiesPerSkill || 2;
    const difficulties = options?.difficulties || [Band.DEVELOPING, Band.SECURE];
    
    const result = {
      generated: 0,
      skipped: 0,
      errors: [] as string[],
    };

    this.logger.log(`Generating activities for year group ${yearGroupId}`);

    // Get all subjects with skills for this year group
    const subjects = await this.prisma.subject.findMany({
      where: {
        yearGroupId,
        isActive: true,
      },
      include: {
        skills: { orderBy: { orderIndex: 'asc' } },
        yearGroup: true,
      },
    });

    // Get curriculum topics for context
    const curriculumTopics = await this.prisma.curriculumTopic.findMany({
      where: { yearGroupId },
    });

    this.logger.log(`Found ${subjects.length} subjects with ${curriculumTopics.length} curriculum topics`);

    for (const subject of subjects) {
      const subjectTopics = curriculumTopics.filter(t => t.subjectId === subject.id);
      
      for (const skill of subject.skills) {
        for (const difficulty of difficulties) {
          try {
            const activity = await this.generateActivityForSkill({
              subject,
              skill,
              yearGroup: subject.yearGroup,
              difficulty,
              curriculumTopics: subjectTopics,
            });

            if (activity) {
              result.generated++;
              this.logger.log(`Generated: ${activity.title} (${subject.displayName} - ${skill.displayName})`);
            } else {
              result.skipped++;
            }
          } catch (error) {
            const errorMsg = `${subject.displayName} - ${skill.displayName} (${difficulty}): ${error.message}`;
            result.errors.push(errorMsg);
            this.logger.error(`Error generating activity: ${errorMsg}`);
          }
        }
      }
    }

    this.logger.log(`Activity generation complete: ${result.generated} generated, ${result.skipped} skipped, ${result.errors.length} errors`);
    return result;
  }

  /**
   * Generate activities for specific subjects (by IDs)
   * Useful for generating activities after importing specific subjects
   */
  async generateActivitiesForSubjects(subjectIds: string[], options?: {
    activitiesPerSkill?: number;
    difficulties?: Band[];
  }): Promise<{ generated: number; skipped: number; errors: string[] }> {
    const difficulties = options?.difficulties || [Band.DEVELOPING, Band.SECURE];
    
    const result = {
      generated: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const subjectId of subjectIds) {
      const subject = await this.prisma.subject.findUnique({
        where: { id: subjectId },
        include: {
          skills: { orderBy: { orderIndex: 'asc' } },
          yearGroup: true,
        },
      });

      if (!subject) {
        result.errors.push(`Subject ${subjectId} not found`);
        continue;
      }

      // Get curriculum topics for this subject
      const curriculumTopics = await this.prisma.curriculumTopic.findMany({
        where: { 
          yearGroupId: subject.yearGroupId,
          subjectId: subject.id,
        },
      });

      for (const skill of subject.skills) {
        for (const difficulty of difficulties) {
          try {
            const activity = await this.generateActivityForSkill({
              subject,
              skill,
              yearGroup: subject.yearGroup,
              difficulty,
              curriculumTopics,
            });

            if (activity) {
              result.generated++;
            } else {
              result.skipped++;
            }
          } catch (error) {
            result.errors.push(`${subject.displayName} - ${skill.displayName}: ${error.message}`);
          }
        }
      }
    }

    return result;
  }

  /**
   * Generate a quick quiz on-the-fly for a student
   */
  async generateQuickQuizForStudent(params: {
    subjectId: string;
    skillId: string;
    yearGroup: string;
    difficulty: string;
    questionCount: number;
  }) {
    const { subjectId, skillId, yearGroup, difficulty, questionCount } = params;

    const skill = await this.prisma.skill.findUnique({
      where: { id: skillId },
      include: { subject: true },
    });

    if (!skill) {
      throw new Error('Skill not found');
    }

    const prompt = `Generate ${questionCount} ${difficulty} level questions for ${yearGroup} students on ${skill.displayName} in ${skill.subject.displayName}.

Return as JSON:
{
  "questions": [
    {
      "question": "Question text",
      "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
      "correctAnswer": "A",
      "explanation": "Why this is correct",
      "hints": ["Hint 1", "Hint 2"]
    }
  ]
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert educator creating quiz questions for students.',
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
      this.logger.error('Error generating quick quiz:', error);
      return [];
    }
  }

  /**
   * Generate SupercurriculumActivity entries for CurriculumTopics
   * These are enrichment activities that the AI suggests for weekly plans
   */
  async generateSupercurriculumActivitiesForTopics(topicIds?: string[]): Promise<{
    generated: number;
    skipped: number;
    errors: string[];
  }> {
    const result = {
      generated: 0,
      skipped: 0,
      errors: [] as string[],
    };

    // Get topics (either specific ones or all without activities)
    const topics = await this.prisma.curriculumTopic.findMany({
      where: topicIds?.length 
        ? { id: { in: topicIds } }
        : {
            supercurriculumActivities: {
              none: {}, // Topics without any activities
            },
          },
      include: {
        yearGroup: true,
        subject: true,
        supercurriculumActivities: true,
      },
      take: 100, // Process in batches
    });

    this.logger.log(`Generating supercurriculum activities for ${topics.length} topics`);

    for (const topic of topics) {
      // Skip if topic already has activities at all levels
      const existingLevels = new Set(topic.supercurriculumActivities.map(a => a.extensionLevel));
      const levelsToGenerate = [
        ExtensionLevel.FOUNDATION,
        ExtensionLevel.INTERMEDIATE,
        ExtensionLevel.ADVANCED,
      ].filter(level => !existingLevels.has(level));

      if (levelsToGenerate.length === 0) {
        result.skipped++;
        continue;
      }

      for (const level of levelsToGenerate) {
        try {
          const activity = await this.generateSupercurriculumActivityForTopic(topic, level);
          if (activity) {
            result.generated++;
            this.logger.log(`Generated: ${activity.title} (${topic.topicName} - ${level})`);
          } else {
            result.skipped++;
          }
        } catch (error) {
          const errorMsg = `${topic.topicName} (${level}): ${error.message}`;
          result.errors.push(errorMsg);
          this.logger.error(`Error generating activity: ${errorMsg}`);
        }
      }
    }

    this.logger.log(`Supercurriculum activity generation complete: ${result.generated} generated, ${result.skipped} skipped`);
    return result;
  }

  /**
   * Generate a single SupercurriculumActivity for a topic at a specific extension level
   */
  private async generateSupercurriculumActivityForTopic(
    topic: any,
    extensionLevel: ExtensionLevel,
  ) {
    if (!this.openai) {
      this.logger.warn('OpenAI not configured, skipping activity generation');
      return null;
    }

    const levelDescriptions = {
      [ExtensionLevel.FOUNDATION]: 'accessible to all students, building confidence and foundational understanding',
      [ExtensionLevel.INTERMEDIATE]: 'challenging but achievable, developing deeper understanding',
      [ExtensionLevel.ADVANCED]: 'stretching and enriching, connecting to real-world applications and higher-level thinking',
    };

    const prompt = `Generate an engaging supercurriculum enrichment activity for students.

Topic: ${topic.topicName}
Subject: ${topic.subject.displayName}
Year Group: ${topic.yearGroup.displayName}
Key Stage: ${topic.keyStage}

Core Content: ${topic.coreContent || 'Not specified'}
Learning Objectives: ${JSON.stringify(topic.learningObjectives || [])}
Key Skills: ${JSON.stringify(topic.keySkills || [])}

Extension Level: ${extensionLevel}
This activity should be ${levelDescriptions[extensionLevel]}.

Create a SUPERCURRICULUM activity that goes BEYOND the regular curriculum:
- Should be intellectually stimulating and spark curiosity
- Connect to real-world applications, careers, or current events
- Encourage independent thinking and research
- Be suitable for students to do in their own time (15-30 minutes)
- NO images or pictures required - text-based only

Return as JSON:
{
  "title": "Engaging, specific title",
  "description": "Brief description of what students will explore/learn",
  "instructions": "Clear step-by-step instructions (can be multi-paragraph)",
  "successCriteria": "How students know they've completed it successfully",
  "curriculumAlignment": 85 // Score 0-100 of how well it aligns with curriculum objectives
}

Example for Maths - Fractions (INTERMEDIATE):
{
  "title": "The Golden Ratio: Fractions in Nature and Art",
  "description": "Explore how the fraction 1.618... appears throughout nature, art, and architecture",
  "instructions": "1. Research the Golden Ratio (approximately 1.618 or 8/5)...\\n2. Find 3 examples in nature...\\n3. Find 2 examples in famous art or buildings...\\n4. Create your own design using the Golden Ratio",
  "successCriteria": "You've found real examples and can explain why the Golden Ratio appears so often in nature and design",
  "curriculumAlignment": 75
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert curriculum enrichment designer. Create engaging activities that spark curiosity and go beyond the standard curriculum while remaining connected to it.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.8,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');

      // Create the SupercurriculumActivity in the database
      const activity = await this.prisma.supercurriculumActivity.create({
        data: {
          curriculumTopicId: topic.id,
          title: result.title,
          description: result.description,
          instructions: result.instructions,
          successCriteria: result.successCriteria,
          extensionLevel: extensionLevel,
          curriculumAlignment: result.curriculumAlignment || 70,
          generatedBy: GeneratedBy.AI_GENERATED,
          teacherApproved: false, // Needs teacher review
        },
      });

      return activity;
    } catch (error) {
      this.logger.error(`Error generating supercurriculum activity for ${topic.topicName}:`, error);
      return null;
    }
  }

  /**
   * Generate supercurriculum activities for all topics in a year group
   */
  async generateSupercurriculumActivitiesForYearGroup(yearGroupId: string): Promise<{
    generated: number;
    skipped: number;
    errors: string[];
  }> {
    const topics = await this.prisma.curriculumTopic.findMany({
      where: { yearGroupId },
      select: { id: true },
    });

    return this.generateSupercurriculumActivitiesForTopics(topics.map(t => t.id));
  }
}

