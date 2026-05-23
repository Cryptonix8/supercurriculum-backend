import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class TutorSpeechDto {
  @ApiPropertyOptional({ example: 'session_12345' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiProperty({ example: "Let's solve this step by step." })
  @IsString()
  text: string;

  @ApiPropertyOptional({
    example: {
      plan: 'First we find a common denominator.',
      steps: ['Rewrite the fractions with the same denominator.', 'Do the operation.'],
      finalAnswer: 'The result is three quarters.',
    },
  })
  @IsOptional()
  @IsObject()
  structuredContent?: {
    plan?: string;
    hints?: string[];
    steps?: string[];
    finalAnswer?: string;
    quickCheck?: string;
    commonMistakes?: string[];
    recap?: string;
    visualAid?: string;
  };

  @ApiPropertyOptional({ enum: ['en-GB'], default: 'en-GB' })
  @IsOptional()
  @IsIn(['en-GB'])
  locale?: string;

  @ApiPropertyOptional({ enum: ['hints', 'full_solution'], default: 'full_solution' })
  @IsOptional()
  @IsIn(['hints', 'full_solution'])
  learningMode?: 'hints' | 'full_solution';

  @ApiPropertyOptional({ enum: ['alloy', 'verse', 'aria'], default: 'alloy' })
  @IsOptional()
  @IsIn(['alloy', 'verse', 'aria'])
  voice?: 'alloy' | 'verse' | 'aria';

  @ApiPropertyOptional({ example: 1.0, minimum: 0.8, maximum: 1.2, default: 1.0 })
  @IsOptional()
  @IsNumber()
  @Min(0.8)
  @Max(1.2)
  speed?: number;
}
