import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ParseNCDocumentDto } from './dto/bulk-import.dto';

@ApiTags('Curriculum Management')
@Controller('curriculum')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'TEACHER')
@ApiBearerAuth()
export class CurriculumManagementController {
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

  // ============================================
  // CURRICULUM TOPICS
  // ============================================

  @Get('topics')
  @ApiOperation({ summary: 'Get all curriculum topics' })
  async getTopics(
    @Query('yearGroupId') yearGroupId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('keyStage') keyStage?: string,
  ) {
    const where: any = {};
    if (yearGroupId) where.yearGroupId = yearGroupId;
    if (subjectId) where.subjectId = subjectId;
    if (keyStage) where.keyStage = keyStage;

    const topics = await this.prisma.curriculumTopic.findMany({
      where,
      include: {
        yearGroup: true,
        subject: true,
        supercurriculumActivities: {
          select: {
            id: true,
            title: true,
            teacherApproved: true,
            curriculumAlignment: true,
          },
        },
      },
      orderBy: { topicName: 'asc' },
    });

    return topics;
  }

  @Get('topics/:id')
  @ApiOperation({ summary: 'Get curriculum topic by ID' })
  async getTopic(@Param('id') id: string) {
    return this.prisma.curriculumTopic.findUnique({
      where: { id },
      include: {
        yearGroup: true,
        subject: true,
        supercurriculumActivities: true,
      },
    });
  }

  @Post('topics')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create curriculum topic (Admin only)' })
  async createTopic(@Body() data: any) {
    return this.prisma.curriculumTopic.create({
      data: {
        yearGroupId: data.yearGroupId,
        subjectId: data.subjectId,
        topicName: data.topicName,
        keyStage: data.keyStage,
        learningObjectives: data.learningObjectives || [],
        nationalCurriculumRef: data.nationalCurriculumRef,
        coreContent: data.coreContent,
        extendedContent: data.extendedContent,
        keySkills: data.keySkills || [],
        priorKnowledge: data.priorKnowledge || [],
      },
      include: {
        yearGroup: true,
        subject: true,
      },
    });
  }

