import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BulkStudentDto {
  @ApiProperty()
  email: string;

  @ApiProperty()
  password: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty({ required: false })
  yearGroupName?: string; // e.g., "Year 7", "Year 8"

  @ApiProperty({ required: false })
  className?: string; // Class name to assign to

  @ApiProperty({ required: false })
  nickname?: string;

  @ApiProperty({ required: false })
  age?: number;

  @ApiProperty({ required: false })
  homeLanguages?: string; // Comma-separated

  @ApiProperty({ required: false })
  englishProficiency?: string;
}

export class BulkImportStudentsDto {
  @ApiProperty({ type: [BulkStudentDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkStudentDto)
  students: BulkStudentDto[];
}

