import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { MasteryLevel } from '@prisma/client';
import { QuestionnaireParserService } from './questionnaire-parser.service';
import { whereYearGroupLocale } from '../common/curriculum-locale-filter';
import { UsersService } from '../users/users.service';

/**
 * Onboarding Tests Service
 * 
 * Generates personality and diagnostic tests for student onboarding using actual questionnaire files.
 * These tests help the AI tutor understand:
 * 1. Personality Test: Learning style, preferences, strengths, challenges (from GeneralQuestionnaries.txt)
 * 2. Diagnostic Test: Current knowledge level, gaps in understanding (from Diagnostictests.txt)
 * 
 * Based on the UK National Curriculum standards and provided questionnaire files.
 */
@Injectable()
export class OnboardingTestsService {
  private readonly logger = new Logger(OnboardingTestsService.name);
  private openai: OpenAI | null = null;

  /** English-only product: all questionnaire and diagnostic flow uses UK English content. */
  private resolveContentLocale(_preferredLocale?: string | null, _yearGroupLocale?: string | null): string {
    return 'en-GB';
  }

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private questionnaireParser: QuestionnaireParserService,
    private usersService: UsersService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  /**
   * Generate a personality test for a student
   * Uses actual questionnaire questions from GeneralQuestionnaries.txt based on student's year
   */
  async generatePersonalityTest(userId: string, preferredLocale?: string) {
    this.logger.log(`Generating personality test for user ${userId}`);

    // Check if test already exists
    const existingTest = await this.prisma.personalityTest.findFirst({
      where: { userId },
    });

    if (existingTest && existingTest.status === 'COMPLETED') {
      return existingTest;
    }

    // Get student's year group to determine which questionnaire to use
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: { yearGroup: true },
    });

    if (!profile || !profile.yearGroup) {
      throw new NotFoundException('Student profile or year group not found. Please complete your profile first.');
    }

    const yearLocale = (profile.yearGroup as any).locale || 'en-GB';
    const locale = this.resolveContentLocale(preferredLocale, yearLocale);
    const yearNumber = this.getLogicalYearNumber(profile.yearGroup);

    this.logger.log(`Using questionnaire for Year ${yearNumber} (locale: ${locale}) for user ${userId}`);

    const questionnaire = await this.questionnaireParser.getQuestionnaireForYear(yearNumber, locale);
    let sections = questionnaire.sections || [];
    
    // If no sections found (file missing or empty), use English fallback questions
    if (!sections || sections.length === 0) {
      this.logger.warn(`No questionnaire sections found for Year ${yearNumber} (locale: ${locale}), using fallback questions`);
      sections = this.getFallbackPersonalityQuestions(yearNumber, locale);
    }
    
    // Count total questions for logging
    const totalQuestions = sections.reduce((sum, s) => sum + (s.questions?.length || 0), 0);
    this.logger.log(`Part A: Loaded ${totalQuestions} questions from ${sections.length} sections for Year ${yearNumber} (no limit)`);
    
    const questions = {
      sections,
      year: yearNumber,
    };

    // Create or update the test
    const test = await this.prisma.personalityTest.upsert({
      where: {
        userId_testType: {
          userId,
          testType: 'LEARNING_STYLE',
        },
      },
      update: {
        questions,
        status: 'PENDING',
      },
      create: {
        userId,
        testType: 'LEARNING_STYLE',
        questions,
        status: 'PENDING',
      },
    });

    return test;
  }

  /**
   * Get personality test questions (deprecated - now uses parser)
   * Kept for backward compatibility if needed
   */
  private async getPersonalityQuestions() {
    // This method is no longer used - questions come from questionnaire parser
    // But kept for any fallback scenarios
    return {
      sections: [],
    };
  }

  /** Fallback personality questions when questionnaire file is not available (English). */
  private getFallbackPersonalityQuestions(_yearNumber: number, _locale?: string): any[] {
    return [
      {
        title: 'About You',
        description: '',
        questions: [
          {
            id: 'languages',
            question: 'What languages do you speak at home? (Choose all that apply)',
            type: 'multiple_select',
            options: [
              { value: 'english', label: 'English' },
              { value: 'chinese', label: 'Chinese' },
              { value: 'hindi', label: 'Hindi' },
              { value: 'greek', label: 'Greek' },
              { value: 'albanian', label: 'Albanian' },
              { value: 'arabic', label: 'Arabic' },
              { value: 'russian', label: 'Russian' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'confidence',
            question: 'How confident do you feel about your learning this year?',
            type: 'multiple_choice',
            options: [
              { value: 'very_confident', label: 'Very confident' },
              { value: 'quite_confident', label: 'Quite confident' },
              { value: 'a_bit_unsure', label: 'A bit unsure' },
              { value: 'not_confident', label: 'Not confident' },
            ],
          },
        ],
      },
      {
        title: 'How You Learn',
        description: '',
        questions: [
          {
            id: 'learning_style',
            question: 'How do you like to learn new things? (Choose up to 3)',
            type: 'multiple_select',
            options: [
              { value: 'watching_videos', label: 'Watching videos' },
              { value: 'reading_texts', label: 'Reading texts' },
              { value: 'hands_on_activities', label: 'Hands-on activities' },
              { value: 'listening_explanations', label: 'Listening to explanations' },
              { value: 'working_with_others', label: 'Working with others' },
              { value: 'working_alone', label: 'Working alone' },
            ],
          },
          {
            id: 'difficulty_help',
            question: 'What helps you understand something difficult?',
            type: 'multiple_select',
            options: [
              { value: 'step_by_step_examples', label: 'Step-by-step examples' },
              { value: 'pictures_diagrams', label: 'Pictures and diagrams' },
              { value: 'trying_myself', label: 'Trying it myself' },
              { value: 'hearing_explanations', label: 'Hearing explanations' },
              { value: 'practice_questions', label: 'Practice questions' },
            ],
          },
          {
            id: 'difficulty_response',
            question: 'When you don\'t understand something, what do you prefer?',
            type: 'multiple_choice',
            options: [
              { value: 'try_again_alone', label: 'Try again on my own' },
              { value: 'get_hint', label: 'Get a hint' },
              { value: 'see_another_example', label: 'See another example' },
              { value: 'get_full_explanation', label: 'Get full explanation' },
              { value: 'ask_for_help', label: 'Ask for help' },
            ],
          },
        ],
      },
      {
        title: 'What You Enjoy',
        description: '',
        questions: [
          {
            id: 'preferred_subjects',
            question: 'Which subjects do you like the most? (Choose up to 3)',
            type: 'multiple_select',
            options: [
              { value: 'english', label: 'English' },
              { value: 'maths', label: 'Maths' },
              { value: 'science', label: 'Science' },
              { value: 'history', label: 'History' },
              { value: 'geography', label: 'Geography' },
              { value: 'art', label: 'Art' },
              { value: 'music', label: 'Music' },
              { value: 'pe', label: 'PE' },
              { value: 'computing', label: 'Computing' },
            ],
          },
          {
            id: 'difficult_subjects',
            question: 'Which subjects feel a bit difficult? (Choose up to 3)',
            type: 'multiple_select',
            options: [
              { value: 'english', label: 'English' },
              { value: 'maths', label: 'Maths' },
              { value: 'science', label: 'Science' },
              { value: 'history', label: 'History' },
              { value: 'geography', label: 'Geography' },
              { value: 'art', label: 'Art' },
              { value: 'music', label: 'Music' },
              { value: 'pe', label: 'PE' },
              { value: 'computing', label: 'Computing' },
            ],
          },
        ],
      },
      {
        title: 'Study Preferences',
        description: '',
        questions: [
          {
            id: 'preferred_time',
            question: 'When do you prefer to do Supercurriculum tasks?',
            type: 'multiple_choice',
            options: [
              { value: 'after_school', label: 'After school' },
              { value: 'evening', label: 'Evening' },
              { value: 'weekends', label: 'Weekends' },
              { value: 'little_every_day', label: 'A little every day' },
              { value: 'when_have_time', label: 'Only when I have extra time' },
            ],
          },
          {
            id: 'study_duration',
            question: 'How long can you study without getting tired?',
            type: 'multiple_choice',
            options: [
              { value: '5_minutes', label: '5 minutes' },
              { value: '10_minutes', label: '10 minutes' },
              { value: '15_minutes', label: '15 minutes' },
              { value: '20_minutes', label: '20 minutes' },
              { value: 'more_than_20', label: 'More than 20 minutes' },
            ],
          },
          {
            id: 'task_preference',
            question: 'What type of tasks do you enjoy most?',
            type: 'multiple_select',
            options: [
              { value: 'creative_activities', label: 'Creative activities' },
              { value: 'reading_tasks', label: 'Reading tasks' },
              { value: 'problem_solving', label: 'Problem-solving tasks' },
              { value: 'experiments', label: 'Experiments' },
              { value: 'quizzes_challenges', label: 'Quizzes and challenges' },
            ],
          },
        ],
      },
    ];
  }

  /**
   * Submit personality test answers and analyze results
   */
  async submitPersonalityTest(userId: string, answers: Record<string, any>) {
    const test = await this.prisma.personalityTest.findFirst({
      where: { userId, testType: 'LEARNING_STYLE' },
    });

    if (!test) {
      throw new NotFoundException('Personality test not found');
    }

    // Analyze answers to determine learning profile (pass questions to help identify which answers are for which questions)
    const questions = test.questions as any;
    const profile = this.analyzePersonalityAnswers(answers, questions);

    // Update test with results
    const updatedTest = await this.prisma.personalityTest.update({
      where: { id: test.id },
      data: {
        answers,
        results: profile,
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // Map personality learning style to LearningMode enum
    const mapLearningStyleToMode = (style: string): any => {
      const styleLower = style.toLowerCase();
      switch (styleLower) {
        case 'visual':
          return 'VIDEO'; // Visual learners prefer videos/diagrams
        case 'auditory':
          return 'VIDEO'; // Auditory learners prefer videos with audio
        case 'reading':
          return 'TEXT'; // Reading learners prefer text
        case 'kinesthetic':
          return 'HANDS_ON'; // Kinesthetic learners prefer hands-on activities
        default:
          return 'MIXED'; // Default to mixed
      }
    };

    // Map challenge level to ChallengeLevel enum
    const mapChallengeLevel = (level: string): any => {
      const levelUpper = level.toUpperCase();
      if (['EASY', 'MEDIUM', 'CHALLENGING', 'MIXED'].includes(levelUpper)) {
        return levelUpper;
      }
      return 'MEDIUM'; // Default to medium
    };

    // Map preferred subject names to subject IDs
    const preferredSubjectIds: string[] = [];
    if (profile.preferredSubjects && profile.preferredSubjects.length > 0) {
      const allSubjects = await this.prisma.subject.findMany({
        where: { isActive: true },
      });
      
      for (const subjectName of profile.preferredSubjects) {
        const subject = allSubjects.find(s => 
          s.name.toLowerCase().includes(subjectName.toLowerCase()) ||
          s.displayName.toLowerCase().includes(subjectName.toLowerCase())
        );
        if (subject) {
          preferredSubjectIds.push(subject.id);
        }
      }
    }

    // Calculate weekly study time
    const weeklyStudyTime = profile.studyDaysPerWeek * profile.dailyMinutesAvailable;

    // Update student profile with all learning preferences from questionnaire
    await this.prisma.studentProfile.updateMany({
      where: { userId },
      data: {
        preferredLearningMode: mapLearningStyleToMode(profile.primaryLearningStyle),
        preferredTaskDuration: profile.preferredTaskDuration,
        preferredChallengeLevel: mapChallengeLevel(profile.challengeLevel),
        dailyMinutes: profile.dailyMinutesAvailable,
        weeklyStudyTime: weeklyStudyTime,
        interests: profile.interests.length > 0 ? profile.interests : undefined,
        preferredSubjects: preferredSubjectIds.length > 0 ? preferredSubjectIds : undefined,
      },
    });

    this.logger.log(`Updated student profile with: ${profile.studyDaysPerWeek} days/week, ${profile.dailyMinutesAvailable} min/day, ${preferredSubjectIds.length} preferred subjects, ${profile.interests.length} interests`);

    return updatedTest;
  }

  /**
   * Analyze personality test answers to create learning profile
   */
  private analyzePersonalityAnswers(answers: Record<string, any>, questions?: any) {
    // This function analyzes answers from the actual questionnaire file
    // Answers come in format: { "q_1": "answer", "q_2": ["answer1", "answer2"], ... }
    // Questions can be passed to help identify which question IDs correspond to which questions
    
    // Extract learning style preferences from "How You Learn" section
    const styleCounts: Record<string, number> = { visual: 0, auditory: 0, reading: 0, kinesthetic: 0 };
    const learningStyleKeywords = {
      visual: ['watching videos', 'videos', 'diagrams', 'pictures', 'visual'],
      auditory: ['listening', 'hearing', 'explanation', 'audio'],
      reading: ['reading', 'texts', 'books', 'articles'],
      kinesthetic: ['hands-on', 'doing', 'trying', 'practice', 'practical'],
    };

    // Analyze all answers to determine learning style
    Object.values(answers).forEach((answer: any) => {
      if (typeof answer === 'string') {
        const answerLower = answer.toLowerCase();
        for (const [style, keywords] of Object.entries(learningStyleKeywords)) {
          if (keywords.some(keyword => answerLower.includes(keyword))) {
            styleCounts[style]++;
            break;
          }
        }
      }
    });

    // Determine primary learning style
    const primaryStyle = Object.entries(styleCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'mixed';

    // Extract study preferences
    let preferredTaskDuration = 15; // Default
    let studyDays = 5;
    let dailyMinutes = 20;
    let preferredSubjects: string[] = [];
    let difficultSubjects: string[] = [];
    let preferredTimeOfDay = 'evening';
    let challengeLevel = 'MEDIUM';
    const interests: string[] = [];

    // Extract preferred subjects and difficult subjects
    // First try direct question IDs, then try to find by question content
    let preferredSubjectsAnswer = answers['preferred_subjects'] || answers['favorite_subjects'];
    let difficultSubjectsAnswer = answers['difficult_subjects'];
    
    // If questions are provided, find question IDs by matching question text
    if (questions && !preferredSubjectsAnswer) {
      const sections = questions.sections || [];
      for (const section of sections) {
        const sectionQuestions = section.questions || [];
        for (const q of sectionQuestions) {
          const questionText = (q.question || '').toLowerCase();
          // Look for questions about preferred/favorite subjects
          if ((questionText.includes('enjoy') || questionText.includes('like') || questionText.includes('favorite') || questionText.includes('prefer')) 
              && (questionText.includes('subject'))) {
            preferredSubjectsAnswer = answers[q.id];
            this.logger.log(`Found preferred subjects question: "${q.question}" (ID: ${q.id})`);
            break;
          }
          // Look for questions about difficult subjects
          if (questionText.includes('difficult') || questionText.includes('challenging') || questionText.includes('hard')) {
            if (questionText.includes('subject')) {
              difficultSubjectsAnswer = answers[q.id];
              this.logger.log(`Found difficult subjects question: "${q.question}" (ID: ${q.id})`);
            }
          }
        }
      }
    }
    
    if (preferredSubjectsAnswer) {
      if (Array.isArray(preferredSubjectsAnswer)) {
        // Multiple select - array of values
        preferredSubjects = preferredSubjectsAnswer.map((val: any) => String(val).toLowerCase());
      } else if (typeof preferredSubjectsAnswer === 'string') {
        // Single value or comma-separated
        preferredSubjects = preferredSubjectsAnswer.split(',').map((s: string) => s.trim().toLowerCase());
      }
      this.logger.log(`Extracted ${preferredSubjects.length} preferred subjects: ${preferredSubjects.join(', ')}`);
    }

    if (difficultSubjectsAnswer) {
      if (Array.isArray(difficultSubjectsAnswer)) {
        difficultSubjects = difficultSubjectsAnswer.map((val: any) => String(val).toLowerCase());
      } else if (typeof difficultSubjectsAnswer === 'string') {
        difficultSubjects = difficultSubjectsAnswer.split(',').map((s: string) => s.trim().toLowerCase());
      }
    }

    // Extract interests from activity type questions
    let activityTypeAnswer = answers['activity_type'] || answers['task_preference'] || answers['preferred_activities'];
    
    // If questions are provided, find question IDs by matching question text
    if (questions && !activityTypeAnswer) {
      const sections = questions.sections || [];
      for (const section of sections) {
        const sectionQuestions = section.questions || [];
        for (const q of sectionQuestions) {
          const questionText = (q.question || '').toLowerCase();
          // Look for questions about activity preferences or what they enjoy
          if ((questionText.includes('activity') || questionText.includes('task') || questionText.includes('enjoy') || questionText.includes('prefer'))
              && (questionText.includes('learning') || questionText.includes('supercurriculum') || questionText.includes('kind'))) {
            activityTypeAnswer = answers[q.id];
            this.logger.log(`Found activity/interests question: "${q.question}" (ID: ${q.id})`);
            break;
          }
        }
      }
    }
    
    if (activityTypeAnswer) {
      const activityValues = Array.isArray(activityTypeAnswer) 
        ? activityTypeAnswer 
        : (typeof activityTypeAnswer === 'string' ? activityTypeAnswer.split(',') : []);
      
      activityValues.forEach((activity: any) => {
        const activityLower = String(activity).toLowerCase();
        if (activityLower.includes('creative') || activityLower.includes('art') || activityLower.includes('design') || activityLower.includes('presentation')) {
          if (!interests.includes('creative_arts')) interests.push('creative_arts');
        }
        if (activityLower.includes('reading') || activityLower.includes('research')) {
          if (!interests.includes('reading_research')) interests.push('reading_research');
        }
        if (activityLower.includes('problem') || activityLower.includes('puzzle') || activityLower.includes('challenging')) {
          if (!interests.includes('problem_solving')) interests.push('problem_solving');
        }
        if (activityLower.includes('experiment') || activityLower.includes('investigation')) {
          if (!interests.includes('science_experiments')) interests.push('science_experiments');
        }
        if (activityLower.includes('game') || activityLower.includes('quiz') || activityLower.includes('challenge')) {
          if (!interests.includes('games_quizzes')) interests.push('games_quizzes');
        }
      });
      this.logger.log(`Extracted ${interests.length} interests: ${interests.join(', ')}`);
    }

    // Debug: Log all answer keys to help identify question IDs
    this.logger.debug(`Answer keys received: ${Object.keys(answers).join(', ')}`);

    // Analyze answers for study time preferences (handle both string and array answers)
    Object.entries(answers).forEach(([questionId, answer]: [string, any]) => {
      // Handle arrays by joining or processing each value
      const answerValues = Array.isArray(answer) ? answer : [answer];
      
      answerValues.forEach((answerValue: any) => {
        if (typeof answerValue === 'string') {
          const answerLower = answerValue.toLowerCase();
        
        // Extract study days
        if (answerLower.includes('1 day')) studyDays = 1;
        else if (answerLower.includes('2 days')) studyDays = 2;
        else if (answerLower.includes('3 days')) studyDays = 3;
        else if (answerLower.includes('4 days')) studyDays = 4;
        else if (answerLower.includes('5 or more') || answerLower.includes('5+')) studyDays = 5;
        
        // Extract time available
        if (answerLower.includes('5-10 minutes') || answerLower.includes('5–10 minutes')) dailyMinutes = 7;
        else if (answerLower.includes('10-15 minutes') || answerLower.includes('10–15 minutes')) dailyMinutes = 12;
        else if (answerLower.includes('15-20 minutes') || answerLower.includes('15–20 minutes')) dailyMinutes = 17;
          else if (answerLower.includes('20-30 minutes') || answerLower.includes('20–30 minutes') || answerLower.includes('25–30 minutes')) dailyMinutes = 25;
        else if (answerLower.includes('more than 30') || answerLower.includes('30+')) dailyMinutes = 35;
        
        // Extract preferred time of day
          if (answerLower.includes('after school') || answerLower.includes('right after school')) preferredTimeOfDay = 'afternoon';
        else if (answerLower.includes('early evening')) preferredTimeOfDay = 'early_evening';
        else if (answerLower.includes('late evening') || answerLower.includes('evening')) preferredTimeOfDay = 'evening';
        else if (answerLower.includes('weekend')) preferredTimeOfDay = 'weekend';
          else if (answerLower.includes('every day') || answerLower.includes('each day') || answerLower.includes('little bit each day')) preferredTimeOfDay = 'daily';
        
        // Extract challenge preference
        if (answerLower.includes('easy') && answerLower.includes('comfortable')) challengeLevel = 'EASY';
          else if (answerLower.includes('challenging') || answerLower.includes('hard') || answerLower.includes('work hard')) challengeLevel = 'CHALLENGING';
          else if (answerLower.includes('medium') || answerLower.includes('need to think')) challengeLevel = 'MEDIUM';
        else if (answerLower.includes('mix')) challengeLevel = 'MIXED';
          }
        });
    });

    // Set preferred task duration based on daily minutes
    preferredTaskDuration = Math.min(dailyMinutes, 20); // Cap at 20 minutes per task

    return {
      primaryLearningStyle: primaryStyle,
      secondaryLearningStyle: Object.entries(styleCounts)
        .sort((a, b) => b[1] - a[1])[1]?.[0] || primaryStyle,
      preferredTaskDuration,
      challengeLevel,
      studyDaysPerWeek: studyDays,
      dailyMinutesAvailable: dailyMinutes,
      preferredTimeOfDay,
      preferredSubjects: preferredSubjects.length > 0 ? preferredSubjects : [],
      difficultSubjects,
      interests: interests.length > 0 ? interests : [],
      // Keep backward compatibility fields
      workStyle: 'mixed',
      motivationType: 'progress',
      confidenceLevel: 3,
      asksForHelp: true,
      selfOrganized: true,
      errorHandling: 'learn',
      learningGoal: 'understanding',
      // Store raw answers for detailed analysis
      rawAnswers: answers,
    };
  }

  /**
   * Map year group to a logical year number (1-13) for questionnaire/diagnostic PDF section lookup.
   * Uses orderIndex when set; otherwise parses "Year N" from displayName; default floor Year 5.
   */
  private getLogicalYearNumber(yearGroup: {
    name: string;
    displayName: string;
    locale?: string | null;
    orderIndex?: number | null;
  }): number {
    // DB orderIndex is now the canonical workflow source for year progression.
    if (typeof yearGroup.orderIndex === 'number' && Number.isFinite(yearGroup.orderIndex)) {
      return yearGroup.orderIndex;
    }
    const yearMatch = yearGroup.displayName.match(/\d+/);
    if (yearMatch) return parseInt(yearMatch[0], 10);
    return 5;
  }

  /**
   * Get the minimum (first) year group for the English curriculum.
   * Used to decide if Part B diagnostic should be skipped (student in first year).
   */
  private async getMinimumYearGroup(locale?: string) {
    const effectiveLocale = locale || 'en-GB';
    const where = await whereYearGroupLocale(
      this.prisma,
      effectiveLocale,
      true,
    );
    return this.prisma.yearGroup.findFirst({
      where,
      orderBy: { orderIndex: 'asc' },
    });
  }

  /**
   * Check if a year group is the minimum (first) year for its curriculum locale
   */
  private async isMinimumYearGroup(yearGroupId: string): Promise<boolean> {
    const yearGroup = await this.prisma.yearGroup.findUnique({ where: { id: yearGroupId } });
    if (!yearGroup) return false;
    const minimumYear = await this.getMinimumYearGroup((yearGroup as any).locale || 'en-GB');
    if (!minimumYear) return false;
    return minimumYear.id === yearGroupId;
  }

  /**
   * Generate a diagnostic test for a student based on their year group
   * IMPORTANT: Tests PREVIOUS year content to identify gaps
   * If student is Year 10, test Year 9 content
   * SKIPS Part B entirely for students in the minimum (first) year
   */
  async generateDiagnosticTest(userId: string, currentYearGroupId: string, preferredLocale?: string) {
    this.logger.log(`Generating diagnostic test for user ${userId} in year group ${currentYearGroupId}`);

    // Get current year group
    const currentYearGroup = await this.prisma.yearGroup.findUnique({
      where: { id: currentYearGroupId },
    });

    if (!currentYearGroup) {
      throw new NotFoundException('Year group not found');
    }

    // Check if this is the minimum year - if so, skip Part B entirely
    const isMinimumYear = await this.isMinimumYearGroup(currentYearGroupId);
    if (isMinimumYear) {
      this.logger.log(`Student is in ${currentYearGroup.displayName} (minimum year), skipping Part B diagnostic test`);
      // Return a placeholder test that's already completed
      return {
        id: `skipped_${userId}`,
        userId,
        yearGroupId: currentYearGroupId,
        questions: null,
        answers: null,
        results: null,
        status: 'COMPLETED' as const,
        completedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        skipped: true,
      };
    }

    const yearLocale = (currentYearGroup as any).locale || 'en-GB';
    const locale = this.resolveContentLocale(preferredLocale, yearLocale);
    const currentYearNum = this.getLogicalYearNumber(currentYearGroup as any);
    const previousYearNum = currentYearNum - 1;
    const minimumYear = await this.getMinimumYearGroup(locale);
    const minYearNum = minimumYear?.orderIndex ?? 5;

    // Skip Part B when there is no previous year (current is minimum year)
    if (previousYearNum < minYearNum || currentYearNum === minYearNum) {
      this.logger.log(`Student is in ${currentYearGroup.displayName} (minimum year - no previous year exists), skipping Part B diagnostic test`);
      // Return a placeholder test that's already completed
      return {
        id: `skipped_${userId}`,
        userId,
        yearGroupId: currentYearGroupId,
        questions: null,
        answers: null,
        results: null,
        status: 'COMPLETED' as const,
        completedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        skipped: true,
      };
    }
    
    const yearLocaleWhere = await whereYearGroupLocale(
      this.prisma,
      locale || 'en-GB',
      true,
    );
    const previousYearGroup = await this.prisma.yearGroup.findFirst({
      where: {
        orderIndex: previousYearNum,
        ...yearLocaleWhere,
      } as any,
    });

    if (!previousYearGroup) {
      // Additional safety: if previous year doesn't exist and current year is minimum or less, skip instead of error
      if (currentYearNum <= minYearNum) {
        this.logger.log(`Previous year group (orderIndex=${previousYearNum}) not found, but student is in minimum year flow, skipping Part B diagnostic test`);
        return {
          id: `skipped_${userId}`,
          userId,
          yearGroupId: currentYearGroupId,
          questions: null,
          answers: null,
          results: null,
          status: 'COMPLETED' as const,
          completedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          skipped: true,
        };
      }
      throw new NotFoundException(
        `Previous year group not found for locale=${locale} and orderIndex=${previousYearNum}`,
      );
    }
    
    const testYearGroup = previousYearGroup;
    const testedYearGroupDisplay = previousYearGroup.displayName;
    this.logger.log(`Student is ${currentYearGroup.displayName}, testing ${previousYearGroup.displayName} content`);

    // Get subjects for the year group we're testing
    const subjects = await this.prisma.subject.findMany({
      where: { yearGroupId: testYearGroup.id, isActive: true },
      include: { skills: true },
      orderBy: { orderIndex: 'asc' },
    });

    // Generate questions for ALL subjects (not just core)
    const questions = await this.generateDiagnosticQuestions(testYearGroup, subjects, locale);
    
    // Store which year was tested in the questions metadata
    if (questions && typeof questions === 'object' && 'questions' in questions) {
      (questions as any).testedYearGroup = testedYearGroupDisplay;
      (questions as any).currentYearGroup = currentYearGroup.displayName;
    }

    // Check if test already exists (using current year group ID as identifier)
    const existingTest = await this.prisma.diagnosticOnboardingTest.findFirst({
      where: { userId, yearGroupId: currentYearGroupId },
    });

    // IMPORTANT: If student is in minimum year, delete any existing test and return skipped placeholder
    // This handles cases where a test was created before the fix (minimum year in catalogue)
    if (currentYearNum === minYearNum && existingTest) {
      this.logger.log(`Minimum-year student has existing test - deleting it and skipping Part B`);
      try {
        await this.prisma.diagnosticOnboardingTest.delete({
          where: { id: existingTest.id },
        });
      } catch (error: any) {
        // Ignore deletion errors
      }
      // Return skipped placeholder
      return {
        id: `skipped_${userId}`,
        userId,
        yearGroupId: currentYearGroupId,
        questions: null,
        answers: null,
        results: null,
        status: 'COMPLETED' as const,
        completedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        skipped: true,
      };
    }

    // Only return existing test if it's COMPLETED and PASSED
    // If FAILED or PENDING, regenerate questions for retake
    if (existingTest && existingTest.questions && existingTest.status === 'COMPLETED') {
      // Check if it passed (results should have passed flag)
      const results = existingTest.results as any;
      if (results?.passed) {
        return existingTest;
      }
      // If failed, regenerate questions for retake
      this.logger.log(`Test failed, regenerating questions for retake`);
    }

    // If existing test failed, delete it to force regeneration
    if (existingTest && existingTest.status === 'FAILED') {
      try {
      await this.prisma.diagnosticOnboardingTest.delete({
        where: { id: existingTest.id },
      });
      this.logger.log(`Deleted failed test to allow regeneration`);
      } catch (error: any) {
        // Record might have been deleted already or doesn't exist - that's fine, upsert will handle it
        if (error.code !== 'P2025') { // P2025 is "Record to delete does not exist"
          this.logger.warn(`Failed to delete test (may already be deleted): ${error.message}`);
        }
      }
    }

    // Create or update the test (store current year group ID, but test previous year content)
    const test = await this.prisma.diagnosticOnboardingTest.upsert({
      where: {
        userId_yearGroupId: {
          userId,
          yearGroupId: currentYearGroupId,
        },
      },
      update: {
        questions,
        status: 'PENDING',
        answers: null, // Clear previous answers
        results: null, // Clear previous results
      },
      create: {
        userId,
        yearGroupId: currentYearGroupId, // Store current year, but questions test previous year
        questions,
        status: 'PENDING',
      },
    });

    return test;
  }

  /**
   * Generate diagnostic questions using actual diagnostic test file
   * Uses Diagnostic tests.pdf (and configured doc folders) for the previous year.
   */
  private async generateDiagnosticQuestions(yearGroup: any, subjects: any[], contentLocale?: string) {
    const previousYearNum = this.getLogicalYearNumber(yearGroup);
    const locale = contentLocale ?? ((yearGroup as any).locale || 'en-GB');
    this.logger.log(`Loading diagnostic test questions for Year ${previousYearNum} (locale: ${locale})`);

    try {
      const diagnosticTest = await this.questionnaireParser.getDiagnosticTestForYear(previousYearNum, locale);
      
      if (!diagnosticTest || !diagnosticTest.questions || diagnosticTest.questions.length === 0) {
        this.logger.warn(`No diagnostic questions found for Year ${previousYearNum}, trying OpenAI then fallback`);
        if (this.openai) {
          try {
            const aiResult = await this.generateDiagnosticQuestionsWithOpenAI(yearGroup, subjects, locale);
            if (aiResult && aiResult.questions.length > 0) return aiResult;
          } catch (err) {
            this.logger.warn(`OpenAI diagnostic generation failed: ${err?.message}, using fallback`);
          }
        }
        return this.getFallbackDiagnosticQuestions(yearGroup, subjects);
      }

      // Part B: Use exactly 30 questions from previous year (fixed limit)
      let questions = diagnosticTest.questions;
      
      // Limit to exactly 30 questions
      if (questions.length > 30) {
        this.logger.log(`Part B: Loaded ${questions.length} questions, limiting to exactly 30 questions`);
        questions = questions.slice(0, 30);
      } else if (questions.length < 30) {
        this.logger.warn(`Part B: Only ${questions.length} questions available (need 30). Using all available questions.`);
      }
      
      this.logger.log(`Part B: Using exactly ${questions.length} questions from Diagnostic tests.pdf for Year ${previousYearNum}`);
      
      if (questions.length === 0) {
        this.logger.warn(`Part B: No questions extracted from PDF for Year ${previousYearNum}`);
      }

      // Format questions to match expected structure
      const formattedQuestions = questions.map((q: any, index: number) => ({
        id: q.id || `diagnostic_q_${index + 1}`,
        question: q.question,
        type: q.type || 'multiple_choice',
        options: q.options || [],
        correctAnswer: q.correctAnswer || (q.options && q.options[0]?.value) || null,
        difficulty: 'medium', // Default difficulty
        skillTested: 'general_knowledge',
        explanation: `This question tests prior knowledge from Year ${previousYearNum}`,
      }));

      this.logger.log(`Successfully loaded ${formattedQuestions.length} diagnostic questions from file`);
      return {
        questions: formattedQuestions,
        testedYearGroup: yearGroup.displayName,
      };
    } catch (error) {
      this.logger.error(`Error loading diagnostic test from file: ${error.message}`, error);
      if (this.openai) {
        try {
          const aiResult = await this.generateDiagnosticQuestionsWithOpenAI(yearGroup, subjects, locale);
          if (aiResult && aiResult.questions.length > 0) return aiResult;
        } catch (err) {
          this.logger.warn(`OpenAI diagnostic generation failed: ${err?.message}, using fallback`);
        }
      }
      return this.getFallbackDiagnosticQuestions(yearGroup, subjects);
    }
  }

  /**
   * Generate 30 diagnostic questions using OpenAI for the given year and subjects.
   * Used when no PDF/folder diagnostic content is available.
   */
  private async generateDiagnosticQuestionsWithOpenAI(
    yearGroup: any,
    subjects: any[],
    localeOverride?: string,
  ): Promise<{ questions: any[]; testedYearGroup: string } | null> {
    const previousYearNum = this.getLogicalYearNumber(yearGroup);
    const locale = 'en-GB';
    const lang = 'English';
    const subjectNames = subjects.map((s) => s.displayName || s.name || '').filter(Boolean).join(', ') || 'general curriculum';
    const yearLabel = `Year ${previousYearNum}`;

    const prompt = `You are an expert educator. Generate exactly 30 multiple-choice diagnostic test questions to assess a student's knowledge from the PREVIOUS year (${yearLabel}).

Requirements:
- Curriculum context: ${lang} (locale: ${locale}). Subjects for this year: ${subjectNames}.
- Output exactly 30 questions. Each question must have 4 options (a, b, c, d). One correct answer per question.
- Questions should be appropriate for the end of ${yearLabel} (age-appropriate, standard curriculum).
- If subjects are provided, spread questions across those subjects. Otherwise use a mix of maths, language, and general knowledge.
- Language: write questions and options in English only.

Return a valid JSON object with this exact structure (no markdown, no code block):
{
  "questions": [
    {
      "id": "q1",
      "question": "Question text?",
      "type": "multiple_choice",
      "options": [
        { "value": "a", "label": "Option A" },
        { "value": "b", "label": "Option B" },
        { "value": "c", "label": "Option C" },
        { "value": "d", "label": "Option D" }
      ],
      "correctAnswer": "b",
      "skillTested": "topic or skill name",
      "subject": "subject key if applicable"
    }
  ]
}`;

    try {
      const response = await this.openai!.chat.completions.create({
        model: 'gpt-5.5',
        messages: [
          { role: 'system', content: 'You are an expert educator. Output only valid JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.6,
        max_tokens: 8000,
        response_format: { type: 'json_object' },
      });

      const raw = response.choices[0].message.content;
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed.questions) ? parsed.questions : [];
      if (list.length === 0) return null;

      const questions = list.slice(0, 30).map((q: any, index: number) => {
        const opts = Array.isArray(q.options) ? q.options : [];
        const options = opts.map((o: any, i: number) => ({
          value: (o.value ?? String.fromCharCode(97 + i)).toString().toLowerCase(),
          label: typeof o.label === 'string' ? o.label : (o.text ?? ''),
        }));
        const correctRaw = (q.correctAnswer ?? options[0]?.value ?? 'a').toString().toLowerCase();
        const correctAnswer = options.some((o: any) => o.value === correctRaw) ? correctRaw : (options[0]?.value ?? 'a');
        return {
          id: q.id || `diagnostic_q_${index + 1}`,
          question: q.question || '',
          type: q.type || 'multiple_choice',
          options: options.length >= 2 ? options : [
            { value: 'a', label: 'Option A' },
            { value: 'b', label: 'Option B' },
            { value: 'c', label: 'Option C' },
            { value: 'd', label: 'Option D' },
          ],
          correctAnswer,
          difficulty: q.difficulty || 'medium',
          skillTested: q.skillTested || 'general_knowledge',
          subject: q.subject ?? null,
          explanation: `This question tests prior knowledge from ${yearLabel}`,
        };
      });

      if (questions.length < 30) {
        this.logger.warn(`OpenAI returned ${questions.length} questions, padding to 30`);
        const defaultSet = this.getDefaultFallbackDiagnosticQuestions(yearGroup);
        const extra = defaultSet.questions.slice(0, 30 - questions.length);
        questions.push(...extra);
      }

      this.logger.log(`Generated ${questions.length} diagnostic questions via OpenAI for ${yearLabel}`);
      return {
        questions,
        testedYearGroup: yearGroup.displayName || yearLabel,
      };
    } catch (error) {
      this.logger.error(`OpenAI diagnostic generation error: ${error?.message}`, error);
      return null;
    }
  }

  /**
   * Fallback diagnostic questions when no PDF/folder content is found.
   * Uses subject-specific questions where subject name matches; otherwise returns a default set so Part B always has questions.
   */
  private getFallbackDiagnosticQuestions(yearGroup: any, subjects: any[]) {
    const allQuestions: any[] = [];

    for (const subject of subjects) {
      allQuestions.push(...this.getFallbackQuestionsForSubject(yearGroup, subject));
    }

    if (allQuestions.length === 0) {
      this.logger.warn('No fallback questions matched subjects; using default diagnostic set so Part B can display.');
      return this.getDefaultFallbackDiagnosticQuestions(yearGroup);
    }

    if (allQuestions.length < 30) {
      const defaultSet = this.getDefaultFallbackDiagnosticQuestions(yearGroup);
      const extra = defaultSet.questions.slice(0, 30 - allQuestions.length);
      allQuestions.push(...extra);
      this.logger.log(`Padded fallback to ${allQuestions.length} questions (target 30).`);
    }

    return { questions: allQuestions };
  }

  /**
   * Get fallback questions for a specific subject.
   * Normalizes subject name so mathematics -> maths, greek_language -> english, etc.
   */
  private getFallbackQuestionsForSubject(yearGroup: any, subject: any) {
    const questions: any[] = [];
    const yearNum = this.getLogicalYearNumber(yearGroup);
    const name = (subject.name || '').toLowerCase().replace(/\s+/g, '_');
    const normalized =
      name === 'mathematics' || name === 'math' ? 'maths'
      : name === 'greek_language' || name === 'greek' || name === 'greek_literature' ? 'english'
      : name === 'physics' || name === 'chemistry' || name === 'biology' ? 'science'
      : name;

    if (normalized === 'english') {
      questions.push(
        {
          id: 'eng_q1',
          subject: 'english',
          subjectDisplay: 'English',
          question: 'What is the main purpose of a topic sentence in a paragraph?',
          difficulty: 'easy',
          type: 'multiple_choice',
          options: [
            { value: 'a', label: 'To end the paragraph' },
            { value: 'b', label: 'To introduce the main idea' },
            { value: 'c', label: 'To provide examples' },
            { value: 'd', label: 'To confuse the reader' },
          ],
          correctAnswer: 'b',
          skillTested: 'writing',
        },
        {
          id: 'eng_q2',
          subject: 'english',
          subjectDisplay: 'English',
          question: 'Which of these is an example of a simile?',
          difficulty: 'medium',
          type: 'multiple_choice',
          options: [
            { value: 'a', label: 'The wind howled through the trees' },
            { value: 'b', label: 'Her smile was like sunshine' },
            { value: 'c', label: 'He is a lion in battle' },
            { value: 'd', label: 'The leaves danced in the breeze' },
          ],
          correctAnswer: 'b',
          skillTested: 'reading',
        }
      );
    } else if (normalized === 'maths') {
      questions.push(
        {
          id: 'maths_q1',
          subject: 'maths',
          subjectDisplay: 'Maths',
          question: 'What is 3/4 + 1/2?',
          difficulty: 'easy',
          type: 'multiple_choice',
          options: [
            { value: 'a', label: '4/6' },
            { value: 'b', label: '5/4' },
            { value: 'c', label: '1 1/4' },
            { value: 'd', label: '4/8' },
          ],
          correctAnswer: 'c',
          skillTested: 'number',
        },
        {
          id: 'maths_q2',
          subject: 'maths',
          subjectDisplay: 'Maths',
          question: 'Solve for x: 2x + 5 = 13',
          difficulty: 'medium',
          type: 'multiple_choice',
          options: [
            { value: 'a', label: 'x = 3' },
            { value: 'b', label: 'x = 4' },
            { value: 'c', label: 'x = 8' },
            { value: 'd', label: 'x = 9' },
          ],
          correctAnswer: 'b',
          skillTested: 'algebra',
        }
      );
    } else if (normalized === 'science') {
      questions.push(
        {
          id: 'sci_q1',
          subject: 'science',
          subjectDisplay: 'Science',
          question: 'What is the function of the nucleus in a cell?',
          difficulty: 'easy',
          type: 'multiple_choice',
          options: [
            { value: 'a', label: 'To produce energy' },
            { value: 'b', label: 'To control the cell and store DNA' },
            { value: 'c', label: 'To break down food' },
            { value: 'd', label: 'To protect the cell' },
          ],
          correctAnswer: 'b',
          skillTested: 'biology',
        },
        {
          id: 'sci_q2',
          subject: 'science',
          subjectDisplay: 'Science',
          question: 'What type of energy transformation occurs in a battery-powered torch?',
          difficulty: 'medium',
          type: 'multiple_choice',
          options: [
            { value: 'a', label: 'Light to chemical' },
            { value: 'b', label: 'Chemical to light and heat' },
            { value: 'c', label: 'Heat to light' },
            { value: 'd', label: 'Sound to light' },
          ],
          correctAnswer: 'b',
          skillTested: 'physics',
        }
      );
    } else {
      // Any other subject: add 2 generic questions so we have something to show
      const subjDisplay = subject.displayName || subject.name || 'Subject';
      questions.push(
        {
          id: `${(subject.id || subject.name || 's').toString().slice(0, 8)}_q1`,
          subject: subject.name,
          subjectDisplay: subjDisplay,
          question: `What did you find most interesting in ${subjDisplay} last year?`,
          difficulty: 'easy',
          type: 'multiple_choice',
          options: [
            { value: 'a', label: 'New concepts and ideas' },
            { value: 'b', label: 'Practical activities' },
            { value: 'c', label: 'Working with others' },
            { value: 'd', label: 'Solving problems' },
          ],
          correctAnswer: 'a',
          skillTested: 'general',
        },
        {
          id: `${(subject.id || subject.name || 's').toString().slice(0, 8)}_q2`,
          subject: subject.name,
          subjectDisplay: subjDisplay,
          question: `Which area would you like to improve in ${subjDisplay}?`,
          difficulty: 'easy',
          type: 'multiple_choice',
          options: [
            { value: 'a', label: 'Understanding key ideas' },
            { value: 'b', label: 'Applying what I learn' },
            { value: 'c', label: 'Remembering facts' },
            { value: 'd', label: 'All of the above' },
          ],
          correctAnswer: 'd',
          skillTested: 'general',
        }
      );
    }

    return questions;
  }

  /**
   * Default set of 30 fallback diagnostic questions when no PDF and no subject-matched fallbacks.
   * Ensures Part B always has questions to show when source files are sparse.
   */
  private getDefaultFallbackDiagnosticQuestions(yearGroup: any): { questions: any[] } {
    const yearNum = this.getLogicalYearNumber(yearGroup);
    const base = [
      { q: 'What is the main purpose of a topic sentence in a paragraph?', opts: ['To end the paragraph', 'To introduce the main idea', 'To provide examples', 'To confuse the reader'], correct: 1 },
      { q: 'Which is an example of a simile?', opts: ['The wind howled', 'Her smile was like sunshine', 'He is a lion', 'The leaves danced'], correct: 1 },
      { q: 'What is 3/4 + 1/2?', opts: ['4/6', '5/4', '1 1/4', '4/8'], correct: 2 },
      { q: 'Solve for x: 2x + 5 = 13', opts: ['x = 3', 'x = 4', 'x = 8', 'x = 9'], correct: 1 },
      { q: 'What is the function of the nucleus in a cell?', opts: ['To produce energy', 'To control the cell and store DNA', 'To break down food', 'To protect the cell'], correct: 1 },
      { q: 'What type of energy transformation occurs in a battery-powered torch?', opts: ['Light to chemical', 'Chemical to light and heat', 'Heat to light', 'Sound to light'], correct: 1 },
      { q: 'Which planet is closest to the Sun?', opts: ['Venus', 'Mercury', 'Earth', 'Mars'], correct: 1 },
      { q: 'What is 12 × 11?', opts: ['121', '132', '122', '111'], correct: 1 },
      { q: 'Which word is a noun?', opts: ['run', 'quickly', 'happiness', 'beautiful'], correct: 2 },
      { q: 'What is the capital of France?', opts: ['Lyon', 'Paris', 'Marseille', 'Nice'], correct: 1 },
      { q: 'How many sides does a hexagon have?', opts: ['5', '6', '7', '8'], correct: 1 },
      { q: 'What is the largest ocean on Earth?', opts: ['Atlantic', 'Indian', 'Pacific', 'Arctic'], correct: 2 },
      { q: 'Which fraction is equivalent to 1/2?', opts: ['2/3', '3/6', '4/5', '1/4'], correct: 1 },
      { q: 'What is the past tense of "go"?', opts: ['goed', 'went', 'gone', 'going'], correct: 1 },
      { q: 'What do plants need for photosynthesis?', opts: ['Only water', 'Only light', 'Light, water and carbon dioxide', 'Only soil'], correct: 2 },
      { q: 'What is 15% of 80?', opts: ['10', '12', '15', '18'], correct: 1 },
      { q: 'Which is a renewable energy source?', opts: ['Coal', 'Solar', 'Oil', 'Natural gas'], correct: 1 },
      { q: 'What is the smallest prime number?', opts: ['0', '1', '2', '3'], correct: 2 },
      { q: 'In a story, what is the "setting"?', opts: ['The main character', 'The time and place', 'The problem', 'The solution'], correct: 1 },
      { q: 'What is 7²?', opts: ['14', '49', '42', '56'], correct: 1 },
      { q: 'Which organ pumps blood around the body?', opts: ['Lungs', 'Liver', 'Heart', 'Kidneys'], correct: 2 },
      { q: 'What is an adjective?', opts: ['A doing word', 'A describing word', 'A naming word', 'A joining word'], correct: 1 },
      { q: 'How many centimetres in 1 metre?', opts: ['10', '100', '1000', '50'], correct: 1 },
      { q: 'What is the main gas in the air we breathe?', opts: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Hydrogen'], correct: 2 },
      { q: 'Which shape has all sides equal?', opts: ['Rectangle', 'Square', 'Triangle', 'Parallelogram'], correct: 1 },
      { q: 'What is the opposite of "ancient"?', opts: ['Old', 'Modern', 'Historic', 'Past'], correct: 1 },
      { q: 'What is 1000 − 237?', opts: ['763', '773', '763', '753'], correct: 0 },
      { q: 'Which continent is Egypt in?', opts: ['Asia', 'Europe', 'Africa', 'South America'], correct: 2 },
      { q: 'What is a verb?', opts: ['A naming word', 'An action or state word', 'A describing word', 'A place word'], correct: 1 },
      { q: 'What is the boiling point of water (in °C)?', opts: ['90', '100', '110', '0'], correct: 1 },
    ];
    const questions = base.slice(0, 30).map((item, index) => ({
      id: `default_diag_${index + 1}`,
      question: item.q,
      type: 'multiple_choice',
      options: item.opts.map((label, i) => ({ value: String.fromCharCode(97 + i), label })),
      correctAnswer: String.fromCharCode(97 + item.correct),
      difficulty: 'medium',
      skillTested: 'general_knowledge',
      explanation: `This question tests prior knowledge from Year ${yearNum}`,
    }));
    return { questions };
  }

  private getDiagnosticQuestionsFromStored(questionsStored: any): { id: string }[] {
    if (!questionsStored) return [];
    if (Array.isArray(questionsStored)) {
      return questionsStored;
    }
    if (typeof questionsStored === 'object' && Array.isArray(questionsStored.questions)) {
      return questionsStored.questions;
    }
    return [];
  }

  private normalizeIncomingPartBAnswers(input?: Record<string, any>): Record<string, string> {
    if (!input || typeof input !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [key, raw] of Object.entries(input)) {
      if (Array.isArray(raw)) {
        out[key] = raw.map((v) => String(v ?? '')).join(',');
      } else if (raw === undefined || raw === null) {
        out[key] = '';
      } else {
        out[key] = String(raw);
      }
    }
    return out;
  }

  private assertPartBAnswersComplete(storedQuestions: any, answers: Record<string, string>) {
    const questions = this.getDiagnosticQuestionsFromStored(storedQuestions).filter((q) => q?.id);
    if (questions.length === 0) {
      throw new BadRequestException(
        'Knowledge assessment has no questions. Please reopen the assessment.',
      );
    }
    for (const q of questions) {
      const v = answers[q.id];
      if (v === undefined || v === null || String(v).trim() === '') {
        throw new BadRequestException(
          'Please complete every knowledge assessment question before submitting.',
        );
      }
    }
  }

  /**
   * Submit diagnostic test answers and analyze results using AI
   */
  async submitDiagnosticTest(userId: string, yearGroupId: string, answers: Record<string, string>) {
    const test = await this.prisma.diagnosticOnboardingTest.findFirst({
      where: { userId, yearGroupId },
    });

    if (!test) {
      throw new NotFoundException('Diagnostic test not found');
    }

    // Score the test and identify gaps
    const results = this.scoreDiagnosticTest(test.questions as any, answers);
    
    // Part B is informational during onboarding: always mark as completed.
    // We still return score details so the UI can show clear results.
    const passed = true;
    
    // Use AI to provide detailed feedback if available
    let aiFeedback = null;
    if (this.openai && test.questions) {
      try {
        aiFeedback = await this.generateAIFeedback(test.questions as any, answers, results);
      } catch (error) {
        this.logger.error('Error generating AI feedback:', error);
      }
    }

    // Update test with results
    const updatedTest = await this.prisma.diagnosticOnboardingTest.update({
      where: { id: test.id },
      data: {
        answers,
        results: {
          ...results,
          passed,
          aiFeedback,
        },
        score: results.overallScore,
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // Always derive support gaps from results to personalize next steps.
    await this.createSkillGapsFromResults(userId, yearGroupId, results);

    return {
      ...updatedTest,
      passed,
      results: {
        ...results,
        aiFeedback,
      },
    };
  }

  /**
   * Generate AI feedback for diagnostic test results
   */
  private async generateAIFeedback(testData: any, answers: Record<string, string>, results: any) {
    // Extract questions array from testData (handles both array and object formats)
    const questions = Array.isArray(testData) 
      ? testData 
      : (testData?.questions || []);
    
    if (!Array.isArray(questions) || questions.length === 0) {
      this.logger.warn('No questions found for AI feedback generation');
      return null;
    }
    
    const incorrectQuestions = questions.filter(q => answers[q.id] !== q.correctAnswer);
    const correctQuestions = questions.filter(q => answers[q.id] === q.correctAnswer);

    const prompt = `You are an expert UK curriculum tutor. A student just completed a diagnostic test with the following results:
- Total Questions: ${questions.length}
- Correct Answers: ${results.totalCorrect}
- Score: ${results.overallScore}%

Provide encouraging, constructive feedback in JSON format:
{
  "overallFeedback": "Overall message about their performance",
  "strengths": ["Strength 1", "Strength 2"],
  "areasForImprovement": ["Area 1", "Area 2"],
  "recommendations": ["Recommendation 1", "Recommendation 2"]
}

Be encouraging and focus on growth. If they scored below 50%, emphasize that this is a learning opportunity.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-5.5',
        messages: [
          {
            role: 'system',
            content: 'You are a supportive and encouraging educational tutor providing constructive feedback.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      return JSON.parse(response.choices[0].message.content || '{}');
    } catch (error) {
      this.logger.error('Error generating AI feedback:', error);
      return null;
    }
  }

  /**
   * Score diagnostic test and identify knowledge gaps
   */
  private scoreDiagnosticTest(testData: any, answers: Record<string, string>) {
    const questions = testData.questions || [];
    let totalCorrect = 0;
    const subjectScores: Record<string, { correct: number; total: number; gaps: string[] }> = {};

    for (const question of questions) {
      const subject = question.subject;
      
      if (!subjectScores[subject]) {
        subjectScores[subject] = { correct: 0, total: 0, gaps: [] };
      }
      
      subjectScores[subject].total++;
      
      const userAnswer = answers[question.id];
      if (userAnswer === question.correctAnswer) {
        totalCorrect++;
        subjectScores[subject].correct++;
      } else {
        // Record the skill as a gap
        if (question.skillTested) {
          subjectScores[subject].gaps.push(question.skillTested);
        }
      }
    }

    const overallScore = questions.length > 0 
      ? Math.round((totalCorrect / questions.length) * 100) 
      : 0;

    // Calculate per-subject scores and identify weak areas
    const subjectAnalysis: Record<string, any> = {};
    for (const [subject, data] of Object.entries(subjectScores)) {
      const percentage = data.total > 0 
        ? Math.round((data.correct / data.total) * 100) 
        : 0;
      
      subjectAnalysis[subject] = {
        score: percentage,
        correct: data.correct,
        total: data.total,
        gaps: [...new Set(data.gaps)], // Remove duplicates
        needsSupport: percentage < 60,
      };
    }

    return {
      overallScore,
      totalCorrect,
      totalQuestions: questions.length,
      subjectAnalysis,
      overallStrength: overallScore >= 70 ? 'strong' : overallScore >= 50 ? 'developing' : 'needs_support',
    };
  }

  /**
   * Create skill gap records based on diagnostic results
   */
  private async createSkillGapsFromResults(
    userId: string, 
    yearGroupId: string, 
    results: any
  ) {
    // For subjects where student scored below 60%, create intervention needs
    for (const [subjectName, analysis] of Object.entries(results.subjectAnalysis as Record<string, any>)) {
      if (analysis.needsSupport) {
        // Find the subject
        const subject = await this.prisma.subject.findFirst({
          where: { name: subjectName, yearGroupId, locale: 'en-GB' },
          include: { skills: true },
        });

        if (subject) {
          // Mark skills that were identified as gaps
          for (const gapSkillName of analysis.gaps) {
            const skill = subject.skills.find(s => 
              s.name.toLowerCase().includes(gapSkillName.toLowerCase()) ||
              s.displayName.toLowerCase().includes(gapSkillName.toLowerCase())
            );

            if (skill) {
              // Create or update skill mastery with low level
              await this.prisma.skillMastery.upsert({
                where: {
                  userId_subjectId_skillId: {
                    userId,
                    subjectId: subject.id,
                    skillId: skill.id,
                  },
                },
                update: {
                  masteryLevel: MasteryLevel.NEEDS_SUPPORT,
                  lastPracticed: new Date(),
                },
                create: {
                  userId,
                  subjectId: subject.id,
                  skillId: skill.id,
                  masteryLevel: MasteryLevel.NEEDS_SUPPORT,
                  lastPracticed: new Date(),
                },
              });
            }
          }
        }
      }
    }
  }

  /**
   * Get unified mandatory test (Part A: Personality + Part B: Diagnostic)
   * This is the single test students must complete before accessing content
   * Part B is SKIPPED for students in the minimum (first) year
   */
  async getUnifiedMandatoryTest(userId: string, currentYearGroupId: string, preferredLocale?: string) {
    // Get or generate Part A: Personality Test
    const personalityTest = await this.generatePersonalityTest(userId, preferredLocale);
    
    // Get current year group to check year number
    const currentYearGroup = await this.prisma.yearGroup.findUnique({
      where: { id: currentYearGroupId },
    });
    
    if (!currentYearGroup) {
      throw new NotFoundException('Year group not found');
    }
    
    const currentYearNum = this.getLogicalYearNumber(currentYearGroup as any);
    const isMinimumYear = await this.isMinimumYearGroup(currentYearGroupId);
    const locale = this.resolveContentLocale(preferredLocale, (currentYearGroup as any).locale || 'en-GB');
    const minimumYear = await this.getMinimumYearGroup(locale);
    const minYearNum = minimumYear?.orderIndex ?? 5;

    // Clean up any existing diagnostic tests for minimum-year students (lowest year in catalogue)
    if (currentYearNum <= minYearNum || isMinimumYear) {
      const existingTest = await this.prisma.diagnosticOnboardingTest.findFirst({
        where: { userId, yearGroupId: currentYearGroupId },
      });
      if (existingTest) {
        this.logger.log(`Minimum-year student has existing diagnostic test - deleting it (Part B should be skipped)`);
        try {
          await this.prisma.diagnosticOnboardingTest.delete({
            where: { id: existingTest.id },
          });
        } catch (error: any) {
          // Ignore deletion errors
        }
      }
    }
    
    let diagnosticTest = null;
    let partB = null;

    if (!isMinimumYear) {
      try {
        // Get or generate Part B: Diagnostic Test (previous year) - only for non-minimum years
        diagnosticTest = await this.generateDiagnosticTest(userId, currentYearGroupId, preferredLocale);
      } catch (err: any) {
        this.logger.warn(`Part B diagnostic test could not be loaded (e.g. no content for this year): ${err?.message}. Returning test without Part B.`);
        diagnosticTest = null;
      }

      // Check if test was skipped (for Year 5 students or minimum year)
      if (diagnosticTest && ((diagnosticTest as any).skipped || !diagnosticTest.questions)) {
        this.logger.log(`Part B diagnostic test was skipped (minimum year or no previous year)`);
        partB = null;
      } else if (diagnosticTest) {
      // Extract questions array from diagnostic test
      let questionsArray: any[] = [];
      if (diagnosticTest.questions) {
        if (Array.isArray(diagnosticTest.questions)) {
          questionsArray = diagnosticTest.questions;
        } else if (typeof diagnosticTest.questions === 'object' && 'questions' in diagnosticTest.questions) {
          questionsArray = (diagnosticTest.questions as any).questions || [];
        }
      }
      
        // Part B: Limit to exactly 30 questions (fixed limit)
        if (questionsArray.length > 30) {
          this.logger.log(`Part B: Found ${questionsArray.length} questions, limiting to exactly 30 questions`);
          questionsArray = questionsArray.slice(0, 30);
        } else if (questionsArray.length < 30) {
          this.logger.warn(`Part B: Only ${questionsArray.length} questions available (need 30). Using all available questions.`);
        }
        
        if (questionsArray.length > 0) {
          this.logger.log(`Part B: Using exactly ${questionsArray.length} questions from diagnostic test`);
        } else {
          this.logger.warn(`Part B: No questions found in diagnostic test`);
      }
      
      partB = {
        id: diagnosticTest.id,
        type: 'diagnostic',
        title: `Part B: Knowledge Assessment (Previous Year)`,
        description: null, // Let frontend use localized string (mandatory.knowledgeIntroDescPrevious)
        questions: questionsArray, // Return as array directly (exactly 30 questions)
        status: diagnosticTest.status,
        testedYearGroup: (diagnosticTest.questions as any)?.testedYearGroup || 'Previous Year',
      };
      }
    } else {
      // For minimum year, Part B is skipped
      this.logger.log(`Student is in minimum year (Year ${currentYearNum}), Part B diagnostic test is skipped`);
    }

    // Test is complete if Part A is done AND (Part B is done OR Part B is skipped)
    const testComplete = personalityTest.status === 'COMPLETED' && 
      (isMinimumYear || diagnosticTest?.status === 'COMPLETED');

    const partATitle = 'Part A: Learning Style Assessment';
    const partADescription = 'Help us understand how you learn best';

    return {
      testId: `unified_${userId}`,
      partA: {
        id: personalityTest.id,
        type: 'personality',
        title: partATitle,
        description: partADescription,
        questions: personalityTest.questions,
        status: personalityTest.status,
        answers: personalityTest.answers || null, // Include answers if test is completed
      },
      partB: partB, // null for minimum year students
      isMinimumYear, // Flag to indicate if Part B is skipped
      status: testComplete ? 'COMPLETED' : 'PENDING',
    };
  }

  /**
   * Submit unified mandatory test (both Part A and Part B)
   * After submission, enables curriculum-first learning flows
   * Part B is skipped for students in minimum year
   */
  async submitUnifiedMandatoryTest(
    userId: string,
    currentYearGroupId: string,
    partAAnswers: Record<string, any>,
    partBAnswers?: Record<string, any>,
  ) {
    const profileBefore = await this.prisma.studentProfile.findUnique({
      where: { userId },
      select: { onboardingCompleted: true },
    });
    const alreadyOnboarded = profileBefore?.onboardingCompleted ?? false;

    const personalityResults = await this.submitPersonalityTest(userId, partAAnswers);

    const currentYearGroup = await this.prisma.yearGroup.findUnique({
      where: { id: currentYearGroupId },
    });

    if (!currentYearGroup) {
      throw new NotFoundException('Year group not found');
    }

    const currentYearNum = this.getLogicalYearNumber(currentYearGroup as any);
    const locale = (currentYearGroup as any).locale || 'en-GB';
    const minimumYear = await this.getMinimumYearGroup(locale);
    const minYearNum = minimumYear?.orderIndex ?? 5;

    const isMinimumYear = await this.isMinimumYearGroup(currentYearGroupId);

    let diagnosticResults = null;
    let partBPassed = true;

    const requiresPartB = !isMinimumYear && currentYearNum !== minYearNum;

    if (requiresPartB) {
      const diagnosticRow = await this.prisma.diagnosticOnboardingTest.findFirst({
        where: { userId, yearGroupId: currentYearGroupId },
      });
      if (!diagnosticRow?.questions) {
        throw new BadRequestException(
          'Knowledge assessment (Part B) is required but could not be loaded. Please return to the assessment and try again.',
        );
      }
      const normalizedAnswers = this.normalizeIncomingPartBAnswers(partBAnswers);
      this.assertPartBAnswersComplete(diagnosticRow.questions, normalizedAnswers);
      const diagnosticTestResult = await this.submitDiagnosticTest(userId, currentYearGroupId, normalizedAnswers);
      diagnosticResults = diagnosticTestResult;
      partBPassed = diagnosticTestResult.passed ?? true;
    } else {
      this.logger.log(`Student is in Year ${currentYearNum} (minimum year), Part B diagnostic test is skipped`);
      if (partBAnswers && Object.keys(partBAnswers).length > 0) {
        this.logger.warn(
          `Year ${currentYearNum} student provided Part B answers, but Part B is skipped - ignoring answers`,
        );
      }
    }

    await this.prisma.studentProfile.updateMany({
      where: { userId },
      data: { onboardingCompleted: true },
    });

    if (!alreadyOnboarded && currentYearGroupId) {
      await this.usersService.runPostMandatoryOnboardingSetup(userId, currentYearGroupId);
    }

    const message = 'Test completed! Your curriculum-aligned learning setup is ready.';

    return {
      success: true,
      partAPassed: true,
      partBPassed,
      personalityResults,
      diagnosticResults,
      message,
    };
  }

  /**
   * Generate personalized activities based on test results
   * Called automatically after test completion
   */
  async generatePersonalizedActivities(
    userId: string,
    currentYearGroupId: string,
    selectedSubjectIds?: string[],
  ) {
    // Get test results
    const personalityTest = await this.prisma.personalityTest.findFirst({
      where: { userId },
    });

    // Check if student is in minimum year (Part B is skipped)
    const isMinimumYear = await this.isMinimumYearGroup(currentYearGroupId);

    let diagnosticTest = null;
    if (!isMinimumYear) {
      diagnosticTest = await this.prisma.diagnosticOnboardingTest.findFirst({
        where: { userId, yearGroupId: currentYearGroupId },
      });
    }

    if (!personalityTest || (!isMinimumYear && (!diagnosticTest || diagnosticTest.status !== 'COMPLETED'))) {
      throw new NotFoundException('Test results not found. Please complete the mandatory test first.');
    }

    const personalityResults = personalityTest.results as any;
    const diagnosticResults = isMinimumYear ? null : (diagnosticTest?.results as any);

    // Get subjects to generate activities for
    let subjects = await this.prisma.subject.findMany({
      where: { 
        yearGroupId: currentYearGroupId,
        isActive: true,
        ...(selectedSubjectIds?.length ? { id: { in: selectedSubjectIds } } : {}),
      },
      include: { skills: true },
    });

    // If no subjects selected, use all subjects
    if (!selectedSubjectIds || selectedSubjectIds.length === 0) {
      // Default to core subjects if none selected
      subjects = subjects.filter(s => ['english', 'maths', 'science'].includes(s.name));
    }

    const generatedActivities = [];

    // Generate activities for each subject based on:
    // 1. Diagnostic test gaps (if available)
    // 2. Personality learning style
    // 3. Challenge level preference
    for (const subject of subjects) {
      const subjectGaps = diagnosticResults?.subjectAnalysis?.[subject.name]?.gaps || [];
      const subjectScore = diagnosticResults?.subjectAnalysis?.[subject.name]?.score || 50;

      // Determine difficulty based on diagnostic score
      let difficulty = 'DEVELOPING';
      if (subjectScore < 40) {
        difficulty = 'NEEDS_SUPPORT';
      } else if (subjectScore >= 70) {
        difficulty = 'SECURE';
      }

      // Generate activities for skills with gaps
      for (const skill of subject.skills) {
        const hasGap = subjectGaps.some((gap: string) => 
          skill.name.toLowerCase().includes(gap.toLowerCase()) ||
          skill.displayName.toLowerCase().includes(gap.toLowerCase())
        );

        if (hasGap || subjectScore < 60) {
          // Generate personalized activity using AI
          try {
            const activity = await this.generatePersonalizedActivityForSkill(
              subject,
              skill,
              personalityResults,
              diagnosticResults,
              difficulty,
            );

            if (activity) {
              generatedActivities.push(activity);
            }
          } catch (error) {
            this.logger.error(`Error generating activity for ${subject.displayName} - ${skill.displayName}:`, error);
          }
        }
      }
    }

    return {
      generated: generatedActivities.length,
      activities: generatedActivities,
    };
  }

  /**
   * Generate a single personalized activity for a skill
   */
  private async generatePersonalizedActivityForSkill(
    subject: any,
    skill: any,
    personalityResults: any,
    diagnosticResults: any,
    difficulty: string,
  ) {
    if (!this.openai) {
      return null;
    }

    const prompt = `Generate a personalized learning activity for a student.

Subject: ${subject.displayName}
Skill: ${skill.displayName}
Difficulty Level: ${difficulty}

Student Learning Profile:
- Learning Style: ${personalityResults.primaryLearningStyle}
- Challenge Preference: ${personalityResults.challengeLevel}
- Task Duration: ${personalityResults.preferredTaskDuration} minutes
- Confidence Level: ${personalityResults.confidenceLevel}/5
- Motivation: ${personalityResults.motivationType}

Knowledge Gaps Identified: ${diagnosticResults?.subjectAnalysis?.[subject.name]?.gaps?.join(', ') || 'None specific'}

Create an activity that:
1. Addresses identified knowledge gaps
2. Matches the student's learning style (${personalityResults.primaryLearningStyle})
3. Is appropriate for ${difficulty} level
4. Takes about ${personalityResults.preferredTaskDuration} minutes
5. Is engaging and personalized

Return as JSON:
{
  "title": "Activity title",
  "description": "What students will learn",
  "instructions": "Clear step-by-step instructions as a single string (use \\n for line breaks)",
  "content": {
    "type": "problems|reading|writing|creative",
    "items": []
  },
  "estimatedMinutes": ${personalityResults.preferredTaskDuration}
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-5.5',
        messages: [
          {
            role: 'system',
            content: 'You are an expert curriculum designer creating personalized learning activities based on student test results.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.8,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');

      // Convert instructions to string if it's an array
      let instructionsText = result.instructions;
      if (Array.isArray(instructionsText)) {
        instructionsText = instructionsText.join('\n\n');
      } else if (typeof instructionsText !== 'string') {
        instructionsText = String(instructionsText || '');
      }

      // Create activity in database
      const activity = await this.prisma.activity.create({
        data: {
          subjectId: subject.id,
          skillId: skill.id,
          title: result.title,
          description: result.description,
          instructions: instructionsText,
          resources: result.content ? { content: result.content } : undefined,
          activityType: this.determineActivityType(subject.name, skill.name),
          difficulty: difficulty as any,
          estimatedMinutes: result.estimatedMinutes || personalityResults.preferredTaskDuration,
          isActive: true,
        },
      });

      return activity;
    } catch (error) {
      this.logger.error(`Error generating personalized activity:`, error);
      return null;
    }
  }

  /**
   * Determine activity type based on subject and skill
   */
  private determineActivityType(subjectName: string, skillName: string): any {
    const lowerSubject = subjectName.toLowerCase();
    const lowerSkill = skillName.toLowerCase();

    if (lowerSkill.includes('reading') || lowerSkill.includes('comprehension')) {
      return 'READING';
    }
    if (lowerSkill.includes('writing') || lowerSkill.includes('composition')) {
      return 'WRITING';
    }
    if (lowerSubject.includes('maths') || lowerSubject.includes('math')) {
      return 'SCAFFOLDED_EXERCISE';
    }
    if (lowerSubject.includes('science')) {
      return 'RESEARCHING';
    }
    return 'SCAFFOLDED_EXERCISE';
  }

  /**
   * Get student's onboarding status
   */
  async getOnboardingStatus(userId: string) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return {
        testComplete: false,
        canAccessContent: false,
        currentStep: 'profile',
        message: 'Please complete your profile first',
      };
    }

    const personalityTest = await this.prisma.personalityTest.findFirst({
      where: { userId },
    });

    // Get year group to check year number and locale
    const yearGroup = await this.prisma.yearGroup.findUnique({
      where: { id: profile.yearGroupId },
    });

    const currentYearNum = yearGroup ? this.getLogicalYearNumber(yearGroup as any) : 5;
    const locale = (yearGroup as any)?.locale || 'en-GB';

    // Check if student is in minimum year (Part B is skipped for minimum year)
    const minimumYear = await this.getMinimumYearGroup(locale);
    const isMinimumYear = minimumYear?.id === profile?.yearGroupId;
    const minYearNum = minimumYear?.orderIndex ?? 5;

    let diagnosticTest = null;
    let testComplete = false;

    // For minimum year students, only Part A is required
    if (isMinimumYear || currentYearNum === minYearNum) {
      testComplete = personalityTest?.status === 'COMPLETED';
    } else {
      diagnosticTest = profile 
        ? await this.prisma.diagnosticOnboardingTest.findFirst({
            where: { userId, yearGroupId: profile.yearGroupId },
          })
        : null;
      testComplete = personalityTest?.status === 'COMPLETED' && diagnosticTest?.status === 'COMPLETED';
    }

    const partBSkipped = isMinimumYear || currentYearNum === minYearNum;
    return {
      profileComplete: !!profile,
      testComplete,
      canAccessContent: testComplete, // Block access until test complete
      personalityTestComplete: personalityTest?.status === 'COMPLETED',
      diagnosticTestComplete: partBSkipped ? true : diagnosticTest?.status === 'COMPLETED',
      isMinimumYear: partBSkipped,
      onboardingComplete: profile?.onboardingCompleted || false,
      currentStep: !profile 
        ? 'profile'
        : !testComplete
        ? 'mandatory_test'
        : 'complete',
    };
  }

  /**
   * Pre-warm Part B diagnostic extraction for all non-minimum year groups.
   * Useful as an operational command to reduce first-user cold-start latency.
   */
  async warmupPartBDiagnostics(locale: string = 'en-GB') {
    const where = await whereYearGroupLocale(this.prisma, locale, true);
    const yearGroups = await this.prisma.yearGroup.findMany({
      where,
      orderBy: { orderIndex: 'asc' },
    });

    if (!yearGroups.length) {
      this.logger.warn('Part B warmup: no active year groups found.');
      return { totalYears: 0, warmed: 0, skipped: 0, failed: 0 };
    }

    const minOrderIndex = yearGroups[0].orderIndex ?? 5;
    let warmed = 0;
    let skipped = 0;
    let failed = 0;

    for (const yearGroup of yearGroups) {
      const currentYearNum = this.getLogicalYearNumber(yearGroup as any);
      if (currentYearNum <= minOrderIndex) {
        skipped += 1;
        this.logger.log(
          `Part B warmup: skipping ${yearGroup.displayName} (minimum-year flow has no Part B).`,
        );
        continue;
      }

      const previousYearNum = currentYearNum - 1;
      try {
        this.logger.log(
          `Part B warmup: preloading diagnostic parser for ${yearGroup.displayName} (previous year ${previousYearNum}).`,
        );
        const diagnostic = await this.questionnaireParser.getDiagnosticTestForYear(
          previousYearNum,
          locale,
        );
        const questionCount = Array.isArray(diagnostic?.questions) ? diagnostic.questions.length : 0;
        this.logger.log(
          `Part B warmup: ${yearGroup.displayName} ready (${questionCount} source questions loaded).`,
        );
        warmed += 1;
      } catch (error: any) {
        failed += 1;
        this.logger.warn(
          `Part B warmup failed for ${yearGroup.displayName}: ${error?.message || 'unknown error'}`,
        );
      }
    }

    return {
      totalYears: yearGroups.length,
      warmed,
      skipped,
      failed,
    };
  }
}
