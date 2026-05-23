import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkImportDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  file: any;
}

export class ParseNCDocumentDto {
  @ApiProperty({ description: 'National Curriculum document text to parse' })
  @IsString()
  @IsNotEmpty()
  documentText: string;

  @ApiProperty({ description: 'Year Group ID', required: false })
  @IsOptional()
  @IsString()
  yearGroupId?: string;

  @ApiProperty({ description: 'Subject ID', required: false })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiProperty({ description: 'Key Stage', required: false })
  @IsOptional()
  @IsString()
  keyStage?: string;
}

