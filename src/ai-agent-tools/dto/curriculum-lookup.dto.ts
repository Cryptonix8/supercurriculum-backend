import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsIn } from 'class-validator';

export class CurriculumLookupDto {
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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  topicName?: string;

  @ApiPropertyOptional({ enum: ['en-GB', 'el-GR'] })
  @IsOptional()
  @IsIn(['en-GB', 'el-GR'])
  locale?: string;
}
