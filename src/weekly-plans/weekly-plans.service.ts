import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AutoExerciseGeneratorService } from '../activity-generation/auto-exercise-generator.service';
import { Band, PlanStatus } from '@prisma/client';

@Injectable()
export class WeeklyPlansService {
  private readonly logger = new Logger(WeeklyPlansService.name);

  constructor(
    private prisma: PrismaService,
    private autoExerciseGenerator: AutoExerciseGeneratorService,
  ) {}

  /** Subject rows for English curriculum (includes legacy null locale). */
  private subjectLocaleWhere(_locale: string | null | undefined) {
    return { OR: [{ locale: 'en-GB' }, { locale: null }] };
  }

  /**
   * Generate weekly plan for a student
   * 
   * Algorithm:
   * 1. Get student's bands for selected subjects (or all if none selected)
   * 2. Filter bands by selected subjects if provided
   * 3. Generate dynamic activities based on test results
   * 4. Distribute activities across 7 days
   * 5. Respect student's daily available minutes
   * 6. Balance across subjects
   * 7. Create PlannedTask records
   * 
   * @param selectedSubjectIds - Optional array of subject IDs to focus on (e.g., only Math, Physics, Chemistry)
   */
  async generateWeeklyPlan(userId: string, forceRegenerate: boolean = false, selectedSubjectIds?: string[]) {
    // Get student profile with year group (for locale)
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: { yearGroup: true },
    });

    if (!profile) {
      throw new NotFoundException('Student profile not found');
    }

    const effectiveLocale = (profile.yearGroup as { locale?: string | null } | null)?.locale ?? 'en-GB';

    // Get ALL available subjects for this year group and locale (for logging and selection)
    const allAvailableSubjects = await this.prisma.subject.findMany({
      where: {
        yearGroupId: profile.yearGroupId,
        isActive: true,
        ...this.subjectLocaleWhere(effectiveLocale),
      },
      select: {
        id: true,
        displayName: true,
        name: true,
      },
      orderBy: { orderIndex: 'asc' },
    });
    this.logger.log(`📚 Available subjects for Year Group ${profile.yearGroupId}: ${allAvailableSubjects.map(s => s.displayName).join(', ')}`);

    // Get student's current bands
    let studentBands = await this.prisma.studentBand.findMany({
      where: { userId },
      include: {
        subject: true,
        skill: true,
      },
    });

    // Log current bands by subject
    const bandsBySubject = new Map<string, number>();
    for (const band of studentBands) {
      const count = bandsBySubject.get(band.subject.displayName) || 0;
      bandsBySubject.set(band.subject.displayName, count + 1);
    }
    this.logger.log(`📊 Current student bands: ${Array.from(bandsBySubject.entries()).map(([subject, count]) => `${subject} (${count} skills)`).join(', ')}`);

    // If subject selection provided, filter bands to only selected subjects
    if (selectedSubjectIds && selectedSubjectIds.length > 0) {
      const selectedSubjectNames = allAvailableSubjects
        .filter(s => selectedSubjectIds.includes(s.id))
        .map(s => s.displayName);
      this.logger.log(`🎯 Filtering bands to selected subjects: ${selectedSubjectNames.join(', ')}`);
      studentBands = studentBands.filter(band => selectedSubjectIds.includes(band.subjectId));
      
      // If no bands exist for selected subjects, create them
      if (studentBands.length === 0) {
        this.logger.log('⚠️ No bands exist for selected subjects, creating them...');
        await this.createBandsForSubjects(userId, profile.yearGroupId, selectedSubjectIds, effectiveLocale);
        
        // Fetch the newly created bands
        studentBands = await this.prisma.studentBand.findMany({
          where: { 
            userId,
            subjectId: { in: selectedSubjectIds },
          },
          include: {
            subject: true,
            skill: true,
          },
        });
        this.logger.log(`✅ Created ${studentBands.length} bands for selected subjects`);
      }
    } else {
      // If no bands exist, create default bands for ALL subjects in the student's year group (for this locale)
      if (studentBands.length === 0) {
        this.logger.log(`⚠️ No bands exist, creating default bands for ALL ${allAvailableSubjects.length} subjects...`);
        await this.createDefaultBands(userId, profile.yearGroupId, effectiveLocale);
        
        // Fetch the newly created bands
        studentBands = await this.prisma.studentBand.findMany({
          where: { userId },
          include: {
            subject: true,
            skill: true,
          },
        });
        this.logger.log(`✅ Created ${studentBands.length} bands for all subjects`);
      }
    }

    // Log final bands that will be used for generation
    const finalBandsBySubject = new Map<string, number>();
    for (const band of studentBands) {
      const count = finalBandsBySubject.get(band.subject.displayName) || 0;
      finalBandsBySubject.set(band.subject.displayName, count + 1);
    }
    this.logger.log(`🎯 Using bands for generation: ${Array.from(finalBandsBySubject.entries()).map(([subject, count]) => `${subject} (${count} skills)`).join(', ')}`);

    // If still no bands exist after creation attempt, it means no subjects/skills exist for this year group (for this locale)
    if (studentBands.length === 0) {
      const subjectLocaleFilter = this.subjectLocaleWhere(effectiveLocale);
      const subjectCount = await this.prisma.subject.count({
        where: {
          yearGroupId: profile.yearGroupId,
          isActive: true,
          ...subjectLocaleFilter,
        },
      });

      const skillCount = await this.prisma.skill.count({
        where: {
          subject: {
            yearGroupId: profile.yearGroupId,
            isActive: true,
            ...subjectLocaleFilter,
          },
        },
      });

      this.logger.warn(
        `⚠️ No student bands available for user ${userId} in year group ${profile.yearGroupId}. ` +
        `Found ${subjectCount} subjects and ${skillCount} skills for this year group. ` +
        `This means no subjects/skills are configured yet. ` +
        `To fix: Upload Year PDFs using POST /activities/generate-from-pdf endpoint (e.g., year5.pdf, year6.pdf, etc.) ` +
        `to automatically create subjects, skills, and activities from the curriculum. Creating empty plan.`
      );
      
      // Create an empty plan - activities can be added later when subjects/skills are configured
      const weekStart = this.getMonday(new Date());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      
      const emptyPlan = await this.prisma.weeklyPlan.upsert({
        where: {
          userId_weekStart: {
            userId,
            weekStart,
          },
        },
        update: {
          status: PlanStatus.ACTIVE,
        },
        create: {
          userId,
          weekStart,
          weekEnd,
          status: PlanStatus.ACTIVE,
        },
      });
      
      return this.getActivePlan(userId);
    }

    // Get week boundaries (Monday to Sunday)
    const weekStart = this.getMonday(new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // Check if there's already a plan for this week (active or archived)
    const existingWeekPlan = await this.prisma.weeklyPlan.findFirst({
      where: {
        userId,
        weekStart,
      },
    });

    if (existingWeekPlan) {
      // Check if the plan has any tasks
      const taskCount = await this.prisma.plannedTask.count({
        where: { planId: existingWeekPlan.id },
      });

      // If plan has tasks and NOT forcing regeneration, return existing
      if (taskCount > 0 && !forceRegenerate) {
        if (existingWeekPlan.status !== PlanStatus.ACTIVE) {
          await this.prisma.weeklyPlan.update({
            where: { id: existingWeekPlan.id },
            data: { status: PlanStatus.ACTIVE },
          });
        }
        return this.getActivePlan(userId);
      }

      // Force regenerate OR plan has no tasks - delete old plan and tasks
      this.logger.log(`Regenerating plan ${existingWeekPlan.id} (force=${forceRegenerate}, tasks=${taskCount})`);
      
      // Get activity IDs from old plan before deleting
      const oldTasks = await this.prisma.plannedTask.findMany({
        where: { planId: existingWeekPlan.id },
        select: { activityId: true },
      });
      const oldActivityIds = oldTasks.map(t => t.activityId);
      
      // Delete tasks first (foreign key constraint)
      await this.prisma.plannedTask.deleteMany({
        where: { planId: existingWeekPlan.id },
      });
      
      // Delete the plan
      await this.prisma.weeklyPlan.delete({
        where: { id: existingWeekPlan.id },
      });
      
      // Note: Activities are now generated on-the-fly, so we don't need to mark them inactive
      // Old activityIds might be null since we're using activityData now
    }

    // Archive any other active plans
    await this.prisma.weeklyPlan.updateMany({
      where: {
        userId,
        status: PlanStatus.ACTIVE,
      },
      data: { status: PlanStatus.ARCHIVED },
    });

    // Create weekly plan
    const weeklyPlan = await this.prisma.weeklyPlan.create({
      data: {
        userId,
        weekStart,
        weekEnd,
        status: PlanStatus.ACTIVE,
      },
    });

    // Get personality and diagnostic test results for personalization
    const personalityTest = await this.prisma.personalityTest.findFirst({
      where: { userId, status: 'COMPLETED' },
    });

    const diagnosticTest = await this.prisma.diagnosticOnboardingTest.findFirst({
      where: { userId, status: 'COMPLETED' },
    });
    
    // Get student's task completion history to inform activity generation
    // Note: activityId might be null for on-the-fly generated activities, so we use left join
    const completedTasks = await this.prisma.plannedTask.findMany({
      where: {
        plan: { userId },
        status: 'COMPLETED',
      },
      include: {
        activity: {
          include: { subject: true, skill: true },
        },
      },
      orderBy: { completedAt: 'desc' },
      take: 20, // Last 20 completed tasks
    }).catch(error => {
      this.logger.warn('Error fetching completed tasks, continuing without completion stats:', error);
      return []; // Return empty array if query fails
    });
    
    // Calculate completion rates by subject and skill
    const completionStats: Record<string, Record<string, { completed: number; total: number }>> = {};
    for (const task of completedTasks) {
      // Handle both stored activities (activityId) and on-the-fly generated (activityData)
      const subjectId = task.activity?.subjectId || (task.activityData as any)?.subjectId;
      const skillId = task.activity?.skillId || (task.activityData as any)?.skillId;
      if (subjectId && skillId) {
        if (!completionStats[subjectId]) completionStats[subjectId] = {};
        if (!completionStats[subjectId][skillId]) completionStats[subjectId][skillId] = { completed: 0, total: 0 };
        completionStats[subjectId][skillId].completed++;
      }
    }

    // Calculate how many activities we need
    const tasksPerDay = Math.floor(profile.dailyMinutes / 15);
    const totalTasksNeeded = tasksPerDay * 7;

    // Use selected subjects if provided, otherwise use preferred subjects from profile
    const subjectsToUse = selectedSubjectIds && selectedSubjectIds.length > 0 
      ? selectedSubjectIds 
      : (profile.preferredSubjects && profile.preferredSubjects.length > 0 
          ? profile.preferredSubjects 
          : undefined);

    // Log subject selection
    if (subjectsToUse && subjectsToUse.length > 0) {
      const subjectNames = allAvailableSubjects
        .filter(s => subjectsToUse.includes(s.id))
        .map(s => s.displayName);
      this.logger.log(`📝 Using preferred/selected subjects: ${subjectNames.join(', ')}`);
    } else {
      this.logger.log(`📝 No subject preference - will use ALL subjects from bands (${finalBandsBySubject.size} subjects)`);
    }

    // Generate activities DYNAMICALLY - each time creates NEW, UNIQUE problems
    // Add random seed to ensure uniqueness even when regenerating
    const randomSeed = Math.random().toString(36).substring(2, 15) + Date.now();
    this.logger.log(`🚀 Generating ${totalTasksNeeded} dynamic activities for weekly plan (seed: ${randomSeed})...`);
    
    let activities = [];
    try {
      this.logger.log(`Calling generateDynamicActivitiesForWeeklyPlan with ${studentBands.length} bands, ${totalTasksNeeded} activities needed`);
      
      activities = await this.autoExerciseGenerator.generateDynamicActivitiesForWeeklyPlan({
        studentBands,
        yearGroupId: profile.yearGroupId,
        locale: effectiveLocale,
        studentInterests: profile.interests || [],
        preferredSubjects: subjectsToUse || [],
        personalityTestResults: personalityTest?.results || null,
        diagnosticTestResults: diagnosticTest?.results || null,
        taskCompletionStats: completionStats, // Add task completion history
        count: totalTasksNeeded,
        randomSeed, // Add random seed for uniqueness
      });

      this.logger.log(`✅ Generated ${activities.length} unique activities for ${studentBands.length} student bands`);
    } catch (error) {
      this.logger.error('❌ Error generating activities:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      });
      
      // Provide more helpful error messages
      let errorMessage = 'Failed to generate activities. ';
      if (error?.message?.includes('OpenAI') || error?.message?.includes('API key')) {
        errorMessage += 'Please ensure OpenAI API key is configured. ';
      }
      if (error?.message?.includes('test') || error?.message?.includes('onboarding')) {
        errorMessage += 'Please ensure you have completed the mandatory onboarding tests (Personality + Diagnostic). ';
      }
      errorMessage += error?.message || 'Unknown error occurred.';
      
      throw new BadRequestException(errorMessage);
    }
    
    // Filter out any null/invalid activities
    const validActivities = activities.filter(activity => activity && activity.title);
    
    // Log activity distribution by subject BEFORE filtering
    if (activities.length > 0) {
      const activitiesBySubjectBefore = new Map<string, number>();
      for (const activity of activities) {
        if (activity && activity.title) {
          const subjectName = activity.subject?.displayName || 'Unknown';
          const count = activitiesBySubjectBefore.get(subjectName) || 0;
          activitiesBySubjectBefore.set(subjectName, count + 1);
        }
      }
      this.logger.log(`📊 Generated activities by subject (before filtering): ${Array.from(activitiesBySubjectBefore.entries()).map(([subject, count]) => `${subject} (${count})`).join(', ')}`);
    }
    
    if (validActivities.length === 0) {
      throw new BadRequestException(
        'No valid activities could be generated. Please ensure you have completed the mandatory onboarding tests (Personality + Diagnostic) and that OpenAI API is configured.'
      );
    }
    
    if (validActivities.length < activities.length) {
      this.logger.warn(`⚠️ Filtered out ${activities.length - validActivities.length} invalid activities`);
    }
    
    // Log final activity distribution by subject (after filtering)
    const finalActivitiesBySubject = new Map<string, number>();
    for (const activity of validActivities) {
      const subjectName = activity.subject?.displayName || 'Unknown';
      const count = finalActivitiesBySubject.get(subjectName) || 0;
      finalActivitiesBySubject.set(subjectName, count + 1);
    }
    this.logger.log(`✅ Final ${validActivities.length} activities distributed as: ${Array.from(finalActivitiesBySubject.entries()).map(([subject, count]) => `${subject} (${count})`).join(', ')}`);

    // Distribute activities across the week
    // Activities are generated on-the-fly, so we store activityData directly in PlannedTask
    const plannedTasks = this.distributeActivitiesAcrossWeek(
      validActivities,
      weekStart,
      weeklyPlan.id,
      profile.dailyMinutes,
    );

    // Create planned tasks with activity data stored directly (not in Activity table)
    this.logger.log(`Creating ${plannedTasks.length} planned tasks for weekly plan ${weeklyPlan.id}`);
    
    if (plannedTasks.length > 0) {
      await this.prisma.plannedTask.createMany({
        data: plannedTasks,
      });
    } else {
      this.logger.warn('No tasks to create for weekly plan - no activities available');
    }

    // Return the complete plan
    return this.getActivePlan(userId);
  }

  /**
   * Select activities based on student bands
   * If no activities exist, AI will automatically generate them
   */
  private async selectActivitiesForBands(
    studentBands: any[],
    dailyMinutes: number,
    yearGroupId: string,
  ) {
    const activities = [];
    const tasksPerDay = Math.floor(dailyMinutes / 15); // Assume 15-30 min per task
    const totalTasksNeeded = tasksPerDay * 7;
    const tasksPerBand = Math.ceil(totalTasksNeeded / Math.max(1, studentBands.length));

    for (const band of studentBands) {
      // Get activities matching this band's difficulty
      let bandActivities = await this.prisma.activity.findMany({
        where: {
          subjectId: band.subjectId,
          skillId: band.skillId,
          difficulty: band.currentBand,
          isActive: true,
          // Exclude recently completed activities
          NOT: {
            submissions: {
              some: {
                userId: band.userId,
                submittedAt: {
                  gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
                },
              },
            },
          },
        },
        include: {
          subject: true,
          skill: true,
        },
        take: tasksPerBand,
        orderBy: {
          createdAt: 'desc', // Prefer newer activities
        },
      });

      // If no activities found for this band, try to get any activity for this subject/skill
      if (bandActivities.length === 0) {
        bandActivities = await this.prisma.activity.findMany({
          where: {
            subjectId: band.subjectId,
            skillId: band.skillId,
            isActive: true,
          },
          include: {
            subject: true,
            skill: true,
          },
          take: tasksPerBand,
        });
      }

      activities.push(...bandActivities);
    }

    // If we still don't have enough activities, try to auto-generate them
    if (activities.length < totalTasksNeeded) {
      this.logger.log(`Only found ${activities.length} activities, need ${totalTasksNeeded}. Checking for AI generation...`);
      
      // Get unique subject IDs from bands
      const subjectIds = [...new Set(studentBands.map(b => b.subjectId))];
      
      // Try to ensure activities exist (this may generate new ones via AI)
      try {
        const generatedActivities = await this.autoExerciseGenerator.ensureActivitiesExistForSubjects(
          yearGroupId,
          subjectIds,
        );
        
        if (generatedActivities.length > 0) {
          this.logger.log(`AI generated ${generatedActivities.length} new activities`);
          activities.push(...generatedActivities);
        }
      } catch (error) {
        this.logger.warn('Could not auto-generate activities:', error);
      }
    }

    // If we still don't have enough activities, get some general ones from the year group
    if (activities.length < totalTasksNeeded) {
      const additionalActivities = await this.prisma.activity.findMany({
        where: {
          isActive: true,
          id: {
            notIn: activities.map(a => a.id),
          },
          subject: {
            yearGroupId: yearGroupId,
          },
        },
        include: {
          subject: true,
          skill: true,
        },
        take: totalTasksNeeded - activities.length,
        orderBy: {
          createdAt: 'desc',
        },
      });
      activities.push(...additionalActivities);
    }

    return activities;
  }

  /**
   * Quick activity selection - uses only existing activities, no AI generation wait
   * This ensures fast response times for weekly plan generation
   * Ensures variety: no duplicate activities, balanced across subjects
   * Prioritizes subjects matching student interests
   */
  private async selectActivitiesForBandsQuick(
    studentBands: any[],
    dailyMinutes: number,
    yearGroupId: string,
    interests: string[] = [],
    preferredSubjects: string[] = [],
  ) {
    const tasksPerDay = Math.floor(dailyMinutes / 15);
    const totalTasksNeeded = tasksPerDay * 7;
    
    // Track selected activity IDs to avoid duplicates
    const selectedIds = new Set<string>();
    const selectedActivities: any[] = [];

    // Get unique subject IDs from bands
    const subjectIds = [...new Set(studentBands.map(b => b.subjectId))];
    
    // Get ALL available activities for these subjects (we'll pick unique ones)
    const allActivities = await this.prisma.activity.findMany({
      where: {
        isActive: true,
        subject: {
          yearGroupId: yearGroupId,
        },
      },
      include: {
        subject: true,
        skill: true,
      },
      orderBy: [
        { subjectId: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    this.logger.log(`Found ${allActivities.length} total activities for year group`);

    // Group activities by subject for balanced selection
    const activitiesBySubject: Record<string, any[]> = {};
    for (const activity of allActivities) {
      if (!activitiesBySubject[activity.subjectId]) {
        activitiesBySubject[activity.subjectId] = [];
      }
      activitiesBySubject[activity.subjectId].push(activity);
    }

    // Sort subjects: preferred subjects first, then by interest keywords match
    const interestKeywords = interests.map(i => i.toLowerCase());
    const subjects = Object.keys(activitiesBySubject).sort((a, b) => {
      // Preferred subjects come first
      const aPreferred = preferredSubjects.includes(a) ? -1 : 0;
      const bPreferred = preferredSubjects.includes(b) ? -1 : 0;
      if (aPreferred !== bPreferred) return aPreferred - bPreferred;
      
      // Then sort by interest keyword match
      const subjectA = activitiesBySubject[a][0]?.subject?.displayName?.toLowerCase() || '';
      const subjectB = activitiesBySubject[b][0]?.subject?.displayName?.toLowerCase() || '';
      const aMatch = interestKeywords.some(kw => subjectA.includes(kw)) ? -1 : 0;
      const bMatch = interestKeywords.some(kw => subjectB.includes(kw)) ? -1 : 0;
      return aMatch - bMatch;
    });
    
    this.logger.log(`Activities spread across ${subjects.length} subjects`);
    if (interests.length > 0) {
      this.logger.log(`Student interests: ${interests.join(', ')}`);
    }

    // Round-robin selection across subjects for variety
    let subjectIndex = 0;
    const subjectActivityIndex: Record<string, number> = {};
    subjects.forEach(s => subjectActivityIndex[s] = 0);

    while (selectedActivities.length < totalTasksNeeded && subjects.length > 0) {
      const currentSubject = subjects[subjectIndex % subjects.length];
      const subjectActivities = activitiesBySubject[currentSubject];
      const activityIdx = subjectActivityIndex[currentSubject];

      if (activityIdx < subjectActivities.length) {
        const activity = subjectActivities[activityIdx];
        
        // Only add if not already selected (avoid duplicates)
        if (!selectedIds.has(activity.id)) {
          selectedIds.add(activity.id);
          selectedActivities.push(activity);
        }
        
        subjectActivityIndex[currentSubject]++;
      }

      subjectIndex++;

      // Check if we've exhausted all activities
      const allExhausted = subjects.every(s => 
        subjectActivityIndex[s] >= activitiesBySubject[s].length
      );
      if (allExhausted) {
        this.logger.warn(`Only ${selectedActivities.length} unique activities available, need ${totalTasksNeeded}`);
        break;
      }
    }

    this.logger.log(`Selected ${selectedActivities.length} unique activities for weekly plan`);
    return selectedActivities;
  }

  /**
   * Distribute activities across the week
   * Activities are generated on-the-fly, so we store activityData directly
   */
  private distributeActivitiesAcrossWeek(
    activities: any[],
    weekStart: Date,
    planId: string,
    dailyMinutes: number,
  ) {
    const plannedTasks = [];
    const tasksPerDay = Math.max(2, Math.floor(dailyMinutes / 20)); // 2-3 tasks per day
    
    // Group activities by subject to ensure variety
    const activityGroups = this.groupBySubject(activities);
    const flatActivities = this.interleaveActivities(activityGroups);

    let activityIndex = 0;
    
    // Distribute across 7 days
    for (let day = 0; day < 7; day++) {
      const scheduledFor = new Date(weekStart);
      scheduledFor.setDate(scheduledFor.getDate() + day);

      // Add tasks for this day
      for (let taskOrder = 0; taskOrder < tasksPerDay && activityIndex < flatActivities.length; taskOrder++) {
        const activity = flatActivities[activityIndex];
        
        // Validate activity has required fields
        if (!activity || !activity.title) {
          this.logger.warn(`Skipping invalid activity at index ${activityIndex}`);
          activityIndex++;
          continue;
        }
        
        // Store activity data directly (not in Activity table)
        plannedTasks.push({
          planId,
          activityId: null, // No Activity record - generated on-the-fly
          activityData: activity, // Store full activity data as JSON
          scheduledFor,
          orderIndex: taskOrder,
          status: 'PENDING',
        });
        activityIndex++;
      }
    }

    return plannedTasks;
  }

  /**
   * Group activities by subject
   */
  private groupBySubject(activities: any[]) {
    return activities.reduce((groups, activity) => {
      // Handle both Activity objects (with id) and activity data objects (with subjectId)
      const subjectId = activity.subjectId || activity.subject?.id;
      if (!groups[subjectId]) {
        groups[subjectId] = [];
      }
      groups[subjectId].push(activity);
      return groups;
    }, {} as Record<string, any[]>);
  }

  /**
   * Interleave activities from different subjects for variety
   */
  private interleaveActivities(groups: Record<string, any[]>) {
    const result = [];
    const subjects = Object.keys(groups);
    let hasMore = true;
    let index = 0;

    while (hasMore) {
      hasMore = false;
      for (const subject of subjects) {
        if (groups[subject][index]) {
          result.push(groups[subject][index]);
          hasMore = true;
        }
      }
      index++;
    }

    return result;
  }

  /**
   * Create bands for specific subjects (only for subjects matching the year group locale)
   */
  private async createBandsForSubjects(userId: string, yearGroupId: string, subjectIds: string[], locale?: string | null) {
    const localeWhere = locale != null ? this.subjectLocaleWhere(locale) : {};
    const subjects = await this.prisma.subject.findMany({
      where: {
        id: { in: subjectIds },
        yearGroupId,
        isActive: true,
        ...localeWhere,
      },
      include: {
        skills: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    const bandsToCreate = [];
    for (const subject of subjects) {
      if (subject.skills) {
        for (const skill of subject.skills) {
          bandsToCreate.push({
            userId,
            subjectId: subject.id,
            skillId: skill.id,
            currentBand: Band.DEVELOPING,
            lastUpdated: new Date(),
          });
        }
      }
    }

    if (bandsToCreate.length > 0) {
      await this.prisma.studentBand.createMany({
        data: bandsToCreate,
        skipDuplicates: true,
      });
      this.logger.log(`Created ${bandsToCreate.length} bands for ${subjects.length} selected subjects`);
    }
  }

  /**
   * Create default bands for a student (when no assessments have been completed)
   * After profile completion, ALL subjects for the student's year group and locale are unlocked
   */
  private async createDefaultBands(userId: string, yearGroupId: string, locale?: string | null) {
    const localeWhere = locale != null ? this.subjectLocaleWhere(locale) : {};
    // Get ALL subjects and ALL skills for this year group and locale (no limits)
    const subjects = await this.prisma.subject.findMany({
      where: {
        yearGroupId,
        isActive: true,
        ...localeWhere,
      },
      include: {
        skills: {
          orderBy: { orderIndex: 'asc' },
        },
      },
      orderBy: { orderIndex: 'asc' },
    });

    // Create DEVELOPING bands for each subject/skill combination
    const bandsToCreate = [];
    for (const subject of subjects) {
      if (subject.skills) {
        for (const skill of subject.skills) {
          bandsToCreate.push({
            userId,
            subjectId: subject.id,
            skillId: skill.id,
            currentBand: Band.DEVELOPING, // Start with DEVELOPING as default
            lastUpdated: new Date(),
          });
        }
      }
    }

    if (bandsToCreate.length > 0) {
      await this.prisma.studentBand.createMany({
        data: bandsToCreate,
        skipDuplicates: true,
      });
    }
  }

  /**
   * Get Monday of current week
   */
  private getMonday(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  /**
   * Get current active plan for student
   * Handles both stored activities (activityId) and on-the-fly generated activities (activityData)
   */
  async getActivePlan(userId: string) {
    const plan = await this.prisma.weeklyPlan.findFirst({
      where: {
        userId,
        status: PlanStatus.ACTIVE,
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
          orderBy: [{ scheduledFor: 'asc' }, { orderIndex: 'asc' }],
        },
      },
    });

    if (!plan) {
      return null;
    }

    // Transform tasks to use activityData if available (on-the-fly generated)
    const transformedTasks = plan.tasks
      .filter(task => {
        // Filter out tasks with no activity data (shouldn't happen, but safety check)
        return task.activityData || task.activity;
      })
      .map(task => {
        if (task.activityData) {
          // Use activityData (generated on-the-fly)
          const activityData = task.activityData as any;
          if (!activityData || !activityData.title) {
            this.logger.warn(`Task ${task.id} has invalid activityData, skipping`);
            return null;
          }
          return {
            ...task,
            activity: {
              id: `generated-${task.id}`,
              title: activityData.title || 'Untitled Activity',
              description: activityData.description,
              instructions: activityData.instructions,
              resources: activityData.resources,
              content: activityData.content,
              activityType: activityData.activityType,
              difficulty: activityData.difficulty,
              estimatedMinutes: activityData.estimatedMinutes || 15,
              subject: activityData.subject || { id: activityData.subjectId, displayName: 'Unknown' },
              skill: activityData.skill || { id: activityData.skillId, displayName: 'Unknown' },
            },
          };
        }
        // Use stored activity (backward compatibility)
        if (!task.activity) {
          this.logger.warn(`Task ${task.id} has no activity or activityData, skipping`);
          return null;
        }
        // Ensure activity has required fields
        if (!task.activity.title) {
          this.logger.warn(`Task ${task.id} activity has no title, skipping`);
          return null;
        }
        return task;
      })
      .filter(task => task !== null) as any[]; // Remove any null tasks

    // Group tasks by day
    const tasksByDay = transformedTasks.reduce((days, task) => {
      const dayKey = task.scheduledFor.toISOString().split('T')[0];
      if (!days[dayKey]) {
        days[dayKey] = [];
      }
      days[dayKey].push(task);
      return days;
    }, {} as Record<string, any[]>);

    return {
      ...plan,
      tasks: transformedTasks,
      tasksByDay,
    };
  }

  /**
   * Get plan by ID
   */
  async getPlanById(planId: string, userId: string) {
    const plan = await this.prisma.weeklyPlan.findFirst({
      where: {
        id: planId,
        userId, // Ensure student can only access their own plans
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
          orderBy: [{ scheduledFor: 'asc' }, { orderIndex: 'asc' }],
        },
      },
    });

    if (!plan) {
      throw new NotFoundException('Weekly plan not found');
    }

    return plan;
  }

  /**
   * Complete a weekly plan
   */
  async completePlan(planId: string, userId: string) {
    const plan = await this.getPlanById(planId, userId);

    return this.prisma.weeklyPlan.update({
      where: { id: planId },
      data: { status: PlanStatus.COMPLETED },
    });
  }

  /**
   * Get available subjects for a student to choose from
   * Returns all subjects from the student's year group matching the English UK catalogue (en-GB / null locale rows).
   */
  async getAvailableSubjects(userId: string) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: { yearGroup: true },
    });

    if (!profile) {
      throw new NotFoundException('Student profile not found');
    }

    const effectiveLocale = (profile.yearGroup as { locale?: string | null } | null)?.locale ?? 'en-GB';

    // Get all active subjects for the student's year group and locale
    const subjects = await this.prisma.subject.findMany({
      where: {
        yearGroupId: profile.yearGroupId,
        isActive: true,
        ...this.subjectLocaleWhere(effectiveLocale),
      },
      include: {
        skills: {
          orderBy: { orderIndex: 'asc' },
        },
      },
      orderBy: { orderIndex: 'asc' },
    });

    return {
      yearGroup: profile.yearGroup,
      subjects: subjects.map(s => ({
        id: s.id,
        name: s.name,
        displayName: s.displayName,
        description: s.description,
        iconName: s.iconName,
        colorCode: s.colorCode,
        skillCount: s.skills.length,
      })),
    };
  }

  /**
   * Get plan history
   */
  async getPlanHistory(userId: string) {
    return this.prisma.weeklyPlan.findMany({
      where: { userId },
      include: {
        _count: {
          select: {
            tasks: {
              where: { status: 'COMPLETED' },
            },
          },
        },
      },
      orderBy: { weekStart: 'desc' },
      take: 10, // Last 10 weeks
    });
  }
}
