import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class VideoRecommendationDto {
  @ApiProperty({ example: 'session_12345', required: false })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiProperty({ example: 'How do I solve quadratic equations?', required: false })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiProperty({ example: 'Quadratic equations', required: false })
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  context?: {
    yearGroup?: string;
    currentSubject?: string;
    locale?: string;
  };

  @ApiProperty({ example: 5, minimum: 3, maximum: 5, required: false })
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(5)
  maxResults?: number;
}

