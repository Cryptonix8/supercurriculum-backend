import { IsString, IsInt, IsBoolean, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateYearGroupDto {
  @ApiProperty({ example: 'year_7' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Year 7' })
  @IsString()
  displayName: string;

  @ApiProperty({ example: 7 })
  @IsInt()
  orderIndex: number;

  @ApiProperty({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;

  @ApiProperty({ example: 'el-GR', required: false, default: 'en-GB' })
  @IsOptional()
  @IsString()
  @IsIn(['en-GB', 'el-GR'])
  locale?: string;

  @ApiProperty({ example: 'gr_v1', required: false })
  @IsOptional()
  @IsString()
  curriculumVersion?: string;
}

