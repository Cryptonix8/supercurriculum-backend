import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsArray,
  IsDateString,
  IsObject,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum InterventionPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum InterventionStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  ESCALATED = 'ESCALATED',
}

export class MicroLessonDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  content: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  videoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  resources?: string[];

  @ApiProperty()
  @IsNumber()
  estimatedMinutes: number;
}

export class AssignInterventionDto {
  @ApiProperty({ description: 'Student to assign intervention to' })
  @IsString()
  studentId: string;

  @ApiProperty({ description: 'Teacher assigning the intervention' })
  @IsString()
  teacherId: string;

  @ApiPropertyOptional({ description: 'Linked skill gap ID' })
  @IsOptional()
  @IsString()
  skillGapId?: string;

  @ApiPropertyOptional({ description: 'Predefined intervention template ID' })
  @IsOptional()
  @IsString()
  interventionId?: string;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty({ description: 'Subject to work on' })
  @IsString()
  targetSubjectId: string;

  @ApiProperty({ description: 'Skill to improve' })
  @IsString()
  targetSkillId: string;

  @ApiPropertyOptional({ description: 'For backfill: year group content to use' })
  @IsOptional()
  @IsString()
  targetYearGroupId?: string;

  @ApiProperty({ enum: InterventionPriority, default: 'MEDIUM' })
  @IsEnum(InterventionPriority)
  priority: InterventionPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ type: [MicroLessonDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MicroLessonDto)
  microLessons?: MicroLessonDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  activities?: any;

  @ApiPropertyOptional({ description: 'Pre-intervention score' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  preScore?: number;
}

export class UpdateInterventionAssignmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(InterventionStatus)
  status?: InterventionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(InterventionPriority)
  priority?: InterventionPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  postScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  escalationNotes?: string;
}

export class LogInterventionProgressDto {
  @ApiProperty()
  @IsString()
  assignmentId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  activityCompleted?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  score?: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  timeSpent: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty()
  wasSuccessful: boolean;
}

export class EscalateInterventionDto {
  @ApiProperty()
  @IsString()
  assignmentId: string;

  @ApiProperty()
  @IsString()
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  escalationNotes?: string;
}

export class BackfillAssignmentDto {
  @ApiProperty({ description: 'Student ID (in higher year group)' })
  @IsString()
  studentId: string;

  @ApiProperty({ description: 'Teacher assigning the backfill' })
  @IsString()
  teacherId: string;

  @ApiProperty({ description: 'Target earlier year group to backfill from' })
  @IsString()
  targetYearGroupId: string;

  @ApiProperty({ description: 'Subject to backfill' })
  @IsString()
  subjectId: string;

  @ApiProperty({ description: 'Specific skill to focus on' })
  @IsString()
  skillId: string;

  @ApiProperty({ description: 'Reason for backfill' })
  @IsString()
  reason: string;

  @ApiProperty({ enum: InterventionPriority, default: 'HIGH' })
  @IsEnum(InterventionPriority)
  priority: InterventionPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

