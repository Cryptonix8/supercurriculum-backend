import { IsString, IsOptional, IsBoolean, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateClassDto {
  @ApiProperty({ example: 'Year 7A', required: false, description: 'Class name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 'Morning class for Year 7 students', required: false, description: 'Class description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'uuid-year-7', required: false, description: 'Year group ID' })
  @IsString()
  @IsOptional()
  yearGroupId?: string;

  @ApiProperty({ example: 'uuid-maths', required: false, description: 'Subject ID' })
  @IsString()
  @IsOptional()
  subjectId?: string;

  @ApiProperty({ example: true, required: false, description: 'Is class active' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ 
    example: ['student-profile-id-1', 'student-profile-id-2'], 
    required: false, 
    description: 'Array of student profile IDs (replaces all existing)',
    type: [String]
  })
  @IsArray()
  @IsOptional()
  studentIds?: string[];

  @ApiProperty({ 
    example: ['teacher-profile-id-1', 'teacher-profile-id-2'], 
    required: false, 
    description: 'Array of teacher profile IDs (replaces all existing)',
    type: [String]
  })
  @IsArray()
  @IsOptional()
  teacherIds?: string[];
}