  @Put('topics/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update curriculum topic (Admin only)' })
  async updateTopic(@Param('id') id: string, @Body() data: any) {
    return this.prisma.curriculumTopic.update({
      where: { id },
      data: {
        topicName: data.topicName,
        keyStage: data.keyStage,
        learningObjectives: data.learningObjectives,
        nationalCurriculumRef: data.nationalCurriculumRef,
        coreContent: data.coreContent,
        extendedContent: data.extendedContent,
        keySkills: data.keySkills,
        priorKnowledge: data.priorKnowledge,
      },
    });
  }

  @Delete('topics/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete curriculum topic (Admin only)' })
  async deleteTopic(@Param('id') id: string) {
    return this.prisma.curriculumTopic.delete({ where: { id } });
  }

  // ============================================
  // SUPERCURRICULUM ACTIVITIES
  // ============================================

  @Get('activities')
  @ApiOperation({ summary: 'Get supercurriculum activities' })
  async getActivities(
    @Query('topicId') topicId?: string,
    @Query('teacherApproved') teacherApproved?: string,
    @Query('generatedBy') generatedBy?: string,
    @Query('minAlignment') minAlignment?: string,
  ) {
    const where: any = {};
    if (topicId) where.curriculumTopicId = topicId;
    if (teacherApproved !== undefined) {
      where.teacherApproved = teacherApproved === 'true';
    }
    if (generatedBy) where.generatedBy = generatedBy;
    if (minAlignment) {
      where.curriculumAlignment = { gte: parseInt(minAlignment) };
    }

    const activities = await this.prisma.supercurriculumActivity.findMany({
      where,
      include: {
        curriculumTopic: {
          include: {
            yearGroup: true,
            subject: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return activities;
  }

  @Get('activities/pending')
  @ApiOperation({ summary: 'Get pending activities for review' })
  async getPendingActivities() {
    return this.prisma.supercurriculumActivity.findMany({
      where: { teacherApproved: false },
      include: {
        curriculumTopic: {
          include: {
            yearGroup: true,
            subject: true,
          },
        },
      },
      orderBy: { curriculumAlignment: 'desc' },
    });
  }

  @Get('activities/:id')
  @ApiOperation({ summary: 'Get activity by ID' })
  async getActivity(@Param('id') id: string) {
    return this.prisma.supercurriculumActivity.findUnique({
      where: { id },
      include: {
        curriculumTopic: {
          include: {
            yearGroup: true,
            subject: true,
          },
        },
      },
    });
  }

  @Post('activities')
  @ApiOperation({ summary: 'Create supercurriculum activity' })
  async createActivity(@Body() data: any) {
    return this.prisma.supercurriculumActivity.create({
      data: {
        curriculumTopicId: data.curriculumTopicId,
        title: data.title,
        description: data.description,
        instructions: data.instructions,
        successCriteria: data.successCriteria,
        extensionLevel: data.extensionLevel,
        curriculumAlignment: data.curriculumAlignment || 0,
        generatedBy: data.generatedBy || 'TEACHER',
        teacherApproved: data.teacherApproved || false,
      },
    });
  }

  @Put('activities/:id')
  @ApiOperation({ summary: 'Update activity' })
  async updateActivity(@Param('id') id: string, @Body() data: any) {
    return this.prisma.supercurriculumActivity.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        instructions: data.instructions,
        successCriteria: data.successCriteria,
        extensionLevel: data.extensionLevel,
        curriculumAlignment: data.curriculumAlignment,
        teacherApproved: data.teacherApproved,
      },
    });
  }

  @Put('activities/:id/approve')
  @ApiOperation({ summary: 'Approve activity' })
  async approveActivity(@Param('id') id: string) {
    return this.prisma.supercurriculumActivity.update({
      where: { id },
      data: { teacherApproved: true },
    });
  }

  @Put('activities/bulk/approve')
  @ApiOperation({ summary: 'Bulk approve multiple activities' })
  async bulkApproveActivities(@Body() data: { ids: string[] }) {
    if (!data.ids || data.ids.length === 0) {
      throw new BadRequestException('No activity IDs provided');
    }

    const result = await this.prisma.supercurriculumActivity.updateMany({
      where: { id: { in: data.ids } },
      data: { teacherApproved: true },
    });

    return {
      success: true,
      message: `Approved ${result.count} activities`,
      count: result.count,
    };
  }

  @Put('activities/bulk/reject')
  @ApiOperation({ summary: 'Bulk reject multiple activities' })
  async bulkRejectActivities(@Body() data: { ids: string[] }) {
    if (!data.ids || data.ids.length === 0) {
      throw new BadRequestException('No activity IDs provided');
    }

    const result = await this.prisma.supercurriculumActivity.deleteMany({
      where: { id: { in: data.ids } },
    });

    return {
      success: true,
      message: `Rejected ${result.count} activities`,
      count: result.count,
    };
  }

  @Put('activities/:id/reject')
  @ApiOperation({ summary: 'Reject activity' })
  async rejectActivity(@Param('id') id: string) {
    return this.prisma.supercurriculumActivity.delete({ where: { id } });
  }

  @Delete('activities/:id')
  @ApiOperation({ summary: 'Delete activity' })
  async deleteActivity(@Param('id') id: string) {
    return this.prisma.supercurriculumActivity.delete({ where: { id } });
  }

  // ============================================
  // CURRICULUM STANDARDS
  // ============================================

  @Get('standards')
  @ApiOperation({ summary: 'Get curriculum standards' })
  async getStandards(
    @Query('keyStage') keyStage?: string,
    @Query('subjectId') subjectId?: string,
  ) {
    const where: any = {};
    if (keyStage) where.keyStage = keyStage;
    if (subjectId) where.subjectId = subjectId;

    return this.prisma.curriculumStandard.findMany({
      where,
      include: { subject: true },
      orderBy: { standardCode: 'asc' },
    });
  }

  @Post('standards')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create curriculum standard (Admin only)' })
  async createStandard(@Body() data: any) {
    return this.prisma.curriculumStandard.create({
      data: {
        standardCode: data.standardCode,
        keyStage: data.keyStage,
        subjectId: data.subjectId,
        standardText: data.standardText,
        assessmentCriteria: data.assessmentCriteria || {},
      },
    });
  }

  // ============================================
  // DASHBOARD & ANALYTICS
  // ============================================

  @Get('coverage')
  @ApiOperation({ summary: 'Get curriculum coverage statistics' })
  async getCoverage() {
    const totalTopics = await this.prisma.curriculumTopic.count();
    const topicsWithActivities = await this.prisma.curriculumTopic.count({
      where: {
        supercurriculumActivities: {
          some: { teacherApproved: true },
        },
      },
    });

    const coveragePercent = totalTopics > 0
      ? ((topicsWithActivities / totalTopics) * 100).toFixed(1)
      : '0';

    const totalActivities = await this.prisma.supercurriculumActivity.count();
    const approvedActivities = await this.prisma.supercurriculumActivity.count({
      where: { teacherApproved: true },
    });
    const pendingActivities = totalActivities - approvedActivities;

    const activityDistribution = await this.prisma.curriculumTopic.findMany({
      include: {
        yearGroup: true,
        subject: true,
        _count: {
          select: {
            supercurriculumActivities: {
              where: { teacherApproved: true },
            },
          },
        },
      },
      orderBy: {
        supercurriculumActivities: {
          _count: 'desc',
        },
      },
      take: 10,
    });

    const gapsInContent = await this.prisma.curriculumTopic.findMany({
      where: {
        supercurriculumActivities: {
          none: {},
        },
      },
      include: {
        yearGroup: true,
        subject: true,
      },
      take: 20,
    });

    return {
      totalTopics,
      topicsWithActivities,
      coveragePercent,
      totalActivities,
      approvedActivities,
      pendingActivities,
      activityDistribution,
      gapsInContent,
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get curriculum statistics by year and subject' })
  async getStats() {
    // Topics by year group
    const topicsByYear = await this.prisma.yearGroup.findMany({
      include: {
        _count: {
          select: { curriculumTopics: true },
        },
      },
      orderBy: { orderIndex: 'asc' },
    });

    // Topics by subject
    const topicsBySubject = await this.prisma.subject.findMany({
      include: {
        _count: {
          select: { curriculumTopics: true },
        },
      },
    });

    // Average alignment scores
    const alignmentStats = await this.prisma.supercurriculumActivity.aggregate({
      _avg: { curriculumAlignment: true },
      _min: { curriculumAlignment: true },
      _max: { curriculumAlignment: true },
    });

    return {
      topicsByYear,
      topicsBySubject,
      alignmentStats,
    };
  }

  // ============================================
  // BULK IMPORT TOOLS
  // ============================================

  @Post('import/csv')
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Bulk import topics from CSV (Admin only)' })
  async importCSV(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const csvContent = file.buffer.toString('utf-8');
    const lines = csvContent.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Parse CSV and create topics
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;

      try {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });

        // Parse arrays from CSV
        const learningObjectives = row.learningObjectives 
          ? row.learningObjectives.split('|').map((s: string) => s.trim())
          : [];
        const keySkills = row.keySkills 
          ? row.keySkills.split('|').map((s: string) => s.trim())
          : [];
        const priorKnowledge = row.priorKnowledge 
          ? row.priorKnowledge.split('|').map((s: string) => s.trim())
          : [];

        await this.prisma.curriculumTopic.create({
          data: {
            topicName: row.topicName,
            yearGroupId: row.yearGroupId,
            subjectId: row.subjectId,
            keyStage: row.keyStage,
            nationalCurriculumRef: row.nationalCurriculumRef || null,
            coreContent: row.coreContent || null,
            extendedContent: row.extendedContent || null,
            learningObjectives,
            keySkills,
            priorKnowledge,
          },
        });

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }

    return results;
  }

  @Post('import/json')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Bulk import topics from JSON (Admin only)' })
  async importJSON(@Body() data: { topics: any[] }) {
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const topic of data.topics) {
      try {
        await this.prisma.curriculumTopic.create({
          data: {
            topicName: topic.topicName,
            yearGroupId: topic.yearGroupId,
            subjectId: topic.subjectId,
            keyStage: topic.keyStage,
            nationalCurriculumRef: topic.nationalCurriculumRef || null,
            coreContent: topic.coreContent || null,
            extendedContent: topic.extendedContent || null,
            learningObjectives: topic.learningObjectives || [],
            keySkills: topic.keySkills || [],
            priorKnowledge: topic.priorKnowledge || [],
          },
        });
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`${topic.topicName}: ${error.message}`);
      }
    }

    return results;
  }

  @Post('parse/nc-document')
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Parse National Curriculum document with AI' })
  async parseNCDocument(@Body() dto: ParseNCDocumentDto) {
    if (!this.openai) {
      throw new BadRequestException('OpenAI API key not configured');
    }

    const prompt = `You are an expert in the UK National Curriculum. Extract curriculum topics from the following document.

Document:
${dto.documentText}

${dto.keyStage ? `Key Stage: ${dto.keyStage}` : ''}
${dto.yearGroupId ? `Year Group ID: ${dto.yearGroupId}` : ''}
${dto.subjectId ? `Subject ID: ${dto.subjectId}` : ''}

Extract topics and return as a JSON array with this structure:
{
  "topics": [
    {
      "topicName": "Topic name",
      "learningObjectives": ["objective 1", "objective 2"],
      "coreContent": "Core content description",
      "extendedContent": "Extended content description",
      "keySkills": ["skill 1", "skill 2"],
      "priorKnowledge": ["knowledge 1", "knowledge 2"],
      "nationalCurriculumRef": "NC reference code if available"
    }
  ]
}

Extract ALL topics you can identify. Be comprehensive.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-5.5',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in UK National Curriculum analysis. Extract curriculum topics in structured JSON format.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const parsed = JSON.parse(response.choices[0].message.content);
      
      // Add yearGroupId, subjectId, keyStage to each topic if provided
      if (parsed.topics) {
        parsed.topics = parsed.topics.map((topic: any) => ({
          ...topic,
          yearGroupId: dto.yearGroupId || null,
          subjectId: dto.subjectId || null,
          keyStage: dto.keyStage || 'KS3',
        }));
      }

      return {
        success: true,
        topics: parsed.topics || [],
        message: `Extracted ${parsed.topics?.length || 0} topics from document`,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        topics: [],
      };
    }
  }

  @Get('export/template')
  @ApiOperation({ summary: 'Download CSV template for bulk import' })
  async getCSVTemplate() {
    const template = `topicName,yearGroupId,subjectId,keyStage,nationalCurriculumRef,coreContent,extendedContent,learningObjectives,keySkills,priorKnowledge
"Photosynthesis","year-7-id","science-id","KS3","NC-KS3-SCI-02","Plants make food using light energy","Advanced cellular processes","Understand photosynthesis|Identify reactants and products|Explain role of chlorophyll","Scientific investigation|Data analysis|Drawing conclusions","Plant structure|Basic chemistry|Energy transfer"
"Fractions","year-6-id","maths-id","KS2","NC-KS2-MAT-05","Understanding parts of a whole","Complex fraction operations","Identify fractions|Compare fractions|Add and subtract fractions","Problem solving|Mathematical reasoning","Place value|Division concepts"`;

    return {
      template,
      instructions: [
        'Use pipe (|) to separate multiple items in arrays',
        'Replace year-7-id, science-id with actual UUIDs from your database',
        'keyStage must be: KS2, KS3, KS4, or KS5',
        'Wrap values with commas in double quotes',
      ],
    };
  }
}

