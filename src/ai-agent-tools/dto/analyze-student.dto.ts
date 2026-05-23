import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AnalyzeStudentDto {
  @ApiProperty({ description: 'User ID of the student to analyze' })
  @IsString()
  @IsNotEmpty()
  userId: string;
}

