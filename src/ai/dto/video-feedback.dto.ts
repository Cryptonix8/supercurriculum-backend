import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class VideoFeedbackDto {
  @ApiProperty({ example: 'session_12345', required: false })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiProperty({ example: 'dQw4w9WgXcQ' })
  @IsString()
  videoId: string;

  @ApiProperty({ example: 'quadratic equations explained in greek' })
  @IsString()
  query: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  clicked?: boolean;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  helpful?: boolean;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  reported?: boolean;

  @ApiProperty({ example: 'Contains off-topic content', required: false })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

