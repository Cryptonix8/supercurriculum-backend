import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class TypoReportDto {
  @ApiProperty({ example: 'AIChatScreen' })
  @IsString()
  @MaxLength(120)
  screenId: string;

  @ApiPropertyOptional({ example: 'aiChat.welcome' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  textKey?: string;

  @ApiProperty({ example: 'κλώτσιενσε' })
  @IsString()
  rawText: string;

  @ApiPropertyOptional({ example: 'el-GR' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  locale?: string;

  @ApiPropertyOptional({ example: 'session_123' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sessionId?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  context?: Record<string, any>;
}
