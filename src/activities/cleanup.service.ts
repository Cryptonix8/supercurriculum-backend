import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Delete all activities from database
   */
  async deleteAllActivities() {
    const count = await this.prisma.activity.count();
    
    // Delete all activities (cascade will handle related records)
    await this.prisma.activity.deleteMany({});
    
    this.logger.log(`Deleted ${count} activities from database`);
    
    return {
      success: true,
      deletedCount: count,
      message: `Successfully deleted ${count} activities from the database`,
    };
  }

  /**
   * Delete all curriculum data created by curriculum-parser
   * This includes: subjects, skills, topics (but keeps Years 5-13)
   */
  async deleteCurriculumData() {
    // Delete curriculum topics first (they reference subjects)
    const topicsCount = await this.prisma.curriculumTopic.count();
    await this.prisma.curriculumTopic.deleteMany({});
    this.logger.log(`Deleted ${topicsCount} curriculum topics`);

    // Delete skills (they reference subjects)
    const skillsCount = await this.prisma.skill.count();
    await this.prisma.skill.deleteMany({});
    this.logger.log(`Deleted ${skillsCount} skills`);

    // Delete subjects (but keep year groups)
    const subjectsCount = await this.prisma.subject.count();
    await this.prisma.subject.deleteMany({});
    this.logger.log(`Deleted ${subjectsCount} subjects`);

    // Delete year groups outside Years 5-13 (if any exist and not referenced by student profiles)
    const invalidYearGroups = await this.prisma.yearGroup.findMany({
      where: {
        NOT: {
          name: {
            in: ['year_5', 'year_6', 'year_7', 'year_8', 'year_9', 'year_10', 'year_11', 'year_12', 'year_13'],
          },
        },
      },
    });
    
    let invalidYearsCount = 0;
    let skippedYearsCount = 0;
    if (invalidYearGroups.length > 0) {
      // Check which year groups are referenced by student profiles
      const yearGroupsInUse = await this.prisma.studentProfile.findMany({
        where: {
          yearGroupId: {
            in: invalidYearGroups.map(yg => yg.id),
          },
        },
        select: {
          yearGroupId: true,
        },
        distinct: ['yearGroupId'],
      });
      
      const inUseIds = new Set(yearGroupsInUse.map(sp => sp.yearGroupId));
      const deletableYearGroups = invalidYearGroups.filter(yg => !inUseIds.has(yg.id));
      const skippedYearGroups = invalidYearGroups.filter(yg => inUseIds.has(yg.id));
      
      if (skippedYearGroups.length > 0) {
        skippedYearsCount = skippedYearGroups.length;
        this.logger.warn(
          `Skipped ${skippedYearsCount} invalid year groups (outside Years 5-13) because they are referenced by student profiles: ${skippedYearGroups.map(yg => yg.displayName || yg.name).join(', ')}`
        );
      }
      
      if (deletableYearGroups.length > 0) {
        // Delete subjects linked to deletable year groups first
        await this.prisma.subject.deleteMany({
          where: {
            yearGroupId: {
              in: deletableYearGroups.map(yg => yg.id),
            },
          },
        });
        
        // Then delete deletable year groups
        invalidYearsCount = deletableYearGroups.length;
        await this.prisma.yearGroup.deleteMany({
          where: {
            id: {
              in: deletableYearGroups.map(yg => yg.id),
            },
          },
        });
        this.logger.log(`Deleted ${invalidYearsCount} invalid year groups (outside Years 5-13)`);
      }
    }

    // Note: We keep Years 5-13 as they are required by the system

    const message = skippedYearsCount > 0
      ? `Deleted ${topicsCount} topics, ${skillsCount} skills, ${subjectsCount} subjects, and ${invalidYearsCount} invalid year groups. Skipped ${skippedYearsCount} year groups in use by students. Years 5-13 are preserved.`
      : `Deleted ${topicsCount} topics, ${skillsCount} skills, ${subjectsCount} subjects, and ${invalidYearsCount} invalid year groups. Years 5-13 are preserved.`;

    return {
      success: true,
      deleted: {
        topics: topicsCount,
        skills: skillsCount,
        subjects: subjectsCount,
        invalidYearGroups: invalidYearsCount,
        skippedYearGroups: skippedYearsCount,
      },
      message,
    };
  }

  /**
   * Delete all data (activities + curriculum data + invalid year groups)
   * WARNING: This will delete everything except Years 5-13
   */
  async deleteAllData() {
    const results = {
      activities: 0,
      topics: 0,
      skills: 0,
      subjects: 0,
      invalidYearGroups: 0,
    };

    // Delete activities
    results.activities = await this.prisma.activity.count();
    await this.prisma.activity.deleteMany({});
    this.logger.log(`Deleted ${results.activities} activities`);

    // Delete curriculum topics
    results.topics = await this.prisma.curriculumTopic.count();
    await this.prisma.curriculumTopic.deleteMany({});
    this.logger.log(`Deleted ${results.topics} curriculum topics`);

    // Delete skills
    results.skills = await this.prisma.skill.count();
    await this.prisma.skill.deleteMany({});
    this.logger.log(`Deleted ${results.skills} skills`);

    // Delete subjects
    results.subjects = await this.prisma.subject.count();
    await this.prisma.subject.deleteMany({});
    this.logger.log(`Deleted ${results.subjects} subjects`);

    // Delete year groups outside Years 5-13 (if any exist and not referenced by student profiles)
    const invalidYearGroups = await this.prisma.yearGroup.findMany({
      where: {
        NOT: {
          name: {
            in: ['year_5', 'year_6', 'year_7', 'year_8', 'year_9', 'year_10', 'year_11', 'year_12', 'year_13'],
          },
        },
      },
    });
    
    let skippedYearsCount = 0;
    if (invalidYearGroups.length > 0) {
      // Check which year groups are referenced by student profiles
      const yearGroupsInUse = await this.prisma.studentProfile.findMany({
        where: {
          yearGroupId: {
            in: invalidYearGroups.map(yg => yg.id),
          },
        },
        select: {
          yearGroupId: true,
        },
        distinct: ['yearGroupId'],
      });
      
      const inUseIds = new Set(yearGroupsInUse.map(sp => sp.yearGroupId));
      const deletableYearGroups = invalidYearGroups.filter(yg => !inUseIds.has(yg.id));
      const skippedYearGroups = invalidYearGroups.filter(yg => inUseIds.has(yg.id));
      
      if (skippedYearGroups.length > 0) {
        skippedYearsCount = skippedYearGroups.length;
        this.logger.warn(
          `Skipped ${skippedYearsCount} invalid year groups (outside Years 5-13) because they are referenced by student profiles: ${skippedYearGroups.map(yg => yg.displayName || yg.name).join(', ')}`
        );
      }
      
      if (deletableYearGroups.length > 0) {
        results.invalidYearGroups = deletableYearGroups.length;
        await this.prisma.yearGroup.deleteMany({
          where: {
            id: {
              in: deletableYearGroups.map(yg => yg.id),
            },
          },
        });
        this.logger.log(`Deleted ${results.invalidYearGroups} invalid year groups (outside Years 5-13)`);
      }
    }

    // Note: Years 5-13 are preserved as they are system-required

    const message = skippedYearsCount > 0
      ? `Deleted all data: ${results.activities} activities, ${results.topics} topics, ${results.skills} skills, ${results.subjects} subjects, ${results.invalidYearGroups} invalid year groups. Skipped ${skippedYearsCount} year groups in use by students. Years 5-13 are preserved.`
      : `Deleted all data: ${results.activities} activities, ${results.topics} topics, ${results.skills} skills, ${results.subjects} subjects, ${results.invalidYearGroups} invalid year groups. Years 5-13 are preserved.`;

    return {
      success: true,
      deleted: {
        ...results,
        skippedYearGroups: skippedYearsCount,
      },
      message,
    };
  }

  /**
   * Get statistics about current data
   */
  async getDataStatistics() {
    const [activities, subjects, skills, topics, yearGroups] = await Promise.all([
      this.prisma.activity.count(),
      this.prisma.subject.count(),
      this.prisma.skill.count(),
      this.prisma.curriculumTopic.count(),
      this.prisma.yearGroup.count({
        where: {
          name: {
            in: ['year_5', 'year_6', 'year_7', 'year_8', 'year_9', 'year_10', 'year_11', 'year_12', 'year_13'],
          },
        },
      }),
    ]);

    return {
      activities,
      subjects,
      skills,
      topics,
      yearGroups: {
        total: yearGroups,
        note: 'Years 5-13 are system-required and preserved',
      },
    };
  }
}
