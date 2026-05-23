import { IsString, IsObject, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChatDto {
  @ApiProperty({ example: 'session_12345' })
  @IsString()
  sessionId: string;

  @ApiProperty({ example: 'Can you help me understand photosynthesis?' })
  @IsString()
  message: string;

  @ApiProperty({ required: false })
  @IsObject()
  @IsOptional()
  context?: {
    yearGroup?: string;
    currentSubject?: string;
    chapter?: string;
    grade?: string;
    learningMode?: 'hints' | 'full_solution';
    explainDepth?: 'short' | 'normal' | 'detailed';
    recentTasks?: string[];
    locale?: string;
    preferFastResponses?: boolean;
  };
}

