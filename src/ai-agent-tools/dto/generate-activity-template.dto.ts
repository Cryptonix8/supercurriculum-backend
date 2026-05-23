import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateActivityTemplateDto {
  @ApiProperty({ description: 'Curriculum topic ID' })
  @IsString()
  @IsNotEmpty()
  topicId: string;

  @ApiProperty({
    description: 'Extension level',
    enum: ['BEYOND_CURRICULUM', 'ENRICHMENT'],
  })
  @IsEnum(['BEYOND_CURRICULUM', 'ENRICHMENT'])
  @IsNotEmpty()
  extensionLevel: 'BEYOND_CURRICULUM' | 'ENRICHMENT';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  targetYearGroup?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  difficulty?: string;
}

