import { IsString, IsArray, ValidateNested, IsOptional, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class QuestionDto {
  @ApiProperty({ example: 'I can identify key themes in a text' })
  @IsString()
  statement: string;
}

export class CreateFeedbackTestDto {
  @ApiProperty()
  @IsString()
  subjectId: string;

  @ApiProperty()
  @IsString()
  skillId: string;

  @ApiProperty({ example: 'Reading Skills Assessment' })
  @IsString()
  title: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    type: [QuestionDto],
    example: [
      { statement: 'I can identify key themes in a text' },
      { statement: 'I can make inferences from what I read' },
      { statement: 'I can summarize the main points' },
      { statement: 'I can analyze the author\'s purpose' },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions: QuestionDto[];

  @ApiProperty({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}

