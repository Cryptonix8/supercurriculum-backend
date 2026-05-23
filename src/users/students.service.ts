import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { BulkImportStudentsDto, BulkStudentDto } from './dto/bulk-import-students.dto';
import * as bcrypt from 'bcrypt';
import { parse } from 'csv-parse/sync';

@Injectable()
export class StudentsService {
  constructor(
    private prisma: PrismaService,
    private uploadsService: UploadsService,
  ) {}

  /**
   * Create a new student with profile
   */
  async create(createStudentDto: CreateStudentDto) {
    const {
      email,
      password,
      firstName,
      lastName,
      yearGroupId,
      nickname,
      age,
      avatarUrl,
      homeLanguages,
      englishProficiency,
      preferredLearningMode,
      preferredTaskDuration,
      preferredChallengeLevel,
      weeklyStudyTime,
      dailyMinutes,
      interests,
      preferredSubjects,
      doesNotGiveUp,
      getsAnxious,
      communicationTone,
    } = createStudentDto;

    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new BadRequestException('Email already in use');
    }

    // Get default year group if not provided
    let finalYearGroupId = yearGroupId;
    if (!finalYearGroupId) {
      const defaultYearGroup = await this.prisma.yearGroup.findFirst({
        where: { isActive: true },
        orderBy: { orderIndex: 'asc' },
      });

      if (!defaultYearGroup) {
        throw new BadRequestException('No year groups available. Please create year groups first.');
      }

      finalYearGroupId = defaultYearGroup.id;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user and student profile in a transaction
    return this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        role: 'STUDENT',
        studentProfile: {
          create: {
            yearGroupId: finalYearGroupId,
            nickname,
            age,
            avatarUrl,
            homeLanguages: homeLanguages || [],
            englishProficiency,
            preferredLearningMode: preferredLearningMode as any || 'MIXED',
            preferredTaskDuration: preferredTaskDuration || 15,
            preferredChallengeLevel: preferredChallengeLevel as any || 'MEDIUM',
            weeklyStudyTime: weeklyStudyTime || 120,
            dailyMinutes: dailyMinutes || 30,
            interests: interests || [],
            preferredSubjects: preferredSubjects || [],
            doesNotGiveUp: doesNotGiveUp ?? true,
            getsAnxious: getsAnxious ?? false,
            communicationTone: communicationTone || 'friendly',
            onboardingCompleted: false,
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
        studentProfile: {
          include: {
            yearGroup: true,
          },
        },
      },
    });
  }

  /**
   * Bulk import students
   */
  async bulkImport(bulkImportDto: BulkImportStudentsDto) {
    const results = {
      successful: [] as any[],
      failed: [] as any[],
      total: bulkImportDto.students.length,
    };

    for (const studentData of bulkImportDto.students) {
      try {
        // Find year group by name if provided
        let yearGroupId: string | undefined;
        if (studentData.yearGroupName) {
          const yearGroup = await this.prisma.yearGroup.findFirst({
            where: {
              OR: [
                { displayName: { equals: studentData.yearGroupName, mode: 'insensitive' } },
                { name: { equals: studentData.yearGroupName.toLowerCase().replace(' ', '_'), mode: 'insensitive' } },
              ],
            },
          });
          yearGroupId = yearGroup?.id;
        }

        // Create student
        const student = await this.create({
          email: studentData.email,
          password: studentData.password,
          firstName: studentData.firstName,
          lastName: studentData.lastName,
          yearGroupId,
          nickname: studentData.nickname,
          age: studentData.age,
          homeLanguages: studentData.homeLanguages?.split(',').map(l => l.trim()),
          englishProficiency: studentData.englishProficiency,
        });

        // Assign to class if provided
        if (studentData.className && student.studentProfile) {
          const classEntity = await this.prisma.class.findFirst({
            where: { name: { equals: studentData.className, mode: 'insensitive' } },
          });

          if (classEntity) {
            await this.prisma.classStudent.create({
              data: {
                classId: classEntity.id,
                studentProfileId: student.studentProfile.id,
              },
            });
          }
        }

        results.successful.push({
          email: studentData.email,
          id: student.id,
        });
      } catch (error) {
        results.failed.push({
          email: studentData.email,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Bulk import students from CSV file
   */
  async bulkImportFromCSV(file: Express.Multer.File) {
    if (!file.originalname.endsWith('.csv')) {
      throw new BadRequestException('Only CSV files are allowed');
    }

    try {
      const csvContent = file.buffer.toString('utf-8');
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      // Validate required columns
      if (records.length === 0) {
        throw new BadRequestException('CSV file is empty');
      }

      const firstRecord = records[0];
      const requiredColumns = ['email', 'password', 'firstName', 'lastName'];
      const missingColumns = requiredColumns.filter(col => !(col in firstRecord));

      if (missingColumns.length > 0) {
        throw new BadRequestException(
          `Missing required columns: ${missingColumns.join(', ')}`
        );
      }

      // Convert records to BulkStudentDto format
      const students: BulkStudentDto[] = records.map((record: any) => ({
        email: record.email,
        password: record.password,
        firstName: record.firstName,
        lastName: record.lastName,
        yearGroupName: record.yearGroupName || record.yearGroup,
        className: record.className || record.class,
        nickname: record.nickname,
        age: record.age ? parseInt(record.age) : undefined,
        homeLanguages: record.homeLanguages,
        englishProficiency: record.englishProficiency,
      }));

      return this.bulkImport({ students });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to parse CSV: ${error.message}`);
    }
  }

  /**
   * Upload student avatar
   */
  async uploadAvatar(userId: string, file: Express.Multer.File) {
    // Validate it's an image
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image files are allowed for avatars');
    }

    // Get student
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { studentProfile: true },
    });

    if (!user || user.role !== 'STUDENT') {
      throw new NotFoundException('Student not found');
    }

    // Upload to S3 (or local storage based on configuration)
    const avatarUrl = await this.uploadsService.uploadFile(file, userId);

    // Update student profile
    if (user.studentProfile) {
      await this.prisma.studentProfile.update({
        where: { userId },
        data: { avatarUrl },
      });
    }

    return {
      success: true,
      avatarUrl,
    };
  }

  /**
   * Find all students with filters
   */
  async findAll(filters?: { yearGroupId?: string; classId?: string; search?: string }) {
    const where: any = {
      role: 'STUDENT',
    };

    // Apply search filter
    if (filters?.search) {
      where.OR = [
        { email: { contains: filters.search, mode: 'insensitive' } },
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Apply year group filter
    if (filters?.yearGroupId) {
      where.studentProfile = {
        yearGroupId: filters.yearGroupId,
      };
    }

    // Apply class filter
    if (filters?.classId) {
      where.studentProfile = {
        ...where.studentProfile,
        classStudents: {
          some: {
            classId: filters.classId,
          },
        },
      };
    }

    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        lastLogin: true,
        studentProfile: {
          include: {
            yearGroup: true,
            classStudents: {
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
        },
      },
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
    });
  }

  /**
   * Find student by ID
   */
  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        studentProfile: {
          include: {
            yearGroup: true,
            classStudents: {
              include: {
                class: {
                  include: {
                    yearGroup: true,
                    subject: true,
                    classTeachers: {
                      include: {
                        teacherProfile: {
                          include: {
                            user: {
                              select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user || user.role !== 'STUDENT') {
      throw new NotFoundException('Student not found');
    }

    return user;
  }

  /**
   * Update student
   */
  async update(id: string, updateStudentDto: UpdateStudentDto) {
    const user = await this.findOne(id);

    const {
      email,
      password,
      firstName,
      lastName,
      isActive,
      yearGroupId,
      nickname,
      age,
      avatarUrl,
      homeLanguages,
      englishProficiency,
      preferredLearningMode,
      preferredTaskDuration,
      preferredChallengeLevel,
      weeklyStudyTime,
      dailyMinutes,
      interests,
      preferredSubjects,
      doesNotGiveUp,
      getsAnxious,
      communicationTone,
    } = updateStudentDto;

    // Hash password if provided
    let hashedPassword: string | undefined;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    // Update user and student profile
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(email && { email }),
        ...(hashedPassword && { password: hashedPassword }),
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(typeof isActive === 'boolean' && { isActive }),
        studentProfile: user.studentProfile ? {
          update: {
            ...(yearGroupId && { yearGroupId }),
            ...(nickname !== undefined && { nickname }),
            ...(age !== undefined && { age }),
            ...(avatarUrl !== undefined && { avatarUrl }),
            ...(homeLanguages && { homeLanguages }),
            ...(englishProficiency !== undefined && { englishProficiency }),
            ...(preferredLearningMode && { preferredLearningMode: preferredLearningMode as any }),
            ...(preferredTaskDuration !== undefined && { preferredTaskDuration }),
            ...(preferredChallengeLevel && { preferredChallengeLevel: preferredChallengeLevel as any }),
            ...(weeklyStudyTime !== undefined && { weeklyStudyTime }),
            ...(dailyMinutes !== undefined && { dailyMinutes }),
            ...(interests && { interests }),
            ...(preferredSubjects && { preferredSubjects }),
            ...(typeof doesNotGiveUp === 'boolean' && { doesNotGiveUp }),
            ...(typeof getsAnxious === 'boolean' && { getsAnxious }),
            ...(communicationTone && { communicationTone }),
          },
        } : undefined,
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
        studentProfile: {
          include: {
            yearGroup: true,
          },
        },
      },
    });
  }

  /**
   * Delete student (soft delete)
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
   * Assign student to classes
   */
  async assignToClasses(studentId: string, classIds: string[]) {
    const user = await this.findOne(studentId);

    if (!user.studentProfile) {
      throw new BadRequestException('Student profile not found');
    }

    // Create class assignments
    const assignments = await Promise.all(
      classIds.map(classId =>
        this.prisma.classStudent.upsert({
          where: {
            classId_studentProfileId: {
              classId,
              studentProfileId: user.studentProfile.id,
            },
          },
          create: {
            classId,
            studentProfileId: user.studentProfile.id,
          },
          update: {},
        })
      )
    );

    return {
      success: true,
      assigned: assignments.length,
    };
  }

  /**
   * Unassign student from class
   */
  async unassignFromClass(studentId: string, classId: string) {
    const user = await this.findOne(studentId);

    if (!user.studentProfile) {
      throw new BadRequestException('Student profile not found');
    }

    await this.prisma.classStudent.deleteMany({
      where: {
        classId,
        studentProfileId: user.studentProfile.id,
      },
    });

    return {
      success: true,
      message: 'Student unassigned from class',
    };
  }

  /**
   * Get comprehensive student performance data
   */
  async getStudentPerformance(studentId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: studentId },
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
        assessments: {
          include: {
            test: {
              include: {
                subject: true,
              },
            },
            answers: {
              include: {
                question: true,
              },
            },
          },
          orderBy: {
            completedAt: 'desc',
          },
          take: 5,
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
        },
        submissions: {
          orderBy: {
            submittedAt: 'desc',
          },
          take: 10,
          include: {
            activity: {
              include: {
                subject: true,
              },
            },
          },
        },
        skillMastery: {
          include: {
            subject: true,
            skill: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Student not found');
    }

    // Calculate time spent (from learning sessions or planned tasks)
    const sessions = await this.prisma.learningSession.findMany({
      where: { userId: studentId },
      select: {
        duration: true,
      },
    });

    const totalMinutes = sessions.reduce((sum, session) => sum + session.duration, 0);
    const timeSpent = `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;

    // Calculate activity completion rate
    const totalTasks = user.weeklyPlans.reduce(
      (sum, plan) => sum + plan.tasks.length,
      0,
    );

    const completedTasks = user.weeklyPlans.reduce(
      (sum, plan) =>
        sum + plan.tasks.filter((t) => t.status === 'COMPLETED').length,
      0,
    );

    const completionRate =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Calculate overall mastery
    const masteryLevels = user.skillMastery.map((m) => m.masteryPercentage);
    const overallMastery =
      masteryLevels.length > 0
        ? Math.round(
            masteryLevels.reduce((sum, m) => sum + m, 0) / masteryLevels.length,
          )
        : 0;

    // Group mastery by subject
    const subjectMap = new Map();
    user.skillMastery.forEach((mastery) => {
      const subjectId = mastery.subjectId;
      if (!subjectMap.has(subjectId)) {
        subjectMap.set(subjectId, {
          id: subjectId,
          name: mastery.subject.displayName,
          skills: [],
          totalMastery: 0,
          count: 0,
        });
      }

      const subjectData = subjectMap.get(subjectId);
      subjectData.skills.push({
        id: mastery.skillId,
        name: mastery.skill.displayName,
        mastery: Math.round(mastery.masteryPercentage),
      });
      subjectData.totalMastery += mastery.masteryPercentage;
      subjectData.count += 1;
    });

    const subjects = Array.from(subjectMap.values()).map((subject) => ({
      id: subject.id,
      name: subject.name,
      mastery: Math.round(subject.totalMastery / subject.count),
      skills: subject.skills,
    }));

    // Process diagnostic tests
    const diagnosticTests = user.assessments.map((assessment) => ({
      id: assessment.id,
      testName: assessment.test.subject.displayName + ' Assessment',
      totalScore: Math.round(assessment.totalScore),
      completedAt: assessment.completedAt.toISOString(),
      sections: assessment.answers.reduce((acc: any[], answer) => {
        const section = answer.question.statement;
        const existing = acc.find((s) => s.name === section);
        if (existing) {
          existing.total += 5;
          existing.scored += answer.score;
        } else {
          acc.push({
            name: section,
            scored: answer.score,
            total: 5,
          });
        }
        return acc;
      }, []).map((section: any) => ({
        name: section.name,
        score: Math.round((section.scored / section.total) * 100),
      })),
    }));

    // Identify strengths and weaknesses
    const strengths = subjects
      .filter((s) => s.mastery >= 80)
      .map((s) => `Strong performance in ${s.name} (${s.mastery}%)`);

    const weaknesses = subjects
      .filter((s) => s.mastery < 50)
      .map((s) => `Needs support in ${s.name} (${s.mastery}%)`);

    // Recent activity
    const recentActivity = user.submissions.map((submission) => ({
      type: 'submission',
      description: `Submitted ${submission.activity.subject.displayName} work`,
      timestamp: submission.submittedAt.toISOString(),
    }));

    // Add completed tasks to recent activity
    user.weeklyPlans.forEach((plan) => {
      plan.tasks
        .filter((t) => t.status === 'COMPLETED' && t.completedAt)
        .forEach((task) => {
          recentActivity.push({
            type: 'completion',
            description: `Completed ${task.activity.subject.displayName}: ${task.activity.skill.displayName}`,
            timestamp: task.completedAt!.toISOString(),
          });
        });
    });

    // Sort by timestamp and take last 10
    recentActivity.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    const limitedActivity = recentActivity.slice(0, 10);

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      yearGroup: user.studentProfile?.yearGroup,
      overallMastery,
      timeSpent,
      completionRate,
      completedTasks,
      totalTasks,
      lastActive: user.lastLogin?.toISOString() || null,
      subjects,
      diagnosticTests,
      strengths,
      weaknesses,
      recentActivity: limitedActivity,
    };
  }
}

