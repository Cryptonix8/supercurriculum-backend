import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurriculumPdfParserService } from '../curriculum-parser/curriculum-pdf-parser.service';
import { AutoExerciseGeneratorService } from '../activity-generation/auto-exercise-generator.service';
import { Band, ActivityType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

/**
 * Auto-Initialization Service
 * 
 * This service runs on application startup and ensures the database
 * is fully populated with curriculum content, making the app work
 * without any manual admin intervention.
 * 
 * Flow:
 * 1. Check if year groups exist, if not create them
 * 2. Check if subjects exist, if not create them with skills
 * 3. Check if curriculum topics exist, if not parse PDFs
 * 4. Check if activities exist, if not generate them
 * 5. Create default admin user if not exists
 */
@Injectable()
export class AutoInitService implements OnModuleInit {
  private readonly logger = new Logger(AutoInitService.name);
  private isInitializing = false;

  constructor(
    private prisma: PrismaService,
    private pdfParser: CurriculumPdfParserService,
    private autoExerciseGenerator: AutoExerciseGeneratorService,
  ) {}

  async onModuleInit() {
    // Run initialization in background to not block startup
    this.initializeInBackground();
  }

  private async initializeInBackground() {
    if (this.isInitializing) {
      this.logger.warn('Initialization already in progress, skipping...');
      return;
    }

    this.isInitializing = true;
    this.logger.log('🚀 Starting auto-initialization check...');

    try {
      // Step 1: Check and create year groups
      const yearGroupCount = await this.prisma.yearGroup.count();
      if (yearGroupCount === 0) {
        this.logger.log('📚 No year groups found, creating...');
        await this.createYearGroups();
      } else {
        this.logger.log(`✅ Found ${yearGroupCount} year groups`);
      }

      // Step 2: Check and create subjects with skills
      const subjectCount = await this.prisma.subject.count();
      if (subjectCount < 50) { // Should have ~120 subjects for all years
        this.logger.log('📖 Creating subjects for all year groups...');
        await this.createSubjectsAndSkills();
      } else {
        this.logger.log(`✅ Found ${subjectCount} subjects`);
      }

      // Step 3: Check and parse curriculum PDFs (PRIORITY: PDFs are the source of truth)
      const topicCount = await this.prisma.curriculumTopic.count();
      if (topicCount < 50) { // Process PDFs if we have fewer than 50 topics
        this.logger.log('📄 Processing curriculum PDFs to generate topics and activities...');
        await this.parseCurriculumPdfs();
        
        // Re-check topic count after PDF processing
        const newTopicCount = await this.prisma.curriculumTopic.count();
        this.logger.log(`✅ Now have ${newTopicCount} curriculum topics from PDFs`);
      } else {
        this.logger.log(`✅ Found ${topicCount} curriculum topics`);
      }

      // Step 4: Generate supercurriculum activities for topics (from PDFs)
      const scActivityCount = await this.prisma.supercurriculumActivity.count();
      const currentTopicCount = await this.prisma.curriculumTopic.count();
      
      // Generate supercurriculum activities if we have topics but few activities
      if (currentTopicCount > 0 && scActivityCount < currentTopicCount * 2) {
        this.logger.log('🌟 Generating supercurriculum activities for all topics...');
        await this.generateSupercurriculumActivities();
        const newScCount = await this.prisma.supercurriculumActivity.count();
        this.logger.log(`✅ Generated ${newScCount} supercurriculum activities`);
      } else {
        this.logger.log(`✅ Found ${scActivityCount} supercurriculum activities`);
      }

      // Step 5: Check and create regular activities (for skills, not topics)
      const activityCount = await this.prisma.activity.count();
      if (activityCount < 50) {
        this.logger.log('🎯 Creating activities for all subjects...');
        await this.createActivities();
      } else {
        this.logger.log(`✅ Found ${activityCount} activities`);
      }

      // Step 6: Create default admin user
      await this.createDefaultUsers();

      // Step 7: Create default feedback tests
      await this.createDefaultFeedbackTests();

      this.logger.log('🎉 Auto-initialization complete!');
    } catch (error) {
      this.logger.error('❌ Auto-initialization failed:', error);
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Create all year groups (Years 5-13)
   * Deactivates any year groups outside this range
   */
  private async createYearGroups() {
    const yearData = [
      { num: 5, name: 'year_5', displayName: 'Year 5' },
      { num: 6, name: 'year_6', displayName: 'Year 6' },
      { num: 7, name: 'year_7', displayName: 'Year 7' },
      { num: 8, name: 'year_8', displayName: 'Year 8' },
      { num: 9, name: 'year_9', displayName: 'Year 9' },
      { num: 10, name: 'year_10', displayName: 'Year 10' },
      { num: 11, name: 'year_11', displayName: 'Year 11' },
      { num: 12, name: 'year_12', displayName: 'Year 12' },
      { num: 13, name: 'year_13', displayName: 'Year 13' },
    ];

    // First, deactivate any year groups that are not Years 5-13
    const validYearNames = yearData.map(y => y.name);
    const allYearGroups = await this.prisma.yearGroup.findMany();
    
    for (const yearGroup of allYearGroups) {
      if (!validYearNames.includes(yearGroup.name)) {
        // Extract year number from name or displayName
        const yearMatch = (yearGroup.displayName || yearGroup.name).match(/\d+/);
        const yearNum = yearMatch ? parseInt(yearMatch[0]) : 0;
        
        // Deactivate if it's not in range 5-13
        if (yearNum < 5 || yearNum > 13) {
          await this.prisma.yearGroup.update({
            where: { id: yearGroup.id },
            data: { isActive: false },
          });
          this.logger.log(`  ✗ Deactivated ${yearGroup.displayName} (outside Years 5-13)`);
        }
      }
    }

    // Create or update Years 5-13, ensuring they are active
    for (const year of yearData) {
      await this.prisma.yearGroup.upsert({
        where: { 
          name_locale: {
            name: year.name,
            locale: 'en-GB',
          },
        },
        update: {
          displayName: year.displayName,
          orderIndex: year.num,
          isActive: true, // Ensure it's active
        },
        create: {
          name: year.name,
          displayName: year.displayName,
          orderIndex: year.num,
          isActive: true,
          locale: 'en-GB',
        },
      });
      this.logger.log(`  ✓ Created/Updated ${year.displayName}`);
    }
  }

  /**
   * Create all subjects with skills for all year groups
   */
  private async createSubjectsAndSkills() {
    const subjectTemplates = [
      {
        name: 'english',
        displayName: 'English',
        description: 'Develop reading, writing, and communication skills',
        whyMatters: 'English skills are fundamental to all learning. They help you express ideas clearly, understand complex texts, and communicate effectively.',
        iconName: 'book',
        colorCode: '#4CAF50',
        orderIndex: 1,
        skills: ['Reading', 'Writing', 'Speaking', 'Listening'],
      },
      {
        name: 'maths',
        displayName: 'Maths',
        description: 'Build problem-solving and logical thinking skills',
        whyMatters: 'Maths teaches you to think logically and solve problems systematically. Essential for everyday life and many careers.',
        iconName: 'calculator',
        colorCode: '#2196F3',
        orderIndex: 2,
        skills: ['Number', 'Algebra', 'Geometry', 'Statistics', 'Problem Solving'],
      },
      {
        name: 'science',
        displayName: 'Science',
        description: 'Explore how the world works through investigation',
        whyMatters: 'Science helps you understand the natural world and how things work. It develops critical thinking and curiosity.',
        iconName: 'flask',
        colorCode: '#9C27B0',
        orderIndex: 3,
        skills: ['Biology', 'Chemistry', 'Physics', 'Investigation'],
      },
      {
        name: 'history',
        displayName: 'History',
        description: 'Learn from the past to understand the present',
        whyMatters: 'History helps you understand how societies develop and why the world is the way it is today.',
        iconName: 'scroll',
        colorCode: '#795548',
        orderIndex: 4,
        skills: ['Chronology', 'Source Analysis', 'Interpretation', 'Writing'],
      },
      {
        name: 'geography',
        displayName: 'Geography',
        description: 'Explore the physical and human world',
        whyMatters: 'Geography helps you understand our planet, from natural processes to human societies.',
        iconName: 'globe',
        colorCode: '#00BCD4',
        orderIndex: 5,
        skills: ['Physical Geography', 'Human Geography', 'Map Skills', 'Fieldwork'],
      },
      {
        name: 'computing',
        displayName: 'Computing',
        description: 'Learn programming and digital literacy',
        whyMatters: 'Computing skills are essential in the modern world. Learn to create technology and solve problems.',
        iconName: 'laptop',
        colorCode: '#607D8B',
        orderIndex: 6,
        skills: ['Programming', 'Algorithms', 'Data', 'Digital Literacy'],
      },
      {
        name: 'art',
        displayName: 'Art & Design',
        description: 'Express creativity and develop artistic skills',
        whyMatters: 'Art develops creativity, self-expression, and visual literacy.',
        iconName: 'palette',
        colorCode: '#FF9800',
        orderIndex: 7,
        skills: ['Drawing', 'Painting', 'Sculpture', 'Digital Art'],
      },
      {
        name: 'music',
        displayName: 'Music',
        description: 'Develop musical skills and appreciation',
        whyMatters: 'Music enhances creativity, discipline, and emotional expression.',
        iconName: 'music',
        colorCode: '#E91E63',
        orderIndex: 8,
        skills: ['Performance', 'Composition', 'Listening', 'Theory'],
      },
      {
        name: 'pe',
        displayName: 'Physical Education',
        description: 'Develop physical fitness and teamwork',
        whyMatters: 'PE promotes physical health, teamwork, and personal development.',
        iconName: 'activity',
        colorCode: '#8BC34A',
        orderIndex: 9,
        skills: ['Fitness', 'Team Sports', 'Individual Sports', 'Health'],
      },
      {
        name: 'dt',
        displayName: 'Design & Technology',
        description: 'Design and create practical solutions',
        whyMatters: 'D&T develops problem-solving, creativity, and practical skills.',
        iconName: 'hammer',
        colorCode: '#FF5722',
        orderIndex: 10,
        skills: ['Design', 'Making', 'Evaluation', 'Materials'],
      },
      {
        name: 'french',
        displayName: 'French',
        description: 'Learn to communicate in French',
        whyMatters: 'Learning French opens doors to new cultures and opportunities.',
        iconName: 'language',
        colorCode: '#3F51B5',
        orderIndex: 11,
        skills: ['Reading', 'Writing', 'Speaking', 'Listening'],
      },
      {
        name: 'spanish',
        displayName: 'Spanish',
        description: 'Learn to communicate in Spanish',
        whyMatters: 'Spanish is spoken by 500+ million people worldwide.',
        iconName: 'language',
        colorCode: '#FFC107',
        orderIndex: 12,
        skills: ['Reading', 'Writing', 'Speaking', 'Listening'],
      },
      {
        name: 're',
        displayName: 'Religious Education',
        description: 'Explore beliefs, values and meanings',
        whyMatters: 'RE develops understanding of different beliefs and cultures.',
        iconName: 'book-open',
        colorCode: '#9E9E9E',
        orderIndex: 13,
        skills: ['Knowledge', 'Analysis', 'Evaluation', 'Expression'],
      },
      {
        name: 'citizenship',
        displayName: 'Citizenship',
        description: 'Understand rights, responsibilities and society',
        whyMatters: 'Citizenship prepares you to be an active, informed member of society.',
        iconName: 'users',
        colorCode: '#673AB7',
        orderIndex: 14,
        skills: ['Politics', 'Law', 'Rights', 'Participation'],
      },
    ];

    const yearGroups = await this.prisma.yearGroup.findMany();

    for (const year of yearGroups) {
      for (const subjectTemplate of subjectTemplates) {
        // Check if subject already exists
        const existing = await this.prisma.subject.findFirst({
          where: { name: subjectTemplate.name, yearGroupId: year.id, locale: 'en-GB' },
        });

        if (!existing) {
          // Create subject with skills
          const subject = await this.prisma.subject.create({
            data: {
              yearGroupId: year.id,
              name: subjectTemplate.name,
              displayName: subjectTemplate.displayName,
              description: subjectTemplate.description,
              whyMatters: subjectTemplate.whyMatters,
              iconName: subjectTemplate.iconName,
              colorCode: subjectTemplate.colorCode,
              orderIndex: subjectTemplate.orderIndex,
              isActive: true,
            },
          });

          // Create skills for this subject
          for (let i = 0; i < subjectTemplate.skills.length; i++) {
            await this.prisma.skill.create({
              data: {
                subjectId: subject.id,
                name: subjectTemplate.skills[i].toLowerCase().replace(/\s+/g, '_'),
                displayName: subjectTemplate.skills[i],
                description: `${subjectTemplate.skills[i]} skills in ${subjectTemplate.displayName}`,
                orderIndex: i + 1,
              },
            });
          }
        }
      }
      this.logger.log(`  ✓ Processed subjects for ${year.displayName}`);
    }
  }

  /**
   * Parse curriculum PDFs and import content
   */
  private async parseCurriculumPdfs() {
    try {
      this.logger.log('  📄 Starting PDF parsing...');
      const result = await this.pdfParser.processExistingPdfs(true); // true = generate activities
      this.logger.log(`  ✓ Processed ${result.processed.length} PDFs`);
      this.logger.log(`    - Topics created: ${result.results.topics.created}`);
      this.logger.log(`    - Activities: ${result.results.activities?.generated || 0} generated`);
      this.logger.log(`    - Supercurriculum: ${result.results.supercurriculumActivities?.generated || 0} generated`);
    } catch (error) {
      this.logger.error('  ❌ PDF parsing failed:', error.message);
    }
  }

  /**
   * Create activities for subjects that don't have enough
   */
  private async createActivities() {
    const subjects = await this.prisma.subject.findMany({
      include: { skills: true, yearGroup: true },
    });

    for (const subject of subjects) {
      const activityCount = await this.prisma.activity.count({
        where: { subjectId: subject.id },
      });

      if (activityCount < 5 && subject.skills.length > 0) {
        // Generate activities using AI
        try {
          const result = await this.autoExerciseGenerator.generateActivitiesForSubjects(
            [subject.id],
            { difficulties: [Band.DEVELOPING, Band.SECURE] },
          );
          if (result.generated > 0) {
            this.logger.log(`  ✓ Generated ${result.generated} activities for ${subject.displayName} (${subject.yearGroup.displayName})`);
          }
        } catch (error) {
          // If AI fails, create basic activities manually
          await this.createBasicActivitiesForSubject(subject);
        }
      }
    }
  }

  /**
   * Create basic activities without AI (fallback)
   */
  private async createBasicActivitiesForSubject(subject: any) {
    const activities = [
      {
        title: `${subject.displayName} Practice - Foundation`,
        description: `Build your foundation in ${subject.displayName}`,
        instructions: `Complete the exercises to improve your ${subject.displayName} skills. Take your time and check your answers.`,
        difficulty: Band.DEVELOPING,
        activityType: ActivityType.SCAFFOLDED_EXERCISE,
      },
      {
        title: `${subject.displayName} Challenge`,
        description: `Challenge yourself with ${subject.displayName}`,
        instructions: `Apply your knowledge to solve these challenges. Think carefully about each problem.`,
        difficulty: Band.SECURE,
        activityType: ActivityType.SCAFFOLDED_EXERCISE,
      },
    ];

    for (const activity of activities) {
      await this.prisma.activity.create({
        data: {
          subjectId: subject.id,
          skillId: subject.skills[0]?.id,
          title: activity.title,
          description: activity.description,
          instructions: activity.instructions,
          activityType: activity.activityType,
          difficulty: activity.difficulty,
          estimatedMinutes: 15,
          isActive: true,
        },
      });
    }
  }

  /**
   * Generate supercurriculum activities for topics
   * Generates activities for ALL topics that don't have activities yet
   */
  private async generateSupercurriculumActivities() {
    try {
      // Get all topics that need activities
      const topicsWithoutActivities = await this.prisma.curriculumTopic.findMany({
        where: {
          supercurriculumActivities: {
            none: {}, // Topics with no activities
          },
        },
        take: 100, // Process in batches
      });

      if (topicsWithoutActivities.length === 0) {
        this.logger.log('  ✓ All topics already have supercurriculum activities');
        return;
      }

      this.logger.log(`  📝 Generating activities for ${topicsWithoutActivities.length} topics...`);
      
      const result = await this.autoExerciseGenerator.generateSupercurriculumActivitiesForTopics(
        topicsWithoutActivities.map(t => t.id)
      );
      
      this.logger.log(`  ✓ Generated ${result.generated} supercurriculum activities`);
      if (result.errors.length > 0) {
        this.logger.warn(`  ⚠️  ${result.errors.length} errors during generation`);
      }
    } catch (error) {
      this.logger.error('  ❌ Supercurriculum activity generation failed:', error.message);
    }
  }

  /**
   * Create default admin user
   */
  private async createDefaultUsers() {
    const hashedPassword = await bcrypt.hash('Demo1234', 10);

    // Admin user
    const adminExists = await this.prisma.user.findUnique({
      where: { email: 'admin@supercurriculum.org' },
    });

    if (!adminExists) {
      await this.prisma.user.create({
        data: {
          email: 'admin@supercurriculum.org',
          password: hashedPassword,
          firstName: 'Admin',
          lastName: 'User',
          role: 'ADMIN',
          isActive: true,
        },
      });
      this.logger.log('  ✓ Created default admin user');
    }

    // Teacher user
    const teacherExists = await this.prisma.user.findUnique({
      where: { email: 'teacher@supercurriculum.org' },
    });

    if (!teacherExists) {
      await this.prisma.user.create({
        data: {
          email: 'teacher@supercurriculum.org',
          password: hashedPassword,
          firstName: 'Demo',
          lastName: 'Teacher',
          role: 'TEACHER',
          isActive: true,
        },
      });
      this.logger.log('  ✓ Created default teacher user');
    }
  }

  /**
   * Create default feedback tests for all subjects
   */
  private async createDefaultFeedbackTests() {
    const subjects = await this.prisma.subject.findMany({
      include: { skills: true },
    });

    for (const subject of subjects) {
      // Check if feedback tests exist for this subject
      const testCount = await this.prisma.feedbackTest.count({
        where: { subjectId: subject.id },
      });

      if (testCount === 0 && subject.skills.length > 0) {
        // Create a feedback test for each skill
        for (const skill of subject.skills) {
          try {
            await this.prisma.feedbackTest.create({
              data: {
                subjectId: subject.id,
                skillId: skill.id,
                title: `${skill.displayName} Self-Assessment`,
                description: `Rate your confidence in ${skill.displayName} skills`,
                isActive: true,
                questions: {
                  create: [
                    { statement: `I understand the basic concepts of ${skill.displayName}`, orderIndex: 0 },
                    { statement: `I can apply ${skill.displayName} skills to simple problems`, orderIndex: 1 },
                    { statement: `I can tackle challenging ${skill.displayName} tasks`, orderIndex: 2 },
                    { statement: `I can explain ${skill.displayName} concepts to others`, orderIndex: 3 },
                  ],
                },
              },
            });
          } catch (error) {
            // Skip if already exists
          }
        }
      }
    }
    this.logger.log('  ✓ Created default feedback tests');
  }

  /**
   * Force re-initialization (can be called via API if needed)
   */
  async forceReInitialize() {
    this.logger.log('🔄 Forcing re-initialization...');
    this.isInitializing = false;
    await this.initializeInBackground();
  }
}
