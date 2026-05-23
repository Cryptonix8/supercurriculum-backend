import {
  IsString,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsArray,
  IsDateString,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum NoteCategory {
  BEHAVIORAL = 'BEHAVIORAL',
  ACADEMIC = 'ACADEMIC',
  GENERAL = 'GENERAL',
}

export enum NoteType {
  OBSERVATION = 'observation',
  INTERVENTION_NEEDED = 'intervention_needed',
  PRAISE = 'praise',
  CONCERN = 'concern',
}

export class CreateTeacherNoteDto {
  @ApiProperty()
  @IsUUID()
  studentId: string;

  @ApiProperty()
  @IsUUID()
  teacherId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  skillId?: string;

  @ApiProperty({ enum: NoteCategory, default: NoteCategory.GENERAL })
  @IsEnum(NoteCategory)
  noteCategory: NoteCategory;

  @ApiProperty({ enum: NoteType, default: NoteType.OBSERVATION })
  @IsString()
  noteType: string;

  @ApiProperty()
  @IsString()
  content: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isVisibleToStudent?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isVisibleToParent?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  flaggedForFollowUp?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  @ApiPropertyOptional({
    description: 'Array of file URLs or references',
    type: [Object],
  })
  @IsOptional()
  @IsArray()
  attachments?: Array<{
    url: string;
    filename: string;
    fileType: string;
    uploadedAt: string;
  }>;

  @ApiPropertyOptional({
    description: 'Additional tags for filtering',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateTeacherNoteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(NoteCategory)
  noteCategory?: NoteCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  noteType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isVisibleToStudent?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isVisibleToParent?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  flaggedForFollowUp?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  followUpCompleted?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  attachments?: Array<{
    url: string;
    filename: string;
    fileType: string;
    uploadedAt: string;
  }>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class GetTeacherNotesDto {
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
  subjectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  skillId?: string;

  @ApiPropertyOptional({ enum: NoteCategory })
  @IsOptional()
  @IsEnum(NoteCategory)
  noteCategory?: NoteCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  noteType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  flaggedForFollowUp?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  followUpCompleted?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  visibleToStudentOnly?: boolean;
}

