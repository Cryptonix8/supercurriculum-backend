import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsDateString } from 'class-validator';

export class DiagnosticTestAnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by year group ID' })
  @IsString()
  @IsOptional()
  yearGroupId?: string;

  @ApiPropertyOptional({ description: 'Filter by class ID' })
  @IsString()
  @IsOptional()
  classId?: string;

  @ApiPropertyOptional({ description: 'Filter by student ID' })
  @IsString()
  @IsOptional()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Filter by schedule ID' })
  @IsString()
  @IsOptional()
  scheduleId?: string;

  @ApiPropertyOptional({ description: 'Start date for filtering results' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for filtering results' })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}

export class CompareTestScoresDto {
  @ApiProperty({ description: 'First assessment ID (pre-test)', example: 'assessment-uuid-1' })
  @IsString()
  preTestAssessmentId: string;

  @ApiProperty({ description: 'Second assessment ID (post-test)', example: 'assessment-uuid-2' })
  @IsString()
  postTestAssessmentId: string;
}

