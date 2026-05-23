import { IsString, IsOptional, IsNumber, IsEnum, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum SkillGapSeverity {
  MINOR = 'MINOR',
  MODERATE = 'MODERATE',
  SEVERE = 'SEVERE',
  CRITICAL = 'CRITICAL',
}

export class IdentifyGapsDto {
  @ApiPropertyOptional({ description: 'Filter by student ID' })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Filter by class ID' })
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional({ description: 'Filter by subject ID' })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({ description: 'Filter by skill ID' })
  @IsOptional()
  @IsString()
  skillId?: string;

  @ApiPropertyOptional({ enum: SkillGapSeverity })
  @IsOptional()
  @IsEnum(SkillGapSeverity)
  severity?: SkillGapSeverity;

  @ApiPropertyOptional({ description: 'Only show unresolved gaps' })
  @IsOptional()
  isResolved?: boolean;

  @ApiPropertyOptional({ description: 'Minimum score threshold (default 50)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  minScoreThreshold?: number;
}

export class CreateSkillGapDto {
  @ApiProperty()
  @IsString()
  studentId: string;

  @ApiProperty()
  @IsString()
  subjectId: string;

  @ApiProperty()
  @IsString()
  skillId: string;

  @ApiProperty()
  @IsString()
  yearGroupId: string;

  @ApiProperty({ enum: SkillGapSeverity })
  @IsEnum(SkillGapSeverity)
  severity: SkillGapSeverity;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentageScore: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assessmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SkillGapDashboardDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  yearGroupId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subjectId?: string;
}

