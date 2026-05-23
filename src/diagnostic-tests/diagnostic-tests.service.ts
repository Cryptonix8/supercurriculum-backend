import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDiagnosticTestScheduleDto } from './dto/create-diagnostic-test-schedule.dto';
import { UpdateDiagnosticTestScheduleDto } from './dto/update-diagnostic-test-schedule.dto';
import { DiagnosticTestAnalyticsQueryDto } from './dto/diagnostic-test-analytics.dto';
import { DiagnosticTestStatus, PerformanceLevel } from '@prisma/client';

@Injectable()
export class DiagnosticTestsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new diagnostic test schedule
   */
  async createSchedule(
    dto: CreateDiagnosticTestScheduleDto,
    createdById: string,
  ) {
    // Validate year group exists
    const yearGroup = await this.prisma.yearGroup.findUnique({
      where: { id: dto.yearGroupId },
    });

    if (!yearGroup) {
      throw new NotFoundException('Year group not found');
    }

    // Validate classes exist
    const classes = await this.prisma.class.findMany({
      where: { id: { in: dto.classIds } },
      include: { 
        classStudents: {
          include: {
            studentProfile: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (classes.length !== dto.classIds.length) {
      throw new BadRequestException('One or more classes not found');
    }

    // Validate dates
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (endDate <= startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    // Get all students from classes or use specific student IDs
    let studentIds: string[] = [];
    
    if (dto.studentIds && dto.studentIds.length > 0) {
      studentIds = dto.studentIds;
    } else {
      // Get all students from the specified classes
      studentIds = classes.flatMap(c => 
        c.classStudents.map(cs => cs.studentProfile.userId)
      );
    }

    // Get all feedback tests for this year group
    const feedbackTests = await this.prisma.feedbackTest.findMany({
      where: {
        subject: {
          yearGroupId: dto.yearGroupId,
        },
        isActive: true,
      },
    });

    if (feedbackTests.length === 0) {
      throw new BadRequestException('No feedback tests available for this year group');
    }

    // Create the schedule with assignments
    const schedule = await this.prisma.diagnosticTestSchedule.create({
      data: {
        title: dto.title,
        description: dto.description,
        testType: dto.testType,
        yearGroupId: dto.yearGroupId,
        classIds: dto.classIds,
        studentIds: studentIds,
        startDate: startDate,
        endDate: endDate,
        createdById: createdById,
        status: DiagnosticTestStatus.SCHEDULED,
        testAssignments: {
          create: studentIds.flatMap(studentId =>
            feedbackTests.map(test => ({
              studentId,
              testId: test.id,
              assigned: true,
            }))
          ),
        },
      },
      include: {
        yearGroup: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        testAssignments: {
          include: {
            test: {
              include: {
                subject: true,
                skill: true,
              },
            },
            student: {
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
    });

    return schedule;
  }

  /**
   * Get all diagnostic test schedules
   */
  async getAllSchedules(filters?: {
    yearGroupId?: string;
    status?: DiagnosticTestStatus;
  }) {
    const where: any = {};

    if (filters?.yearGroupId) {
      where.yearGroupId = filters.yearGroupId;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    const schedules = await this.prisma.diagnosticTestSchedule.findMany({
      where,
      include: {
        yearGroup: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        testAssignments: {
          include: {
            assessment: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate completion statistics for each schedule
    return schedules.map(schedule => {
      const totalAssignments = schedule.testAssignments.length;
      const completedAssignments = schedule.testAssignments.filter(
        a => a.completedAt !== null
      ).length;
      const completionRate = totalAssignments > 0 
        ? Math.round((completedAssignments / totalAssignments) * 100) 
        : 0;

      return {
        ...schedule,
        statistics: {
          totalAssignments,
          completedAssignments,
          completionRate,
          uniqueStudents: [...new Set(schedule.testAssignments.map(a => a.studentId))].length,
        },
      };
    });
  }

  /**
   * Get a specific diagnostic test schedule
   */
  async getScheduleById(scheduleId: string) {
    const schedule = await this.prisma.diagnosticTestSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        yearGroup: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        testAssignments: {
          include: {
            test: {
              include: {
                subject: true,
                skill: true,
              },
            },
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            assessment: {
              include: {
                answers: true,
                skillPerformances: true,
              },
            },
          },
        },
      },
    });

    if (!schedule) {
      throw new NotFoundException('Diagnostic test schedule not found');
    }

    return schedule;
  }

  /**
   * Update a diagnostic test schedule
   */
  async updateSchedule(
    scheduleId: string,
    dto: UpdateDiagnosticTestScheduleDto,
  ) {
    const schedule = await this.prisma.diagnosticTestSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new NotFoundException('Diagnostic test schedule not found');
    }

    // Validate dates if provided
    if (dto.startDate && dto.endDate) {
      const startDate = new Date(dto.startDate);
      const endDate = new Date(dto.endDate);

      if (endDate <= startDate) {
        throw new BadRequestException('End date must be after start date');
      }
    }

    const updateData: any = {};

    if (dto.title) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.testType) updateData.testType = dto.testType;
    if (dto.status) updateData.status = dto.status;
    if (dto.classIds) updateData.classIds = dto.classIds;
    if (dto.studentIds) updateData.studentIds = dto.studentIds;
    if (dto.startDate) updateData.startDate = new Date(dto.startDate);
    if (dto.endDate) updateData.endDate = new Date(dto.endDate);

    return this.prisma.diagnosticTestSchedule.update({
      where: { id: scheduleId },
      data: updateData,
      include: {
        yearGroup: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  /**
   * Delete a diagnostic test schedule
   */
  async deleteSchedule(scheduleId: string) {
    const schedule = await this.prisma.diagnosticTestSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new NotFoundException('Diagnostic test schedule not found');
    }

    await this.prisma.diagnosticTestSchedule.delete({
      where: { id: scheduleId },
    });

    return { message: 'Diagnostic test schedule deleted successfully' };
  }

  /**
   * Get diagnostic test results and analytics
   */
  async getTestResults(query: DiagnosticTestAnalyticsQueryDto) {
    const where: any = {};

    if (query.scheduleId) {
      where.scheduleId = query.scheduleId;
    }

    if (query.studentId) {
      where.studentId = query.studentId;
    }

    if (query.startDate || query.endDate) {
      where.completedAt = {};
      if (query.startDate) {
        where.completedAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.completedAt.lte = new Date(query.endDate);
      }
    }

    const assignments = await this.prisma.diagnosticTestAssignment.findMany({
      where: {
        ...where,
        completedAt: { not: null },
      },
      include: {
        test: {
          include: {
            subject: true,
            skill: true,
          },
        },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        assessment: {
          include: {
            answers: {
              include: {
                question: true,
              },
            },
            skillPerformances: true,
          },
        },
        schedule: {
          select: {
            id: true,
            title: true,
            testType: true,
          },
        },
      },
    });

    // Process results for individual scores, section breakdowns, etc.
    const results = assignments.map(assignment => {
      if (!assignment.assessment) return null;

      const assessment = assignment.assessment;
      
      // Calculate section breakdowns
      const sectionBreakdowns = assessment.answers.reduce((acc: any[], answer) => {
        const sectionName = answer.question.statement;
        const existing = acc.find(s => s.section === sectionName);
        
        if (existing) {
          existing.totalScore += answer.score;
          existing.maxScore += 5;
          existing.count += 1;
        } else {
          acc.push({
            section: sectionName,
            totalScore: answer.score,
            maxScore: 5,
            count: 1,
          });
        }
        
        return acc;
      }, []);

      // Calculate percentages
      const processedSections = sectionBreakdowns.map(section => ({
        name: section.section,
        score: Math.round((section.totalScore / section.maxScore) * 100),
        raw: `${section.totalScore}/${section.maxScore}`,
      }));

      return {
        assignmentId: assignment.id,
        student: assignment.student,
        test: {
          subject: assignment.test.subject.displayName,
          skill: assignment.test.skill.displayName,
        },
        schedule: assignment.schedule,
        completedAt: assignment.completedAt,
        totalScore: Math.round(assessment.totalScore * 20), // Convert 1-5 to percentage
        band: assessment.band,
        sectionBreakdowns: processedSections,
        skillPerformances: assessment.skillPerformances.map(sp => ({
          skillId: sp.skillId,
          score: sp.score,
          performance: sp.performance,
          errorTags: sp.errorTags,
        })),
      };
    }).filter(Boolean);

    return results;
  }

  /**
   * Get class averages for diagnostic tests
   */
  async getClassAverages(classId: string, scheduleId?: string) {
    // Get all students in the class
    const classData = await this.prisma.class.findUnique({
      where: { id: classId },
      include: {
        classStudents: {
          include: {
            studentProfile: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (!classData) {
      throw new NotFoundException('Class not found');
    }

    const studentIds = classData.classStudents.map(cs => cs.studentProfile.userId);

    // Get all completed diagnostic test assignments for these students
    const where: any = {
      studentId: { in: studentIds },
      completedAt: { not: null },
    };

    if (scheduleId) {
      where.scheduleId = scheduleId;
    }

    const assignments = await this.prisma.diagnosticTestAssignment.findMany({
      where,
      include: {
        assessment: {
          include: {
            answers: true,
            test: {
              include: {
                subject: true,
              },
            },
          },
        },
      },
    });

    // Calculate averages by subject
    const subjectAverages = assignments.reduce((acc: any, assignment) => {
      if (!assignment.assessment) return acc;

      const subjectName = assignment.assessment.test.subject.displayName;
      const score = assignment.assessment.totalScore * 20; // Convert to percentage

      if (!acc[subjectName]) {
        acc[subjectName] = {
          subject: subjectName,
          scores: [],
          totalScore: 0,
          count: 0,
        };
      }

      acc[subjectName].scores.push(score);
      acc[subjectName].totalScore += score;
      acc[subjectName].count += 1;

      return acc;
    }, {});

    // Calculate averages and additional statistics
    const averages = Object.values(subjectAverages).map((data: any) => ({
      subject: data.subject,
      average: Math.round(data.totalScore / data.count),
      min: Math.round(Math.min(...data.scores)),
      max: Math.round(Math.max(...data.scores)),
      studentCount: data.count,
    }));

    return {
      classId,
      className: classData.name,
      totalStudents: studentIds.length,
      subjectAverages: averages,
      overallAverage: averages.length > 0
        ? Math.round(averages.reduce((sum, a) => sum + a.average, 0) / averages.length)
        : 0,
    };
  }

  /**
   * Compare pre/post test scores
   */
  async comparePrePostScores(preTestId: string, postTestId: string) {
    const [preTest, postTest] = await Promise.all([
      this.prisma.assessment.findUnique({
        where: { id: preTestId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          test: {
            include: {
              subject: true,
              skill: true,
            },
          },
          answers: {
            include: {
              question: true,
            },
          },
          skillPerformances: true,
        },
      }),
      this.prisma.assessment.findUnique({
        where: { id: postTestId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          test: {
            include: {
              subject: true,
              skill: true,
            },
          },
          answers: {
            include: {
              question: true,
            },
          },
          skillPerformances: true,
        },
      }),
    ]);

    if (!preTest || !postTest) {
      throw new NotFoundException('One or both assessments not found');
    }

    if (preTest.userId !== postTest.userId) {
      throw new BadRequestException('Assessments must be for the same student');
    }

    // Calculate score improvements
    const preScore = preTest.totalScore * 20;
    const postScore = postTest.totalScore * 20;
    const improvement = postScore - preScore;
    const improvementPercentage = preScore > 0 
      ? Math.round((improvement / preScore) * 100) 
      : 0;

    // Compare section-by-section
    const preSections = this.calculateSectionScores(preTest.answers);
    const postSections = this.calculateSectionScores(postTest.answers);

    const sectionComparisons = preSections.map(preSection => {
      const postSection = postSections.find(s => s.section === preSection.section);
      
      if (!postSection) {
        return {
          section: preSection.section,
          preScore: preSection.score,
          postScore: null,
          improvement: null,
        };
      }

      return {
        section: preSection.section,
        preScore: preSection.score,
        postScore: postSection.score,
        improvement: postSection.score - preSection.score,
      };
    });

    return {
      student: preTest.user,
      subject: preTest.test.subject.displayName,
      skill: preTest.test.skill.displayName,
      preTest: {
        id: preTest.id,
        score: Math.round(preScore),
        completedAt: preTest.completedAt,
        band: preTest.band,
      },
      postTest: {
        id: postTest.id,
        score: Math.round(postScore),
        completedAt: postTest.completedAt,
        band: postTest.band,
      },
      improvement: {
        points: Math.round(improvement),
        percentage: improvementPercentage,
        bandChange: preTest.band !== postTest.band,
      },
      sectionComparisons,
    };
  }

  /**
   * Identify skill gaps from test results
   */
  async identifySkillGaps(query: DiagnosticTestAnalyticsQueryDto) {
    const where: any = {
      completedAt: { not: null },
    };

    if (query.scheduleId) {
      where.scheduleId = query.scheduleId;
    }

    if (query.studentId) {
      where.studentId = query.studentId;
    }

    if (query.classId) {
      // Get students in this class
      const classData = await this.prisma.class.findUnique({
        where: { id: query.classId },
        include: { 
          classStudents: {
            include: {
              studentProfile: true,
            },
          },
        },
      });

      if (classData) {
        where.studentId = { in: classData.classStudents.map(cs => cs.studentProfile.userId) };
      }
    }

    const assignments = await this.prisma.diagnosticTestAssignment.findMany({
      where,
      include: {
        assessment: {
          include: {
            skillPerformances: true,
            test: {
              include: {
                subject: true,
                skill: true,
              },
            },
          },
        },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Identify students with NEEDS_SUPPORT or low scores
    const skillGaps = assignments
      .filter(a => a.assessment)
      .flatMap(assignment => {
        const assessment = assignment.assessment!;
        
        // Check overall score
        const overallScore = assessment.totalScore * 20;
        const hasOverallGap = overallScore < 60;

        // Check skill performances
        const skillGapsForStudent = assessment.skillPerformances
          .filter(sp => 
            sp.performance === PerformanceLevel.NEEDS_SUPPORT || 
            sp.score < 60
          )
          .map(sp => ({
            student: assignment.student,
            subject: assessment.test.subject.displayName,
            skill: assessment.test.skill.displayName,
            skillId: sp.skillId,
            score: sp.score,
            performance: sp.performance,
            errorTags: sp.errorTags,
            overallScore: Math.round(overallScore),
            band: assessment.band,
          }));

        return skillGapsForStudent;
      });

    // Group by skill for summary
    const skillGapSummary = skillGaps.reduce((acc: any, gap) => {
      const key = `${gap.subject}-${gap.skill}`;
      
      if (!acc[key]) {
        acc[key] = {
          subject: gap.subject,
          skill: gap.skill,
          students: [],
          averageScore: 0,
          totalScore: 0,
          count: 0,
        };
      }

      acc[key].students.push({
        ...gap.student,
        score: gap.score,
        errorTags: gap.errorTags,
      });
      acc[key].totalScore += gap.score;
      acc[key].count += 1;

      return acc;
    }, {});

    // Calculate averages
    const summary = Object.values(skillGapSummary).map((item: any) => ({
      ...item,
      averageScore: Math.round(item.totalScore / item.count),
      studentCount: item.students.length,
    }));

    return {
      totalGapsIdentified: skillGaps.length,
      uniqueStudentsAffected: [...new Set(skillGaps.map(g => g.student.id))].length,
      skillGaps,
      summary,
    };
  }

  /**
   * Get year-on-year comparison data
   */
  async getYearOnYearComparison(yearGroupId: string) {
    const schedules = await this.prisma.diagnosticTestSchedule.findMany({
      where: { yearGroupId },
      include: {
        testAssignments: {
          where: { completedAt: { not: null } },
          include: {
            assessment: {
              include: {
                test: {
                  include: {
                    subject: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    // Group by year (extract year from startDate)
    const yearlyData = schedules.reduce((acc: any, schedule) => {
      const year = new Date(schedule.startDate).getFullYear();
      
      if (!acc[year]) {
        acc[year] = {
          year,
          schedules: [],
          totalTests: 0,
          averageScore: 0,
          totalScore: 0,
          count: 0,
        };
      }

      schedule.testAssignments.forEach(assignment => {
        if (assignment.assessment) {
          const score = assignment.assessment.totalScore * 20;
          acc[year].totalScore += score;
          acc[year].count += 1;
          acc[year].totalTests += 1;
        }
      });

      acc[year].schedules.push({
        id: schedule.id,
        title: schedule.title,
        testType: schedule.testType,
        date: schedule.startDate,
      });

      return acc;
    }, {});

    // Calculate averages
    const comparison = Object.values(yearlyData).map((data: any) => ({
      year: data.year,
      averageScore: data.count > 0 
        ? Math.round(data.totalScore / data.count) 
        : 0,
      totalTests: data.totalTests,
      schedules: data.schedules,
    }));

    return comparison;
  }

  // Helper method to calculate section scores
  private calculateSectionScores(answers: any[]): any[] {
    return answers.reduce((acc: any[], answer) => {
      const sectionName = answer.question.statement;
      const existing = acc.find(s => s.section === sectionName);
      
      if (existing) {
        existing.totalScore += answer.score;
        existing.maxScore += 5;
      } else {
        acc.push({
          section: sectionName,
          totalScore: answer.score,
          maxScore: 5,
        });
      }
      
      return acc;
    }, []).map(section => ({
      section: section.section,
      score: Math.round((section.totalScore / section.maxScore) * 100),
    }));
  }
}

