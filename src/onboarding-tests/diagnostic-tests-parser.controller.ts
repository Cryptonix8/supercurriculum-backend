import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Param,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ConfigService } from '@nestjs/config';
import { QuestionnaireParserService } from './questionnaire-parser.service';
import { resolveFromBackendRoot } from '../project-paths';
import * as fs from 'fs';
import * as path from 'path';

@ApiTags('Diagnostic Tests PDF Parser')
@Controller('diagnostic-tests-parser')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class DiagnosticTestsParserController {
  private readonly logger = new Logger(DiagnosticTestsParserController.name);

  constructor(
    private readonly questionnaireParserService: QuestionnaireParserService,
    private readonly config: ConfigService,
  ) {}

  /** Resolve docs directory: en-GB -> DOCS_BASE_PATH/DOCS_EN_FOLDER (default el-EN), el-GR -> DOCS_BASE_PATH/DOCS_EL_FOLDER (default el-GR). */
  private getDocsDir(locale?: 'en-GB' | 'el-GR'): string {
    const base = this.config.get<string>('DOCS_BASE_PATH') || 'docs';
    const baseResolved = resolveFromBackendRoot(base);
    if (locale === 'el-GR') {
      const elFolder = this.config.get<string>('DOCS_EL_FOLDER') || 'el-GR';
      return path.join(baseResolved, elFolder);
    }
    const enFolder = this.config.get<string>('DOCS_EN_FOLDER') || this.config.get<string>('DOCS_EN_LOCALE_SUBFOLDER') || 'el-EN';
    return path.join(baseResolved, enFolder);
  }

  @Post('upload')
  @ApiOperation({ 
    summary: 'Upload and analyze a diagnostic test or questionnaire PDF',
    description: `Upload a PDF file. The system will extract text and parse questions by year groups.
    
IMPORTANT FILE STRUCTURE:
- Diagnostic tests.pdf: ONLY file used for Part B diagnostic tests. Contains ALL diagnostic test questions for years 5-13 (single file with all years).
- Year5.pdf, Year6.pdf, ... Year13.pdf: Used for curriculum topic setup and Part A questionnaires (one file per year). These are NOT diagnostic tests.
- General Questionnaires.pdf: Fallback questionnaire file if year-specific PDF doesn't exist.

The system automatically detects the file type based on filename and saves it with the appropriate name.`
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'PDF file to upload. Use "Diagnostic tests.pdf" for Part B diagnostic tests. Use "year5.pdf", "year6.pdf", etc. for questionnaires/curriculum setup (NOT diagnostic tests).',
        },
        yearNumber: {
          type: 'number',
          description: 'Optional: Year number for year-specific PDFs (5-13). If not provided, will try to detect from filename or parse all years.',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      // Use memory storage to avoid file lock issues on Windows
      storage: undefined, // undefined means use memory storage
      fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only PDF files are allowed'), false);
        }
      },
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
      },
    }),
  )
  async uploadAndAnalyze(
    @UploadedFile() file: Express.Multer.File,
    @Body('yearNumber') yearNumber?: string,
    @Body('locale') locale?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    try {
      const effectiveLocale = locale === 'el-GR' ? 'el-GR' : 'en-GB';
      const fileName = file.originalname.toLowerCase();
      const isDiagnosticTest = fileName.includes('diagnostic') && !/year\d+\.pdf/i.test(fileName);
      const isQuestionnaire = fileName.includes('questionnaire') || fileName.includes('general');
      const isYearSpecific = /year\d+\.pdf/i.test(fileName);

      let parsedYearNumber: number | undefined;
      if (yearNumber) {
        parsedYearNumber = parseInt(yearNumber, 10);
      } else if (isYearSpecific) {
        const yearMatch = fileName.match(/year(\d+)/i);
        if (yearMatch) parsedYearNumber = parseInt(yearMatch[1], 10);
      }

      const docsDir = this.getDocsDir(effectiveLocale === 'el-GR' ? 'el-GR' : 'en-GB');
      if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
      }

      let targetFilePath: string;
      if (isDiagnosticTest) {
        targetFilePath = path.join(docsDir, 'Diagnostic tests.pdf');
      } else if (isYearSpecific && parsedYearNumber) {
        targetFilePath = path.join(docsDir, `year${parsedYearNumber}.pdf`);
      } else if (isQuestionnaire) {
        targetFilePath = path.join(docsDir, 'General Questionnaires.pdf');
      } else {
        targetFilePath = path.join(docsDir, 'General Questionnaires.pdf');
      }

      // Copy uploaded file to docs folder with appropriate name
      // File is in memory (buffer) since we're using memory storage
      try {
        if (!file.buffer) {
          throw new BadRequestException('File buffer is missing. Please ensure the file was uploaded correctly.');
        }
        
        // If target file exists and might be locked, try to delete it first
        if (fs.existsSync(targetFilePath)) {
          try {
            fs.unlinkSync(targetFilePath);
            // Small delay to ensure file is fully released on Windows
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (unlinkError) {
            // If we can't delete, try to overwrite anyway
            this.logger.warn(`Could not delete existing file ${targetFilePath}, will attempt to overwrite`);
          }
        }
        
        // Write file buffer directly to target location
        fs.writeFileSync(targetFilePath, file.buffer);
        this.logger.log(`Successfully saved uploaded file to ${targetFilePath}`);
      } catch (copyError: any) {
        // If copy fails, log error and throw
        this.logger.error(`Error saving file to ${targetFilePath}: ${copyError.message}`);
        throw new BadRequestException(`Failed to save file: ${copyError.message}. The file might be open in another program. Please close any programs that have the file open and try again.`);
      }

      // Clear cache to force re-parsing
      this.questionnaireParserService.clearCache();

      const parseYears = effectiveLocale === 'el-GR' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [5, 6, 7, 8, 9, 10, 11, 12, 13];
      let extracted: any;
      if (isDiagnosticTest) {
        if (parsedYearNumber) {
          extracted = await this.questionnaireParserService.getDiagnosticTestForYear(parsedYearNumber, effectiveLocale);
        } else {
          const allYears: any = {};
          for (const year of parseYears) {
            try {
              const yearData = await this.questionnaireParserService.getDiagnosticTestForYear(year, effectiveLocale);
              if (yearData && ((yearData.sections && yearData.sections.length > 0) || (yearData.questions && yearData.questions.length > 0))) {
                allYears[year] = yearData;
              }
            } catch (error) {
              console.error(`Error parsing Year ${year}:`, error);
            }
          }
          extracted = { years: allYears };
        }
      } else {
        if (parsedYearNumber) {
          extracted = await this.questionnaireParserService.getQuestionnaireForYear(parsedYearNumber, effectiveLocale);
        } else {
          const allYears: any = {};
          for (const year of parseYears) {
            try {
              const yearData = await this.questionnaireParserService.getQuestionnaireForYear(year, effectiveLocale);
              if (yearData && ((yearData.sections && yearData.sections.length > 0) || (yearData.questions && yearData.questions.length > 0))) {
                allYears[year] = yearData;
              }
            } catch (error) {
              console.error(`Error parsing Year ${year}:`, error);
            }
          }
          extracted = { years: allYears };
        }
      }

      // No need to clean up - file was in memory, not on disk

      // Calculate statistics
      const stats = this.calculateStats(extracted);

      return {
        success: true,
        message: 'PDF analyzed and saved successfully',
        fileName: file.originalname,
        savedAs: path.basename(targetFilePath),
        savedPath: targetFilePath,
        fileType: isDiagnosticTest ? 'diagnostic' : isQuestionnaire ? 'questionnaire' : 'unknown',
        yearNumber: parsedYearNumber,
        extracted: stats,
        data: extracted,
      };
    } catch (error) {
      // No need to clean up - file was in memory, not on disk
      throw new BadRequestException(`Failed to process PDF: ${error.message}`);
    }
  }

  @Get('preview-existing')
  @ApiOperation({ 
    summary: 'List available PDFs for processing',
    description: 'List all diagnostic test and questionnaire PDF files in the docs folder.'
  })
  async listExistingPdfs(@Query('locale') locale?: string) {
    const base = this.config.get<string>('DOCS_BASE_PATH') || 'docs';
    const basePath = resolveFromBackendRoot(base);
    const dirsToScan: { path: string; locale: string }[] =
      locale === 'el-GR'
        ? [{ path: this.getDocsDir('el-GR'), locale: 'el-GR' }]
        : locale === 'en-GB'
          ? [{ path: this.getDocsDir('en-GB'), locale: 'en-GB' }]
          : [
              { path: this.getDocsDir('en-GB'), locale: 'en-GB' },
              { path: this.getDocsDir('el-GR'), locale: 'el-GR' },
            ];

    const allFiles: { name: string; size: string; modified: Date; type: string; yearNumber: number | null; locale: string }[] = [];
    for (const { path: docsDir, locale: loc } of dirsToScan) {
      if (!fs.existsSync(docsDir)) continue;
      const entries = fs.readdirSync(docsDir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isFile() || !e.name.toLowerCase().endsWith('.pdf')) continue;
        const fullPath = path.join(docsDir, e.name);
        const stats = fs.statSync(fullPath);
        const isYearSpecific = /year\d+\.pdf/i.test(e.name);
        const isDiagnostic = e.name.toLowerCase().includes('diagnostic') && !isYearSpecific;
        const isQuestionnaire = e.name.toLowerCase().includes('questionnaire') || e.name.toLowerCase().includes('general');
        const yearMatch = e.name.match(/year(\d+)/i);
        allFiles.push({
          name: loc === 'el-GR' ? `el-GR/${e.name}` : e.name,
          size: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
          modified: stats.mtime,
          type: isDiagnostic ? 'diagnostic' : isQuestionnaire ? 'questionnaire' : isYearSpecific ? 'year-specific' : 'unknown',
          yearNumber: yearMatch ? parseInt(yearMatch[1], 10) : null,
          locale: loc,
        });
      }
    }

    if (allFiles.length === 0 && !fs.existsSync(basePath)) {
      return {
        success: false,
        message: `Docs directory not found: ${basePath}. Set DOCS_BASE_PATH in .env if you use a different folder.`,
        directory: basePath,
        filesCount: 0,
        files: [],
      };
    }
    return {
      success: true,
      directory: basePath,
      filesCount: allFiles.length,
      files: allFiles,
    };
  }

  @Post('analyze-existing/:fileName')
  @ApiOperation({ 
    summary: 'Analyze a specific PDF from the docs folder',
    description: `Analyze a specific PDF file from the docs folder.
    
IMPORTANT: Only "Diagnostic tests.pdf" is used for Part B diagnostic tests.
Year5.pdf, Year6.pdf, etc. are for questionnaires/curriculum setup, NOT diagnostic tests.`
  })
  async analyzeExistingPdf(
    @Param('fileName') fileName: string,
    @Body('yearNumber') yearNumber?: number,
    @Body('locale') locale?: string,
  ) {
    const isGreek = locale === 'el-GR' || fileName.startsWith('el-GR/');
    const effectiveLocale = isGreek ? 'el-GR' : 'en-GB';
    const baseName = fileName.replace(/^el-GR\/?/, '');
    const docsDir = this.getDocsDir(effectiveLocale);
    const filePath = path.join(docsDir, baseName);

    if (!fs.existsSync(filePath)) {
      throw new BadRequestException(`File not found: ${fileName}`);
    }

    const fileNameLower = fileName.toLowerCase();
    // IMPORTANT: Only "Diagnostic tests.pdf" is used for Part B diagnostic tests
    // Year5.pdf, Year6.pdf, etc. are for questionnaires/curriculum setup, NOT diagnostic tests
    const isDiagnosticTest = fileNameLower.includes('diagnostic') && !/year\d+\.pdf/i.test(fileName);
    const isQuestionnaire = fileNameLower.includes('questionnaire') || fileNameLower.includes('general');
    const isYearSpecific = /year\d+\.pdf/i.test(fileName);
    
    // Try to extract year number from filename if not provided
    let parsedYearNumber: number | undefined = yearNumber;
    if (!parsedYearNumber && isYearSpecific) {
      const yearMatch = fileName.match(/year(\d+)/i);
      if (yearMatch) {
        parsedYearNumber = parseInt(yearMatch[1], 10);
      }
    }

    // Clear cache to force re-parsing
    this.questionnaireParserService.clearCache();

    let extracted;
    if (isDiagnosticTest) {
      if (parsedYearNumber) {
        extracted = await this.questionnaireParserService.getDiagnosticTestForYear(parsedYearNumber);
      } else {
        // Parse for all years (5-13)
        const allYears: any = {};
        for (let year = 5; year <= 13; year++) {
          try {
            const yearData = await this.questionnaireParserService.getDiagnosticTestForYear(year);
            // Include if it has sections OR questions
            if (yearData && ((yearData.sections && yearData.sections.length > 0) || (yearData.questions && yearData.questions.length > 0))) {
              allYears[year] = yearData;
            }
          } catch (error) {
            console.error(`Error parsing Year ${year}:`, error);
            // Continue with next year
          }
        }
        extracted = { years: allYears };
      }
    } else {
      if (parsedYearNumber) {
        extracted = await this.questionnaireParserService.getQuestionnaireForYear(parsedYearNumber);
      } else {
        // Parse for all years (5-13)
        const allYears: any = {};
        for (let year = 5; year <= 13; year++) {
          try {
            const yearData = await this.questionnaireParserService.getQuestionnaireForYear(year);
            // Include if it has sections OR questions
            if (yearData && ((yearData.sections && yearData.sections.length > 0) || (yearData.questions && yearData.questions.length > 0))) {
              allYears[year] = yearData;
            }
          } catch (error) {
            console.error(`Error parsing Year ${year}:`, error);
            // Continue with next year
          }
        }
        extracted = { years: allYears };
      }
    }

    const stats = this.calculateStats(extracted);

    return {
      success: true,
      fileName,
      fileType: isDiagnosticTest ? 'diagnostic' : isQuestionnaire ? 'questionnaire' : 'unknown',
      yearNumber: parsedYearNumber,
      extracted: stats,
      data: extracted,
    };
  }

  @Get('analyze-year/:yearNumber')
  @ApiOperation({ 
    summary: 'Analyze diagnostic test for a specific year',
    description: 'Analyze the diagnostic test PDF for a specific year group (5-13).'
  })
  async analyzeYear(
    @Param('yearNumber') yearNumber: string,
  ) {
    const year = parseInt(yearNumber, 10);
    if (isNaN(year) || year < 5 || year > 13) {
      throw new BadRequestException('Year number must be between 5 and 13');
    }

    // Clear cache to force re-parsing
    this.questionnaireParserService.clearCache();

    const diagnosticTest = await this.questionnaireParserService.getDiagnosticTestForYear(year);
    const questionnaire = await this.questionnaireParserService.getQuestionnaireForYear(year);

    const stats = {
      diagnosticTest: this.calculateStats(diagnosticTest),
      questionnaire: this.calculateStats(questionnaire),
    };

    return {
      success: true,
      yearNumber: year,
      extracted: stats,
      data: {
        diagnosticTest,
        questionnaire,
      },
    };
  }

  private calculateStats(extracted: any): any {
    if (extracted.years) {
      // Multiple years
      const yearStats: any = {};
      let totalSections = 0;
      let totalQuestions = 0;

      for (const [year, yearData] of Object.entries(extracted.years)) {
        const yearStat = this.calculateStats(yearData);
        yearStats[year] = yearStat;
        totalSections += yearStat.sectionsCount || 0;
        totalQuestions += yearStat.questionsCount || 0;
      }

      return {
        yearsCount: Object.keys(extracted.years).length,
        totalSections,
        totalQuestions,
        byYear: yearStats,
      };
    } else if (extracted.sections) {
      // Single year
      const sectionsCount = extracted.sections.length;
      const questionsCount = extracted.sections.reduce(
        (sum: number, section: any) => sum + (section.questions?.length || 0),
        0,
      );

      return {
        sectionsCount,
        questionsCount,
        sections: extracted.sections.map((s: any) => ({
          title: s.title,
          questionsCount: s.questions?.length || 0,
        })),
      };
    }

    return {
      sectionsCount: 0,
      questionsCount: 0,
    };
  }
}
