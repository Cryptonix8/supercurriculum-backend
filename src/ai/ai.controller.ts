import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatDto } from './dto/chat.dto';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { VideoRecommendationDto } from './dto/video-recommendation.dto';
import { VideoFeedbackDto } from './dto/video-feedback.dto';
import { UpdateTutorVideoConfigDto } from './dto/tutor-video-config.dto';
import { TypoReportDto } from './dto/typo-report.dto';
import { TutorSpeechDto } from './dto/tutor-speech.dto';

@ApiTags('AI')
@Controller('ai')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Send a message to the AI tutor' })
  async chat(@Request() req, @Body() chatDto: ChatDto): Promise<any> {
    return this.aiService.chat({
      userId: req.user.id,
      sessionId: chatDto.sessionId,
      message: chatDto.message,
      context: chatDto.context,
    });
  }

  @Post('chat/videos')
  @ApiOperation({ summary: 'Get YouTube video recommendations for a topic' })
  async recommendVideos(@Request() req, @Body() dto: VideoRecommendationDto) {
    return this.aiService.recommendVideos({
      userId: req.user.id,
      sessionId: dto.sessionId,
      topic: dto.topic,
      message: dto.message,
      context: dto.context,
      maxResults: dto.maxResults,
    });
  }

  @Post('chat/videos/feedback')
  @ApiOperation({ summary: 'Store recommendation feedback (click/helpful/report)' })
  async saveVideoFeedback(@Request() req, @Body() dto: VideoFeedbackDto) {
    return this.aiService.saveVideoFeedback({
      userId: req.user.id,
      sessionId: dto.sessionId,
      videoId: dto.videoId,
      query: dto.query,
      clicked: dto.clicked,
      helpful: dto.helpful,
      reported: dto.reported,
      reason: dto.reason,
      metadata: dto.metadata,
    });
  }

  @Post('chat/typo-report')
  @ApiOperation({ summary: 'Store typo report from student UI' })
  async reportTypo(@Request() req, @Body() dto: TypoReportDto) {
    return this.aiService.reportTypo({
      userId: req.user.id,
      screenId: dto.screenId,
      textKey: dto.textKey,
      rawText: dto.rawText,
      locale: dto.locale,
      sessionId: dto.sessionId,
      context: dto.context,
    });
  }

  @Get('chat/history')
  @ApiOperation({ summary: 'Get chat history for a session' })
  async getChatHistory(
    @Request() req,
    @Query('sessionId') sessionId: string,
  ) {
    return this.aiService.getChatHistory(req.user.id, sessionId);
  }

  @Post('chat/session')
  @ApiOperation({ summary: 'Create a new chat session' })
  async createSession(@Request() req) {
    return this.aiService.createSession(req.user.id);
  }

  @Post('chat/voice')
  @ApiOperation({ summary: 'Send a voice message to the AI tutor' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: diskStorage({
        destination: './uploads/voice',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `voice-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        // Accept common audio formats
        const allowedMimes = [
          'audio/m4a',
          'audio/mp4',
          'audio/mpeg',
          'audio/wav',
          'audio/webm',
          'audio/ogg',
          'audio/x-m4a',
          'audio/x-caf',
          'audio/3gpp',
          'audio/3gp',
          'application/octet-stream',
        ];
        const allowedExt = /\.(m4a|mp4|caf|3gp|wav|webm|ogg)$/i;
        if (
          allowedMimes.includes(file.mimetype) ||
          allowedExt.test(file.originalname)
        ) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Invalid audio file format'), false);
        }
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
    }),
  )
  async voiceChat(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
    @Body('sessionId') sessionId: string,
    @Body('yearGroup') yearGroup?: string,
    @Body('locale') locale?: string,
    @Body('preferFastResponses') preferFastResponses?: string,
    @Body('grade') grade?: string,
    @Body('currentSubject') currentSubject?: string,
    @Body('chapter') chapter?: string,
    @Body('learningMode') learningMode?: string,
    @Body('explainDepth') explainDepth?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No audio file provided');
    }

    try {
      const result = await this.aiService.processVoiceMessage({
        userId: req.user.id,
        sessionId,
        audioFilePath: file.path,
        context: {
          yearGroup,
          locale,
          preferFastResponses: preferFastResponses !== 'false',
          grade,
          currentSubject,
          chapter,
          learningMode: (learningMode as 'hints' | 'full_solution') || undefined,
          explainDepth: (explainDepth as 'short' | 'normal' | 'detailed') || undefined,
        },
      });

      // Clean up the uploaded file after processing
      fs.unlink(file.path, (err) => {
        if (err) console.error('Error deleting voice file:', err);
      });

      return result;
    } catch (error) {
      // Clean up file on error
      fs.unlink(file.path, (err) => {
        if (err) console.error('Error deleting voice file:', err);
      });
      throw error;
    }
  }

  @Post('chat/tts')
  @ApiOperation({ summary: 'Generate tutor speech audio from text/structured content' })
  async generateTutorSpeech(@Request() req, @Body() dto: TutorSpeechDto): Promise<any> {
    return this.aiService.generateTutorSpeech({
      userId: req.user.id,
      sessionId: dto.sessionId,
      locale: dto.locale,
      learningMode: dto.learningMode,
      text: dto.text,
      structuredContent: dto.structuredContent,
      speed: dto.speed,
      voice: dto.voice,
    });
  }

  @Post('chat/image')
  @ApiOperation({ 
    summary: 'Send an image to the AI tutor for analysis',
    description: 'Upload a photo of homework, textbook page, or handwritten answer for AI assistance. Supports homework help and answer checking.'
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: './uploads/images',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `image-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        // Accept common image formats
        const allowedMimes = [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/gif',
          'image/webp',
        ];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Invalid image format. Please use JPG, PNG, GIF, or WebP.'), false);
        }
      },
      limits: {
        fileSize: 20 * 1024 * 1024, // 20MB limit for high-quality photos
      },
    }),
  )
  async imageChat(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
    @Body('sessionId') sessionId: string,
    @Body('message') message?: string,
    @Body('purpose') purpose?: 'homework_help' | 'answer_submission' | 'general',
    @Body('yearGroup') yearGroup?: string,
    @Body('subject') subject?: string,
    @Body('locale') locale?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }

    try {
      const result = await this.aiService.processImageMessage({
        userId: req.user.id,
        sessionId,
        imagePath: file.path,
        userMessage: message,
        context: {
          yearGroup,
          currentSubject: subject,
          purpose: purpose || 'homework_help',
          locale,
        },
      });

      // Clean up the uploaded file after processing
      fs.unlink(file.path, (err) => {
        if (err) console.error('Error deleting image file:', err);
      });

      return result;
    } catch (error) {
      // Clean up file on error
      fs.unlink(file.path, (err) => {
        if (err) console.error('Error deleting image file:', err);
      });
      throw error;
    }
  }

  @Get('motivational-message')
  @ApiOperation({ summary: 'Get a motivational message based on student progress' })
  async getMotivationalMessage(@Request() req) {
    return this.aiService.generateMotivationalMessage(req.user.id);
  }

  @Get('video-config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get tutor video recommendation config (admin)' })
  async getTutorVideoConfig() {
    return this.aiService.getTutorVideoConfig();
  }

  @Post('video-config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update tutor video recommendation config (admin)' })
  async updateTutorVideoConfig(@Body() dto: UpdateTutorVideoConfigDto) {
    return this.aiService.updateTutorVideoConfig(dto);
  }
}

