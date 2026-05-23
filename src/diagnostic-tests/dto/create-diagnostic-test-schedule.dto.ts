import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { 
  IsString, 
  IsNotEmpty, 
  IsDateString, 
  IsArray, 
  IsEnum, 
  IsOptional,
  ArrayMinSize 
} from 'class-validator';
import { DiagnosticTestType } from '@prisma/client';

export class CreateDiagnosticTestScheduleDto {
  @ApiProperty({ description: 'Title of the diagnostic test', example: 'Year 7 Mid-Year Assessment' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ description: 'Description of the diagnostic test' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ 
    description: 'Type of diagnostic test',
    enum: DiagnosticTestType,
    example: DiagnosticTestType.MID_YEAR
  })
  @IsEnum(DiagnosticTestType)
  testType: DiagnosticTestType;

  @ApiProperty({ description: 'Year group ID', example: 'uuid-here' })
  @IsString()
  @IsNotEmpty()
  yearGroupId: string;

  @ApiProperty({ 
    description: 'Array of class IDs to assign the test to',
    type: [String],
    example: ['class-uuid-1', 'class-uuid-2']
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  classIds: string[];

  @ApiPropertyOptional({ 
    description: 'Specific student IDs (empty = all students in classes)',
    type: [String]
  })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  studentIds?: string[];

  @ApiProperty({ description: 'Start date/time for the test window', example: '2024-01-15T00:00:00Z' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'End date/time for the test window', example: '2024-01-31T23:59:59Z' })
  @IsDateString()
  endDate: string;
}

