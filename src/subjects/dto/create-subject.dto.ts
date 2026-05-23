import { IsString, IsInt, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSubjectDto {
  @ApiProperty()
  @IsString()
  yearGroupId: string;

  @ApiProperty({ example: 'english' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'English' })
  @IsString()
  displayName: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  whyMatters?: string;

  @ApiProperty({ example: 'book' })
  @IsString()
  @IsOptional()
  iconName?: string;

  @ApiProperty({ example: '#4CAF50' })
  @IsString()
  @IsOptional()
  colorCode?: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  orderIndex: number;

  @ApiProperty({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}

