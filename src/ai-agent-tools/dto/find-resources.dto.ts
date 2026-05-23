import { IsString, IsNotEmpty, IsOptional, IsArray, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FindResourcesDto {
  @ApiProperty({ description: 'Topic to search for' })
  @IsString()
  @IsNotEmpty()
  topic: string;

  @ApiProperty({ description: 'Subject area' })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty({ required: false, enum: ['KS2', 'KS3', 'KS4', 'KS5'] })
  @IsOptional()
  @IsEnum(['KS2', 'KS3', 'KS4', 'KS5'])
  keyStage?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  yearGroup?: string;

  @ApiProperty({
    required: false,
    type: [String],
    description: 'Types of resources to find (video, interactive, article, worksheet)',
  })
  @IsOptional()
  @IsArray()
  resourceTypes?: string[];
}

