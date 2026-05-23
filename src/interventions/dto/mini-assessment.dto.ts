import {
  IsString,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  IsUUID,
  IsObject,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum MiniAssessmentStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  PASSED = 'PASSED',
  FAILED = 'FAILED',
}

export interface MiniAssessmentQuestion {
  id: string;
  question: string;
  type: 'multiple_choice' | 'short_answer' | 'true_false';
  options?: string[];
  correctAnswer: string;
  points: number;
  explanation?: string;
}

export class CreateMiniAssessmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  interventionAssignmentId?: string;

  @ApiProperty()
  @IsUUID()
  studentId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  skillGapId?: string;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsUUID()
  targetSkillId: string;

  @ApiProperty()
  @IsUUID()
  targetSubjectId: string;

  @ApiProperty({
    description: 'Array of assessment questions',
    type: 'array',
  })
  @IsArray()
  questions: MiniAssessmentQuestion[];

  @ApiProperty()
  @IsNumber()
  @Min(1)
  totalQuestions: number;

  @ApiPropertyOptional({ default: 70.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  passingScore?: number;
}

export class SubmitMiniAssessmentDto {
  @ApiProperty()
  @IsUUID()
  assessmentId: string;

  @ApiProperty({
    description: 'Student answers mapped by question ID',
    type: 'object',
  })
  @IsObject()
  studentAnswers: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  timeSpent?: number; // minutes
}

export class UpdateMiniAssessmentDto {
  @ApiPropertyOptional({ enum: MiniAssessmentStatus })
  @IsOptional()
  @IsEnum(MiniAssessmentStatus)
  status?: MiniAssessmentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  passed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  feedback?: string;
}

export class GetMiniAssessmentsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  interventionAssignmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  skillGapId?: string;

  @ApiPropertyOptional({ enum: MiniAssessmentStatus })
  @IsOptional()
  @IsEnum(MiniAssessmentStatus)
  status?: MiniAssessmentStatus;
}

