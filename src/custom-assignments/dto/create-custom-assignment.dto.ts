import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsArray,
} from 'class-validator';
import { AssignmentDifficulty } from '@prisma/client';

export class CreateCustomAssignmentDto {
  @ApiProperty({
    description: 'AI prompt for generating the assignment',
    example: 'Create 10 MCQs on Pythagoras theorem, mixed difficulty',
  })
  @IsString()
  @IsNotEmpty()
  aiPrompt: string;

  @ApiPropertyOptional({
    description: 'Title for the assignment',
    example: 'Pythagoras Theorem Quiz',
  })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    description: 'Description of the assignment',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Subject ID',
  })
  @IsString()
  @IsOptional()
  subjectId?: string;

  @ApiPropertyOptional({
    description: 'Year Group ID',
  })
  @IsString()
  @IsOptional()
  yearGroupId?: string;

  @ApiPropertyOptional({
    description: 'Topic or theme',
    example: 'Pythagoras theorem',
  })
  @IsString()
  @IsOptional()
  topic?: string;

  @ApiProperty({
    description: 'Difficulty level',
    enum: AssignmentDifficulty,
    example: AssignmentDifficulty.MIXED,
  })
  @IsEnum(AssignmentDifficulty)
  difficulty: AssignmentDifficulty;

  @ApiPropertyOptional({
    description: 'Estimated duration in minutes',
    example: 30,
  })
  @IsInt()
  @Min(1)
  @Max(180)
  @IsOptional()
  duration?: number;

  @ApiPropertyOptional({
    description: 'Number of questions/items',
    example: 10,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  questionCount?: number;

  @ApiPropertyOptional({
    description: 'Tags for the assignment',
    type: [String],
    example: ['geometry', 'gcse'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}

