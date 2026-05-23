import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional, IsDateString, ArrayMinSize } from 'class-validator';

export class AssignToStudentsDto {
  @ApiProperty({
    description: 'Array of student IDs',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  studentIds: string[];

  @ApiPropertyOptional({
    description: 'Due date for the assignment',
  })
  @IsDateString()
  @IsOptional()
  dueDate?: string;
}

export class ShareAssignmentDto {
  @ApiProperty({
    description: 'Array of teacher/user IDs to share with',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  teacherIds: string[];

  @ApiPropertyOptional({
    description: 'Whether recipients can edit the assignment',
    default: false,
  })
  @IsOptional()
  canEdit?: boolean;
}

