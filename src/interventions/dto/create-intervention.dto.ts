import { IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

enum Band {
  NEEDS_SUPPORT = 'NEEDS_SUPPORT',
  DEVELOPING = 'DEVELOPING',
  SECURE = 'SECURE',
}

export class CreateInterventionDto {
  @ApiProperty()
  @IsString()
  subjectId: string;

  @ApiProperty()
  @IsString()
  skillId: string;

  @ApiProperty({ enum: Band, example: 'DEVELOPING' })
  @IsEnum(Band)
  band: Band;

  @ApiProperty({
    example: 'Focus on scaffolded reading tasks with visual support',
  })
  @IsString()
  description: string;

  @ApiProperty({
    example: 'Read shorter texts, use graphic organizers, annotate key points',
  })
  @IsString()
  taskGuidance: string;

  @ApiProperty({
    example: 'Student can identify 2-3 main ideas with support',
  })
  @IsString()
  expectedOutcome: string;
}

