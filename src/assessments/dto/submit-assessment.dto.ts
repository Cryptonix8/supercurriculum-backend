import { IsString, IsArray, ValidateNested, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class AnswerDto {
  @ApiProperty({ example: 'question-uuid' })
  @IsString()
  questionId: string;

  @ApiProperty({ example: 4, description: 'Score from 1-5' })
  @IsInt()
  @Min(1)
  @Max(5)
  score: number;
}

export class SubmitAssessmentDto {
  @ApiProperty({ example: 'user-uuid' })
  @IsString()
  userId: string;

  @ApiProperty({ example: 'test-uuid' })
  @IsString()
  testId: string;

  @ApiProperty({
    type: [AnswerDto],
    example: [
      { questionId: 'q1-uuid', score: 4 },
      { questionId: 'q2-uuid', score: 5 },
      { questionId: 'q3-uuid', score: 3 },
      { questionId: 'q4-uuid', score: 4 },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[];
}

