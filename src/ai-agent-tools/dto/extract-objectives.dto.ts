import { IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExtractObjectivesDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  topicId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  yearGroupId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiProperty({ required: false, enum: ['KS2', 'KS3', 'KS4', 'KS5'] })
  @IsOptional()
  @IsEnum(['KS2', 'KS3', 'KS4', 'KS5'])
  keyStage?: string;
}

