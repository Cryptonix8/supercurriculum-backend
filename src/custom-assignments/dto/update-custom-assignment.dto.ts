import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsArray,
} from 'class-validator';
import { AssignmentDifficulty, AssignmentStatus, AssignmentVisibility } from '@prisma/client';

export class UpdateCustomAssignmentDto {
  @ApiPropertyOptional({ description: 'Assignment title' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'Assignment description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: AssignmentDifficulty })
  @IsEnum(AssignmentDifficulty)
  @IsOptional()
  difficulty?: AssignmentDifficulty;

  @ApiPropertyOptional({ enum: AssignmentStatus })
  @IsEnum(AssignmentStatus)
  @IsOptional()
  status?: AssignmentStatus;

  @ApiPropertyOptional({ enum: AssignmentVisibility })
  @IsEnum(AssignmentVisibility)
  @IsOptional()
  visibility?: AssignmentVisibility;

  @ApiPropertyOptional({ description: 'Estimated duration in minutes' })
  @IsInt()
  @Min(1)
  @Max(180)
  @IsOptional()
  duration?: number;

  @ApiPropertyOptional({ description: 'Whether this is a template' })
  @IsBoolean()
  @IsOptional()
  isTemplate?: boolean;

  @ApiPropertyOptional({ description: 'Tags', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}

