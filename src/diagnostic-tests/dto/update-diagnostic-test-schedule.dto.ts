import { ApiPropertyOptional } from '@nestjs/swagger';
import { 
  IsString, 
  IsDateString, 
  IsArray, 
  IsEnum, 
  IsOptional 
} from 'class-validator';
import { DiagnosticTestType, DiagnosticTestStatus } from '@prisma/client';

export class UpdateDiagnosticTestScheduleDto {
  @ApiPropertyOptional({ description: 'Title of the diagnostic test' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'Description of the diagnostic test' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ 
    description: 'Type of diagnostic test',
    enum: DiagnosticTestType
  })
  @IsEnum(DiagnosticTestType)
  @IsOptional()
  testType?: DiagnosticTestType;

  @ApiPropertyOptional({ 
    description: 'Status of the diagnostic test',
    enum: DiagnosticTestStatus
  })
  @IsEnum(DiagnosticTestStatus)
  @IsOptional()
  status?: DiagnosticTestStatus;

  @ApiPropertyOptional({ 
    description: 'Array of class IDs',
    type: [String]
  })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  classIds?: string[];

  @ApiPropertyOptional({ 
    description: 'Specific student IDs',
    type: [String]
  })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  studentIds?: string[];

  @ApiPropertyOptional({ description: 'Start date/time for the test window' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date/time for the test window' })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}

