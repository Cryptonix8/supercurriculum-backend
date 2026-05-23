import { IsString, IsInt, IsArray, IsBoolean, IsOptional, Min, IsEnum, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiProperty({ example: 'uuid-of-year-group' })
  @IsString()
  @IsOptional()
  yearGroupId?: string;

  @ApiProperty({ example: 30, description: 'Daily available study minutes' })
  @IsInt()
  @Min(0)
  @IsOptional()
  dailyMinutes?: number;

  @ApiProperty({ example: ['reading', 'science', 'technology'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  interests?: string[];

  @ApiProperty({ example: ['subject-id-1', 'subject-id-2'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  preferredSubjects?: string[];

  @ApiProperty({ example: true })
  @IsBoolean()
  @IsOptional()
  onboardingCompleted?: boolean;

  // AI Tutor Profile Fields

  @ApiProperty({ example: 'Alex', required: false })
  @IsString()
  @IsOptional()
  nickname?: string;

  @ApiProperty({ example: 12, required: false })
  @IsInt()
  @IsOptional()
  age?: number;

  @ApiProperty({ example: ['English', 'Spanish'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  homeLanguages?: string[];

  @ApiProperty({ example: 'B2', required: false })
  @IsString()
  @IsOptional()
  englishProficiency?: string;

  @ApiProperty({ example: 'MIXED', required: false })
  @IsString()
  @IsOptional()
  preferredLearningMode?: string;

  @ApiProperty({ example: 15, required: false })
  @IsInt()
  @IsOptional()
  preferredTaskDuration?: number;

  @ApiProperty({ example: 'MEDIUM', required: false })
  @IsString()
  @IsOptional()
  preferredChallengeLevel?: string;

  @ApiProperty({ example: 120, required: false })
  @IsInt()
  @IsOptional()
  weeklyStudyTime?: number;

  @ApiProperty({ example: { maths: 'CONFIDENT', english: 'SOMEWHAT_CONFIDENT' }, required: false })
  @IsObject()
  @IsOptional()
  subjectConfidence?: any;

  @ApiProperty({ example: 'I enjoy challenges', required: false })
  @IsString()
  @IsOptional()
  attitudeToDifficulty?: string;

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  doesNotGiveUp?: boolean;

  @ApiProperty({ example: false, required: false })
  @IsBoolean()
  @IsOptional()
  getsAnxious?: boolean;
}

