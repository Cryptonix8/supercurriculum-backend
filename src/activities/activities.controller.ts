import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { ActivityPdfParserService } from './activity-pdf-parser.service';
import { CleanupService } from './cleanup.service';
import { ActivitiesService } from './activities.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

@ApiTags('Activities')
@Controller('activities')
export class ActivitiesController {
  constructor(
    private readonly activityPdfParserService: ActivityPdfParserService,
    private readonly cleanupService: CleanupService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  @Post('generate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate activities from Year PDFs (year5.pdf - year13.pdf)',
    description: `THE MAIN API FOR GENERATING ACTIVITIES.

Upload one or more Year PDFs (year5.pdf through year13.pdf) to generate activities. The system will:
1. Extract text from each Year PDF (provides STRUCTURE/template)
2. For Years 5-11: Automatically find the corresponding Primary/Secondary curriculum PDF (provides CONTENT)
3. For Years 12-13: Use web search to get current curriculum content (curriculum PDFs only cover Years 1-11)
4. Use AI to extract activities using content from the appropriate source
5. Create subjects and skills if they don't exist
6. Generate activities in the database
7. Support automated updates: Re-upload updated PDFs to refresh activities automatically

SOURCE POLICY:
- Years 5-11: Year PDF (structure) + Curriculum PDF (content) = PRIMARY sources
- Years 12-13: Year PDF (structure) + Web search (content) = PRIMARY sources
- Web sources are cited in resources.links

AUTOMATED UPDATES: Simply re-upload updated PDFs - system will regenerate activities automatically.

File naming: 
- Year PDF: "year5.pdf", "year6.pdf", ..., "year13.pdf"
- Curriculum PDF (Years 5-11 only): Must be "primary.pdf" or "secondary.pdf" in docs/ folder (auto-detected)

The AI uses the Year PDF for structure/style and the appropriate content source (PDF for Years 5-11, web for Years 12-13).

Query params: useVision=true for GPT-4 Vision extraction (formulas, graphs, diagrams) from curriculum PDF. English curriculum only.

You can upload multiple Year PDFs at once to process them in a single request.`,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
          description: 'One or more Year PDF files (year5.pdf through year13.pdf). You can select multiple files.',
        },
      },
      required: ['files'],
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 20, { // Allow up to 20 files
      storage: undefined, // Use memory storage
      fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only PDF files are allowed'), false);
        }
      },
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit per file
        files: 20, // Maximum number of files
      },
    }),
  )
  async generateActivitiesFromPdf(
    @UploadedFiles() files: Express.Multer.File[],
    @Query('useVision') useVision?: string,
    @Query('locale') locale?: string,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded. Please upload at least one Year PDF file.');
    }

    // Validate all filenames
    const invalidFiles: string[] = [];
    const fileResults: any[] = [];
    let totalGenerated = 0;
    let totalSkipped = 0;
    const allErrors: string[] = [];

    for (const file of files) {
      // Validate filename format
      const yearNumber = this.activityPdfParserService.extractYearFromFilename(file.originalname);
      if (!yearNumber || yearNumber < 5 || yearNumber > 13) {
        invalidFiles.push(file.originalname);
        allErrors.push(`Invalid filename: ${file.originalname}. Expected format: year5.pdf, year6.pdf, ..., year13.pdf`);
        continue;
      }

      try {
        const result = await this.activityPdfParserService.generateActivitiesFromPdf(
          file.buffer,
          file.originalname,
          {
            useVision: useVision === 'true' || useVision === '1',
            locale: locale || undefined,
          },
        );

        totalGenerated += result.generated;
        totalSkipped += result.skipped;
        allErrors.push(...(result.errors || []));

        fileResults.push({
          filename: file.originalname,
          yearNumber,
          generated: result.generated,
          skipped: result.skipped,
          errors: result.errors || [],
          success: true,
        });
      } catch (error: any) {
        allErrors.push(`${file.originalname}: ${error.message}`);
        fileResults.push({
          filename: file.originalname,
          yearNumber: yearNumber || null,
          generated: 0,
          skipped: 0,
          errors: [error.message],
          success: false,
        });
      }
    }

    if (invalidFiles.length > 0) {
      allErrors.push(
        `Invalid filenames: ${invalidFiles.join(', ')}. Expected format: year5.pdf, year6.pdf, ..., year13.pdf`
      );
    }

    return {
      success: invalidFiles.length === 0 && allErrors.length === 0,
      totalFiles: files.length,
      processedFiles: fileResults.length,
      totalGenerated,
      totalSkipped,
      results: fileResults,
      errors: allErrors,
      message: `Processed ${fileResults.length} file(s): ${totalGenerated} activities generated, ${totalSkipped} skipped/updated. ${allErrors.length > 0 ? `${allErrors.length} error(s) occurred.` : ''}`,
    };
  }

  @Delete('cleanup/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete all activities and curriculum data (cleanup)',
    description: `WARNING: This will delete ALL activities, subjects, skills, and topics from the database.
    
Years 5-13 are preserved as they are system-required.

Use this to clean up old data before regenerating from PDFs.`,
  })
  async deleteAllData() {
    return this.cleanupService.deleteAllData();
  }

  @Delete('cleanup/activities')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete all activities only',
    description: 'Deletes all activities but keeps subjects, skills, and topics.',
  })
  async deleteAllActivities() {
    return this.cleanupService.deleteAllActivities();
  }

  @Delete('cleanup/curriculum')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete curriculum data (subjects, skills, topics)',
    description: 'Deletes all subjects, skills, and topics created by curriculum-parser. Keeps activities and Years 5-13.',
  })
  async deleteCurriculumData() {
    return this.cleanupService.deleteCurriculumData();
  }

  @Get('cleanup/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get data statistics',
    description: 'Get counts of activities, subjects, skills, topics, and year groups in the database.',
  })
  async getDataStatistics() {
    return this.cleanupService.getDataStatistics();
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'TEACHER', 'STUDENT')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all activities',
    description: 'Get a list of all activities with optional filters.',
  })
  async findAll(
    @Query('subjectId') subjectId?: string,
    @Query('skillId') skillId?: string,
    @Query('difficulty') difficulty?: string,
    @Query('activityType') activityType?: string,
    @Query('yearGroupId') yearGroupId?: string,
    @Query('locale') locale?: string,
    @Query('curriculumTopicId') curriculumTopicId?: string,
    @Query('chapterName') chapterName?: string,
  ) {
    const filters: any = {};
    if (subjectId) filters.subjectId = subjectId;
    if (skillId) filters.skillId = skillId;
    if (difficulty) filters.difficulty = difficulty;
    if (activityType) filters.activityType = activityType;
    if (yearGroupId) filters.yearGroupId = yearGroupId;
    if (locale) filters.locale = locale;
    if (curriculumTopicId) filters.curriculumTopicId = curriculumTopicId;
    if (chapterName) filters.chapterName = chapterName;

    return this.activitiesService.findAll(Object.keys(filters).length > 0 ? filters : undefined);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create activity',
    description: 'Create a new activity.',
  })
  async create(@Body() createActivityDto: CreateActivityDto) {
    return this.activitiesService.create(createActivityDto);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'TEACHER', 'STUDENT')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get activity by ID',
    description: 'Get a single activity by its ID.',
  })
  async findOne(@Param('id') id: string) {
    return this.activitiesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update activity',
    description: 'Update an existing activity.',
  })
  async update(@Param('id') id: string, @Body() updateActivityDto: UpdateActivityDto) {
    return this.activitiesService.update(id, updateActivityDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete activity',
    description: 'Soft delete an activity by setting isActive to false.',
  })
  async remove(@Param('id') id: string) {
    return this.activitiesService.remove(id);
  }
}
