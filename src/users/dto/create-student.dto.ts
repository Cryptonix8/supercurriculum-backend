import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  IsBoolean,
  MinLength,
  Min,
  Max,
} from 'class-validator';

export class CreateStudentDto {
  @ApiProperty({ example: 'john.doe@school.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: 'year_group_id', required: false })
  @IsOptional()
  @IsString()
  yearGroupId?: string;

  // Student Profile fields
  @ApiProperty({ example: 'Johnny', required: false })
  @IsOptional()
  @IsString()
  nickname?: string;

  @ApiProperty({ example: 13, required: false })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(19)
  age?: number;

  @ApiProperty({ example: 'https://example.com/avatar.jpg', required: false })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiProperty({ example: ['English', 'Spanish'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  homeLanguages?: string[];

  @ApiProperty({ example: 'B1', required: false })
  @IsOptional()
  @IsString()
  englishProficiency?: string;

  @ApiProperty({ example: 'MIXED', required: false })
  @IsOptional()
  @IsString()
  preferredLearningMode?: string;

  @ApiProperty({ example: 15, required: false })
  @IsOptional()
  @IsInt()
  preferredTaskDuration?: number;

  @ApiProperty({ example: 'MEDIUM', required: false })
  @IsOptional()
  @IsString()
  preferredChallengeLevel?: string;

  @ApiProperty({ example: 120, required: false })
  @IsOptional()
  @IsInt()
  weeklyStudyTime?: number;

  @ApiProperty({ example: 30, required: false })
  @IsOptional()
  @IsInt()
  dailyMinutes?: number;

  @ApiProperty({ example: ['reading', 'science'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @ApiProperty({ example: ['subject_id_1'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredSubjects?: string[];

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  doesNotGiveUp?: boolean;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  getsAnxious?: boolean;

  @ApiProperty({ example: 'friendly', required: false })
  @IsOptional()
  @IsString()
  communicationTone?: string;
}

