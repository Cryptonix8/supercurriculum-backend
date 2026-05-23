import { Injectable, NotFoundException, ForbiddenException, Inject, forwardRef, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { LearningMode, ChallengeLevel } from '@prisma/client';
import { AutoExerciseGeneratorService } from '../activity-generation/auto-exercise-generator.service';
import { WeeklyPlansService } from '../weekly-plans/weekly-plans.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => AutoExerciseGeneratorService))
    private autoExerciseGenerator: AutoExerciseGeneratorService,
    @Inject(forwardRef(() => WeeklyPlansService))
    private weeklyPlansService: WeeklyPlansService,
  ) {}

  /**
   * Create a new user
   */
  async create(createUserDto: CreateUserDto) {
    return this.prisma.user.create({
      data: createUserDto,
    });
  }

  /**
   * Find all users (admin only)
   */
  async findAll(role?: string) {
    return this.prisma.user.findMany({
      where: role ? { role: role as any } : undefined,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLogin: true,
      },
    });
  }

  /**
   * Find user by ID
   */
  async findOne(id: string) {
    try {
      await this.prisma.ensureConnection();
      const user = await this.prisma.withReconnectRetry(() =>
        this.prisma.user.findUnique({
          where: { id },
          include: {
            studentProfile: {
              include: {
                yearGroup: true,
              },
            },
          },
        }),
      );

      if (!user) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }

      return user;
    } catch (error: any) {
      if (
        error.code === 'P1001' ||
        error.code === 'P1017' ||
        error.message?.includes('Server has closed the connection') ||
        error.message?.includes('Connection closed')
      ) {
        this.logger.error(`Database connection error in findOne: ${error.message}`);
        throw new Error('Database connection error. Please try again.');
      }
      throw error;
    }
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string) {
    await this.prisma.ensureConnection();
    return this.prisma.withReconnectRetry(() =>
      this.prisma.user.findUnique({
        where: { email },
        include: {
          studentProfile: {
            include: {
              yearGroup: true,
            },
          },
        },
      }),
    );
  }

  /**
   * Update user
   */
  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.findOne(id);

    return this.prisma.user.update({
      where: { id },
      data: updateUserDto,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
    });
  }

  /**
   * Update student profile
   * When onboarding is completed, automatically generate initial exercises
   */
  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const user = await this.findOne(userId);

    if (user.role !== 'STUDENT') {
      throw new ForbiddenException('Only students can update their profile. Teachers and admins should use the admin panel.');
    }

    // Check if profile exists
    const existingProfile = await this.prisma.studentProfile.findUnique({
      where: { userId },
    });

    // Prepare data with proper relation handling.
    // Never accept onboardingCompleted from PATCH /me/profile — it is set only after mandatory assessment.
    const { yearGroupId, onboardingCompleted: _ignoredOnboardingCompleted, ...restData } = updateProfileDto;

    // For updates
    const updateData: any = {
      ...restData,
      ...(yearGroupId && {
        yearGroup: {
          connect: { id: yearGroupId },
        },
      }),
    };

    let profile;

    // If profile exists, just update it
    if (existingProfile) {
      profile = await this.prisma.studentProfile.update({
        where: { userId },
        data: updateData,
        include: {
          yearGroup: true,
        },
      });
    } else {
      // If profile doesn't exist, create it with required yearGroup
      let createYearGroupId = yearGroupId;
      
      if (!createYearGroupId) {
        // Get default year group
        const defaultYearGroup = await this.prisma.yearGroup.findFirst({
          where: {
            OR: [
              { name: 'year_7' },
              { isActive: true },
            ],
          },
          orderBy: { orderIndex: 'asc' },
        });

        if (!defaultYearGroup) {
          throw new Error('No year groups available. Please create year groups first.');
        }

        createYearGroupId = defaultYearGroup.id;
      }

      // Create new profile with yearGroup (using scalar yearGroupId, not relation)
      profile = await this.prisma.studentProfile.create({
        data: {
          userId,
          yearGroupId: createYearGroupId,
          dailyMinutes: restData.dailyMinutes,
          interests: restData.interests || [],
          preferredSubjects: restData.preferredSubjects || [],
          nickname: restData.nickname,
          age: restData.age,
          homeLanguages: restData.homeLanguages || [],
          englishProficiency: restData.englishProficiency,
          preferredLearningMode: (restData.preferredLearningMode as LearningMode) || LearningMode.MIXED,
          preferredTaskDuration: restData.preferredTaskDuration || 15,
          preferredChallengeLevel: (restData.preferredChallengeLevel as ChallengeLevel) || ChallengeLevel.MEDIUM,
          weeklyStudyTime: restData.weeklyStudyTime || 120,
          subjectConfidence: restData.subjectConfidence,
          attitudeToDifficulty: restData.attitudeToDifficulty,
          doesNotGiveUp: restData.doesNotGiveUp ?? true,
          getsAnxious: restData.getsAnxious ?? false,
          onboardingCompleted: false,
        },
        include: {
          yearGroup: true,
        },
      });
    }

    return profile;
  }

  /**
   * Run curriculum setup after mandatory onboarding is finished (called from onboarding flow).
   */
  async runPostMandatoryOnboardingSetup(userId: string, yearGroupId: string): Promise<void> {
    await this.setupNewStudent(userId, yearGroupId);
  }

  /**
   * Setup a new student after onboarding completion
   * This runs in the background to:
   * 1. Generate initial exercises using AI
   * 2. Create default bands for all subjects in their year group
   * 3. Generate their first weekly plan
   */
  private async setupNewStudent(userId: string, yearGroupId: string) {
    try {
      // Step 1: Generate initial exercises (if AI is configured)
      this.logger.log(`[Step 1/3] Generating initial exercises for student ${userId}`);
      let generatedActivities = [];
      try {
        generatedActivities = await this.autoExerciseGenerator.generateInitialExercisesForStudent(userId, yearGroupId);
        this.logger.log(`Generated ${generatedActivities.length} initial exercises for student ${userId}`);
      } catch (error) {
        this.logger.warn(`Could not generate AI exercises for student ${userId} (AI may not be configured):`, error);
        // Continue even if AI generation fails - we'll try to use existing activities
      }

      // Step 2: Generate the weekly plan (this will also create default bands)
      this.logger.log(`[Step 2/3] Generating weekly plan for student ${userId}`);
      try {
        const weeklyPlan = await this.weeklyPlansService.generateWeeklyPlan(userId);
        this.logger.log(`Generated weekly plan with ${weeklyPlan?.tasks?.length || 0} tasks for student ${userId}`);
      } catch (error) {
        this.logger.error(`Error generating weekly plan for student ${userId}:`, error);
      }

      this.logger.log(`[Step 3/3] Student ${userId} setup complete!`);
    } catch (error) {
      this.logger.error(`Error in setupNewStudent for ${userId}:`, error);
    }
  }

  /**
   * Get student profile
   */
  async getProfile(userId: string) {
    // First check if user exists and is a student
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    // For non-students, return basic info without student profile
    if (user.role !== 'STUDENT') {
      return {
        userId: user.id,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        isStudent: false,
        message: 'This user is not a student. Student profile features are not available.',
      };
    }

    let profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: {
        yearGroup: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });

    // Auto-create profile if it doesn't exist (for existing student users)
    if (!profile) {

      // Get a default year group (Year 7 or first available)
      const defaultYearGroup = await this.prisma.yearGroup.findFirst({
        where: {
          OR: [
            { name: 'year_7' },
            { isActive: true },
          ],
        },
        orderBy: { orderIndex: 'asc' },
      });

      if (!defaultYearGroup) {
        throw new NotFoundException('No year groups available. Please create year groups first.');
      }

      // Create a basic profile
      profile = await this.prisma.studentProfile.create({
        data: {
          userId,
          yearGroupId: defaultYearGroup.id,
          dailyMinutes: 30,
          interests: [],
          preferredSubjects: [],
          homeLanguages: [],
          preferredLearningMode: 'MIXED',
          preferredTaskDuration: 15,
          preferredChallengeLevel: 'MEDIUM',
          weeklyStudyTime: 120,
          doesNotGiveUp: true,
          getsAnxious: false,
          onboardingCompleted: false,
        },
        include: {
          yearGroup: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      });
    }

    return profile;
  }

  /**
   * Delete user (soft delete by deactivating)
   */
  async remove(id: string) {
    const user = await this.findOne(id);

    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: {
        id: true,
        email: true,
        isActive: true,
      },
    });
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { lastLogin: new Date() },
    });
  }

  /**
   * Create a new teacher with profile
   */
  async createTeacher(createTeacherDto: CreateTeacherDto) {
    const {
      email,
      password,
      firstName,
      lastName,
      phoneNumber,
      officeLocation,
      department,
      jobTitle,
      bio,
      canEditContent,
      canManageUsers,
      canViewAllClasses,
      canAssignTasks,
      canGradeWork,
      subjects,
    } = createTeacherDto;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user and teacher profile in a transaction
    return this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        role: 'TEACHER',
        teacherProfile: {
          create: {
            phoneNumber,
            officeLocation,
            department,
            jobTitle,
            bio,
            canEditContent: canEditContent ?? false,
            canManageUsers: canManageUsers ?? false,
            canViewAllClasses: canViewAllClasses ?? false,
            canAssignTasks: canAssignTasks ?? true,
            canGradeWork: canGradeWork ?? true,
            subjects: subjects || [],
          },
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        teacherProfile: true,
      },
    });
  }

  /**
   * Update teacher and profile
   */
  async updateTeacher(id: string, updateTeacherDto: UpdateTeacherDto) {
    const user = await this.findOne(id);

    if (user.role !== 'TEACHER') {
      throw new Error('User is not a teacher');
    }

    const {
      email,
      firstName,
      lastName,
      isActive,
      phoneNumber,
      officeLocation,
      department,
      jobTitle,
      bio,
      canEditContent,
      canManageUsers,
      canViewAllClasses,
      canAssignTasks,
      canGradeWork,
      subjects,
    } = updateTeacherDto;

    // Update user and teacher profile in a transaction
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(email && { email }),
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(typeof isActive === 'boolean' && { isActive }),
        teacherProfile: {
          upsert: {
            create: {
              phoneNumber,
              officeLocation,
              department,
              jobTitle,
              bio,
              canEditContent: canEditContent ?? false,
              canManageUsers: canManageUsers ?? false,
              canViewAllClasses: canViewAllClasses ?? false,
              canAssignTasks: canAssignTasks ?? true,
              canGradeWork: canGradeWork ?? true,
              subjects: subjects || [],
            },
            update: {
              ...(phoneNumber !== undefined && { phoneNumber }),
              ...(officeLocation !== undefined && { officeLocation }),
              ...(department !== undefined && { department }),
              ...(jobTitle !== undefined && { jobTitle }),
              ...(bio !== undefined && { bio }),
              ...(typeof canEditContent === 'boolean' && { canEditContent }),
              ...(typeof canManageUsers === 'boolean' && { canManageUsers }),
              ...(typeof canViewAllClasses === 'boolean' && { canViewAllClasses }),
              ...(typeof canAssignTasks === 'boolean' && { canAssignTasks }),
              ...(typeof canGradeWork === 'boolean' && { canGradeWork }),
              ...(subjects && { subjects }),
            },
          },
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        teacherProfile: true,
      },
    });
  }

  /**
   * Get teacher profile
   */
  async getTeacherProfile(userId: string) {
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        },
        classTeachers: {
          include: {
            class: {
              include: {
                yearGroup: true,
                subject: true,
              },
            },
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Teacher profile not found');
    }

    return profile;
  }

  /**
   * Get all teachers
   */
  async findAllTeachers() {
    return this.prisma.user.findMany({
      where: { role: 'TEACHER' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        teacherProfile: true,
      },
      orderBy: {
        lastName: 'asc',
      },
    });
  }
}

