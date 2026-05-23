import { IsString, IsInt, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSkillDto {
  @ApiProperty()
  @IsString()
  subjectId: string;

  @ApiProperty({ example: 'reading' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Reading' })
  @IsString()
  displayName: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  orderIndex: number;
}

