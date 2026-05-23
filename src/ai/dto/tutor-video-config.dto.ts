import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateTutorVideoConfigDto {
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowlistChannels?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  blocklistChannels?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  blocklistKeywords?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredKeywords?: string[];

  @ApiProperty({ required: false, minimum: 60, maximum: 3600 })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(3600)
  minDurationSec?: number;

  @ApiProperty({ required: false, minimum: 60, maximum: 5400 })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(5400)
  maxDurationSec?: number;

  @ApiProperty({ required: false, minimum: 3, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(5)
  maxResults?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  autoSuggestEnabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  requireGreek?: boolean;
}

