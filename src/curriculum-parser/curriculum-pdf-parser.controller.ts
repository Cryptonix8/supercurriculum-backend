import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurriculumPdfParserService, ExtractedCurriculum } from './curriculum-pdf-parser.service';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import * as path from 'path';
import { getCurriculumBulkPdfsDir } from '../project-paths';

@ApiTags('Curriculum PDF Parser')
@Controller('curriculum-parser')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class CurriculumPdfParserController {
  constructor(private readonly pdfParserService: CurriculumPdfParserService) {}

  @Post('upload')
  @ApiOperation({ 
    summary: 'Upload and analyze a curriculum PDF (Primary/Secondary)',
    description: `Upload a British National Curriculum PDF file (Primary or Secondary). 
    
This endpoint is for setting up the curriculum structure (subjects, skills, topics) from the official curriculum documents.

For generating activities, use POST /activities/generate-from-pdf instead, which uses Year PDFs for structure and automatically finds these curriculum PDFs for content.

The system will extract text and use AI to identify years, subjects, skills, and topics from the curriculum document.`
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Primary or Secondary curriculum PDF file (e.g., primary.pdf, secondary.pdf)',
        },
        documentType: {
          type: 'string',
          enum: ['primary', 'secondary', 'full'],
          description: 'Type of curriculum document',
        },
        autoImport: {
          type: 'boolean',
          description: 'Automatically import extracted curriculum structure (subjects, skills, topics) to database',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/curriculum',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `curriculum-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
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
    @Body('documentType') documentType: 'primary' | 'secondary' | 'full' = 'full',
    @Body('autoImport') autoImport?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    try {
      // Extract text from PDF
      const pdfText = await this.pdfParserService.extractTextFromPdf(file.path);
      
      // Analyze with AI
      const extracted = await this.pdfParserService.analyzeCurriculumPdf(pdfText, documentType);
      
      // Auto-import if requested (curriculum structure only - no activities)
      // Activities should be generated using POST /activities/generate-from-pdf
      let importResult = null;
      if (autoImport === 'true') {
        importResult = await this.pdfParserService.importExtractedCurriculum(extracted, false);
      }

      // Clean up uploaded file
      fs.unlink(file.path, (err) => {
        if (err) console.error('Error deleting uploaded file:', err);
      });

      return {
        success: true,
        message: 'PDF analyzed successfully',
        fileName: file.originalname,
        extracted: {
          keyStagesCount: extracted.keyStages.length,
          subjectsCount: extracted.subjects.length,
          totalSkills: extracted.subjects.reduce((sum, s) => sum + (s.skills?.length || 0), 0),
          totalTopics: extracted.subjects.reduce((sum, s) => sum + (s.topics?.length || 0), 0),
        },
        data: extracted,
        importResult,
      };
    } catch (error) {
      // Clean up on error
      if (file.path) {
        fs.unlink(file.path, () => {});
      }
      throw new BadRequestException(`Failed to process PDF: ${error.message}`);
    }
  }

  @Post('import')
  @ApiOperation({ 
    summary: 'Import extracted curriculum data',
    description: `Import previously extracted curriculum data (subjects, skills, topics) into the database. 
    
Use this after reviewing the extracted data from the upload endpoint.

NOTE: This only imports curriculum structure. To generate activities, use POST /activities/generate-from-pdf with Year PDFs.`
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        keyStages: { type: 'array' },
        subjects: { type: 'array' },
      },
    },
  })
  async importCurriculum(
    @Body() body: ExtractedCurriculum,
  ) {
    const result = await this.pdfParserService.importExtractedCurriculum(
      body,
      false, // No activity generation - use /activities/generate-from-pdf instead
    );
    
    return {
      success: true,
      message: 'Curriculum structure imported successfully. Use POST /activities/generate-from-pdf to generate activities from Year PDFs.',
      result,
    };
  }

  @Post('process-existing')
  @ApiOperation({ 
    summary: 'Process all curriculum PDFs in the docs folder',
    description: `Automatically process all curriculum PDF files (Primary/Secondary) in the docs folder and import curriculum structure (subjects, skills, topics).
    
NOTE: This only imports curriculum structure. To generate activities, use POST /activities/generate-from-pdf with Year PDFs (year5.pdf, year6.pdf, etc.).`
  })
  async processExistingPdfs() {
    const { processed, results } = await this.pdfParserService.processExistingPdfs(false); // No activity generation
    
    return {
      success: true,
      message: `Processed ${processed.length} curriculum PDF files. Use POST /activities/generate-from-pdf to generate activities from Year PDFs.`,
      processedFiles: processed,
      results,
    };
  }

  @Get('preview-existing')
  @ApiOperation({ 
    summary: 'List available PDFs for processing',
    description: 'List curriculum PDF files in the bulk import directory (docs/el-EN by default, or CURRICULUM_BULK_PDFS_PATH / legacy ../pdfs).'
  })
  async listExistingPdfs() {
    const pdfDir = getCurriculumBulkPdfsDir();
    
    if (!fs.existsSync(pdfDir)) {
      return {
        success: false,
        message: 'PDF directory not found',
        files: [],
      };
    }

    const files = fs.readdirSync(pdfDir)
      .filter((f: string) => f.endsWith('.pdf'))
      .map((f: string) => {
        const stats = fs.statSync(path.join(pdfDir, f));
        return {
          name: f,
          size: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
          modified: stats.mtime,
        };
      });

    return {
      success: true,
      directory: pdfDir,
      filesCount: files.length,
      files,
    };
  }

  @Post('analyze-single')
  @ApiOperation({ 
    summary: 'Analyze a single PDF from the pdfs folder',
    description: 'Analyze a specific PDF file from the bulk import directory without importing.'
  })
  async analyzeSinglePdf(
    @Body('fileName') fileName: string,
    @Body('documentType') documentType: 'primary' | 'secondary' | 'full' = 'full',
  ) {
    const pdfDir = getCurriculumBulkPdfsDir();
    const filePath = path.join(pdfDir, fileName);

    if (!fs.existsSync(filePath)) {
      throw new BadRequestException(`File not found: ${fileName}`);
    }

    const pdfText = await this.pdfParserService.extractTextFromPdf(filePath);
    const extracted = await this.pdfParserService.analyzeCurriculumPdf(pdfText, documentType);

    return {
      success: true,
      fileName,
      extracted: {
        keyStagesCount: extracted.keyStages.length,
        subjectsCount: extracted.subjects.length,
        totalSkills: extracted.subjects.reduce((sum, s) => sum + (s.skills?.length || 0), 0),
        totalTopics: extracted.subjects.reduce((sum, s) => sum + (s.topics?.length || 0), 0),
      },
      data: extracted,
    };
  }
}

