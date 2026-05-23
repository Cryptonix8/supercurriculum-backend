import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { SubmitTaskDto } from './dto/submit-task.dto';
import { GamificationService } from '../gamification/gamification.service';
import { getXpForExerciseCompletion } from '../gamification/gamification.rules';
import { BadgesService } from '../badges/badges.service';

@Injectable()
export class SubmissionsService {
  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
    private gamificationService: GamificationService,
    private badgesService: BadgesService,
  ) {}

  /**
   * Submit task work and get AI feedback
   */
  async submitTask(submitTaskDto: SubmitTaskDto) {
    const { userId, plannedTaskId, activityId, textContent, mediaUrls } = submitTaskDto;

    // Get activity details
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      include: {
        subject: true,
        skill: true,
      },
    });

    if (!activity) {
      throw new NotFoundException('Activity not found');
    }

    // Get student profile for context
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: {
        yearGroup: true,
      },
    });

    // Get student's current band for this skill
    const studentBand = await this.prisma.studentBand.findUnique({
      where: {
        userId_subjectId_skillId: {
          userId,
          subjectId: activity.subjectId,
          skillId: activity.skillId,
        },
      },
    });

    // Get intervention framework for context
    const intervention = studentBand
      ? await this.prisma.intervention.findUnique({
          where: {
            subjectId_skillId_band: {
              subjectId: activity.subjectId,
              skillId: activity.skillId,
              band: studentBand.currentBand,
            },
          },
        })
      : null;

    // Create submission record
    const submission = await this.prisma.submission.create({
      data: {
        userId,
        plannedTaskId: plannedTaskId || null,
        activityId,
        contentType: mediaUrls && mediaUrls.length > 0 ? 'MIXED' : 'TEXT',
        textContent,
        mediaUrls: mediaUrls || [],
      },
      include: {
        activity: {
          include: {
            subject: true,
            skill: true,
          },
        },
      },
    });

    // Generate AI feedback if text content is provided
    let aiFeedback = null;
    if (textContent && textContent.trim().length > 10) {
      try {
        aiFeedback = await this.aiService.generateFeedback({
          taskInstructions: activity.instructions,
          expectedOutcome: intervention?.expectedOutcome || 'Complete the task as instructed',
          studentSubmission: textContent,
          yearGroup: profile?.yearGroup?.displayName || 'Student',
          subject: activity.subject.displayName,
          skill: activity.skill.displayName,
          band: studentBand?.currentBand || 'DEVELOPING',
        });

        // Update submission with AI feedback
        await this.prisma.submission.update({
          where: { id: submission.id },
          data: {
            aiFeedback,
            feedbackGeneratedAt: new Date(),
          },
        });
      } catch (error) {
        console.error('Error generating AI feedback:', error);
        // Continue even if AI feedback fails
      }
    }

    // If this is part of a planned task, mark it as completed
    if (plannedTaskId) {
      await this.prisma.plannedTask.update({
        where: { id: plannedTaskId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      const scopeKey = `planned-task:${plannedTaskId}`;
      const onCooldown = await this.gamificationService.isOnCooldown(
        userId,
        'EXERCISE_COMPLETED',
        scopeKey,
        365 * 24 * 60 * 60 * 1000,
      );

      if (!onCooldown) {
        await this.gamificationService.awardXp(
          userId,
          getXpForExerciseCompletion({
            usedFullSolution: false,
            hintsUsed: 0,
          }),
          'EXERCISE_COMPLETED',
          {
            applyStudyDay: true,
            metadata: {
              scopeKey,
              plannedTaskId,
              submissionId: submission.id,
              subjectId: activity.subjectId,
              skillId: activity.skillId,
              source: 'submissions.submitTask',
            },
          },
        );
      }

      await this.badgesService.checkAndAwardBadges(userId);
    }

    return {
      submission: {
        ...submission,
        aiFeedback,
      },
      message: 'Task submitted successfully',
    };
  }

  /**
   * Get student's submissions
   */
  async getSubmissions(userId: string, filters?: {
    subjectId?: string;
    skillId?: string;
    activityId?: string;
  }) {
    return this.prisma.submission.findMany({
      where: {
        userId,
        ...(filters?.subjectId && {
          activity: {
            subjectId: filters.subjectId,
          },
        }),
        ...(filters?.skillId && {
          activity: {
            skillId: filters.skillId,
          },
        }),
        ...(filters?.activityId && {
          activityId: filters.activityId,
        }),
      },
      include: {
        activity: {
          include: {
            subject: true,
            skill: true,
          },
        },
        plannedTask: true,
      },
      orderBy: { submittedAt: 'desc' },
    });
  }

  /**
   * Get specific submission
   */
  async getSubmission(id: string, userId: string) {
    const submission = await this.prisma.submission.findFirst({
      where: {
        id,
        userId, // Ensure student can only access their own submissions
      },
      include: {
        activity: {
          include: {
            subject: true,
            skill: true,
          },
        },
        plannedTask: true,
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    return submission;
  }

  /**
   * Add teacher comment to submission
   */
  async addTeacherComment(
    submissionId: string,
    teacherComment: string,
    teacherId: string,
  ) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    return this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        teacherComment,
        teacherCommentedAt: new Date(),
      },
    });
  }

  /**
   * Get submission statistics
   */
  async getSubmissionStats(userId: string) {
    const submissions = await this.prisma.submission.findMany({
      where: { userId },
      include: {
        activity: {
          include: {
            subject: true,
          },
        },
      },
    });

    const total = submissions.length;
    const withFeedback = submissions.filter(s => s.aiFeedback).length;
    const withTeacherComment = submissions.filter(s => s.teacherComment).length;

    const bySubject = submissions.reduce((acc, sub) => {
      const subjectName = sub.activity.subject.displayName;
      acc[subjectName] = (acc[subjectName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const recentSubmissions = submissions
      .filter(s => {
        const daysSince = (Date.now() - s.submittedAt.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince <= 7;
      })
      .length;

    return {
      total,
      withFeedback,
      withTeacherComment,
      bySubject,
      recentSubmissions,
    };
  }

  /**
   * Regenerate AI feedback for a submission
   */
  async regenerateFeedback(submissionId: string, userId: string) {
    const submission = await this.getSubmission(submissionId, userId);

    if (!submission.textContent) {
      throw new NotFoundException('No text content to generate feedback for');
    }

    // Get necessary context
    const activity = submission.activity;
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: { yearGroup: true },
    });

    const studentBand = await this.prisma.studentBand.findUnique({
      where: {
        userId_subjectId_skillId: {
          userId,
          subjectId: activity.subjectId,
          skillId: activity.skillId,
        },
      },
    });

    const intervention = studentBand
      ? await this.prisma.intervention.findUnique({
          where: {
            subjectId_skillId_band: {
              subjectId: activity.subjectId,
              skillId: activity.skillId,
              band: studentBand.currentBand,
            },
          },
        })
      : null;

    // Generate new feedback
    const aiFeedback = await this.aiService.generateFeedback({
      taskInstructions: activity.instructions,
      expectedOutcome: intervention?.expectedOutcome || 'Complete the task as instructed',
      studentSubmission: submission.textContent,
      yearGroup: profile?.yearGroup?.displayName || 'Student',
      subject: activity.subject.displayName,
      skill: activity.skill.displayName,
      band: studentBand?.currentBand || 'DEVELOPING',
    });

    // Update submission
    return this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        aiFeedback,
        feedbackGeneratedAt: new Date(),
      },
    });
  }
}
