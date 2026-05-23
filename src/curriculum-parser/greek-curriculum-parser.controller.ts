import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Body,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { GreekCurriculumParserService } from './greek-curriculum-parser.service';
import * as fs from 'fs';
import * as path from 'path';
import { resolveFromBackendRoot } from '../project-paths';

@ApiTags('Greek Curriculum Parser')
@Controller('greek-curriculum-parser')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class GreekCurriculumParserController {
  constructor(
    private readonly greekParserService: GreekCurriculumParserService,
  ) {}

  @Post('upload-docx')
  @ApiOperation({ summary: 'Upload and analyze a Greek curriculum DOCX file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        documentType: {
          type: 'string',
          enum: ['overview', 'subject', 'grade'],
          default: 'overview',
        },
        autoImport: {
          type: 'string',
          description: 'Set to "true" to automatically import after analysis',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      dest: './uploads/curriculum',
      fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
            file.originalname.endsWith('.docx')) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only DOCX files are allowed'), false);
        }
      },
    }),
  )
  async uploadAndAnalyzeDocx(
    @UploadedFile() file: Express.Multer.File,
    @Body('documentType') documentType: 'overview' | 'subject' | 'grade' = 'overview',
    @Body('autoImport') autoImport?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    try {
      // Extract text from DOCX
      const docxText = await this.greekParserService.extractTextFromDocx(file.path);
      
      // Analyze with AI
      const extracted = await this.greekParserService.analyzeGreekCurriculum(docxText, documentType);
      
      // Auto-import if requested
      let importResult = null;
      if (autoImport === 'true') {
        importResult = await this.greekParserService.importGreekCurriculum(extracted, false);
      }

      // Clean up uploaded file
      fs.unlink(file.path, (err) => {
        if (err) console.error('Error deleting uploaded file:', err);
      });

      return {
        success: true,
        message: 'DOCX analyzed successfully',
        fileName: file.originalname,
        extracted: {
          gradeLevelsCount: extracted.gradeLevels.length,
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
      throw new BadRequestException(`Failed to process DOCX: ${error.message}`);
    }
  }

  @Post('upload-pdf')
  @ApiOperation({ summary: 'Upload and analyze a Greek curriculum PDF file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        documentType: {
          type: 'string',
          enum: ['overview', 'subject', 'grade'],
          default: 'subject',
        },
        autoImport: {
          type: 'string',
          description: 'Set to "true" to automatically import after analysis',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      dest: './uploads/curriculum',
      fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only PDF files are allowed'), false);
        }
      },
    }),
  )
  async uploadAndAnalyzePdf(
    @UploadedFile() file: Express.Multer.File,
    @Body('documentType') documentType: 'overview' | 'subject' | 'grade' = 'subject',
    @Body('autoImport') autoImport?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    try {
      // Extract text from PDF
      const pdfText = await this.greekParserService.extractTextFromPdf(file.path);
      
      // Analyze with AI
      const extracted = await this.greekParserService.analyzeGreekCurriculum(pdfText, documentType);
      
      // Auto-import if requested
      let importResult = null;
      if (autoImport === 'true') {
        importResult = await this.greekParserService.importGreekCurriculum(extracted, false);
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
          gradeLevelsCount: extracted.gradeLevels.length,
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

  @Post('process-directory')
  @ApiOperation({ 
    summary: 'Process all Greek curriculum files from a directory',
    description: 'Processes DOCX and PDF files from the specified directory and imports them into the database',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        directoryPath: {
          type: 'string',
          description: 'Path to directory containing Greek curriculum files',
          example: 'overview-of-upper-secondary-education-in-greece-docx_2026-02-19_0937',
        },
        generateActivities: {
          type: 'boolean',
          description: 'Whether to generate activities after import',
          default: false,
        },
      },
    },
  })
  async processDirectory(
    @Body('directoryPath') directoryPath: string,
    @Body('generateActivities') generateActivities: boolean = false,
  ) {
    if (!directoryPath) {
      throw new BadRequestException('Directory path is required');
    }

    // Resolve path relative to backend package root (stable under PM2; absolute paths allowed)
    const fullPath = resolveFromBackendRoot(directoryPath);
    
    if (!fs.existsSync(fullPath)) {
      throw new BadRequestException(`Directory not found: ${fullPath}`);
    }

    try {
      const result = await this.greekParserService.processGreekCurriculumFiles(
        fullPath,
        generateActivities,
      );

      return {
        success: true,
        message: 'Greek curriculum files processed successfully',
        processed: result.processed,
        results: result.results,
      };
    } catch (error) {
      throw new BadRequestException(`Failed to process directory: ${error.message}`);
    }
  }

  @Post('import')
  @ApiOperation({ 
    summary: 'Import extracted Greek curriculum data',
    description: 'Imports previously extracted Greek curriculum structure into the database',
  })
  async importCurriculum(
    @Body('extracted') extracted: any,
    @Body('generateActivities') generateActivities: boolean = false,
  ) {
    if (!extracted) {
      throw new BadRequestException('Extracted curriculum data is required');
    }

    try {
      const result = await this.greekParserService.importGreekCurriculum(
        extracted,
        generateActivities,
      );

      return {
        success: true,
        message: 'Greek curriculum imported successfully',
        results: result,
      };
    } catch (error) {
      throw new BadRequestException(`Failed to import curriculum: ${error.message}`);
    }
  }
}

