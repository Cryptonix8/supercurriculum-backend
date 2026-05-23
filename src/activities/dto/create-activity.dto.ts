import { IsString, IsInt, IsEnum, IsOptional, IsBoolean, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum ActivityType {
  READING = 'READING',
  WRITING = 'WRITING',
  LISTENING = 'LISTENING',
  WATCHING = 'WATCHING',
  RESEARCHING = 'RESEARCHING',
  STUDENT_LED = 'STUDENT_LED',
  CREATIVE = 'CREATIVE',
}

export enum Band {
  NEEDS_SUPPORT = 'NEEDS_SUPPORT',
  DEVELOPING = 'DEVELOPING',
  SECURE = 'SECURE',
}

export class CreateActivityDto {
  @ApiProperty()
  @IsString()
  subjectId: string;

  @ApiProperty()
  @IsString()
  skillId: string;

  @ApiProperty({ example: 'Read "The Diary of Anne Frank"' })
  @IsString()
  title: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'Read the first three chapters and note key themes...' })
  @IsString()
  instructions: string;

  @ApiProperty({ enum: ActivityType, example: 'READING' })
  @IsEnum(ActivityType)
  activityType: ActivityType;

  @ApiProperty({ enum: Band, example: 'DEVELOPING' })
  @IsEnum(Band)
  difficulty: Band;

  @ApiProperty({ example: 45, description: 'Estimated time in minutes' })
  @IsInt()
  estimatedMinutes: number;

  @ApiProperty({ example: 'https://www.example.com/resource', required: false })
  @IsString()
  @IsOptional()
  externalUrl?: string;

  @ApiProperty({ required: false, description: 'Additional resources as JSON' })
  @IsObject()
  @IsOptional()
  resources?: any;

  @ApiProperty({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}

