import { IsString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitTaskDto {
  @ApiProperty({ example: 'user-uuid' })
  @IsString()
  userId: string;

  @ApiProperty({ example: 'planned-task-uuid', required: false })
  @IsString()
  @IsOptional()
  plannedTaskId?: string;

  @ApiProperty({ example: 'activity-uuid' })
  @IsString()
  activityId: string;

  @ApiProperty({
    example: 'My essay about climate change...',
    description: 'Text content of the submission',
  })
  @IsString()
  textContent: string;

  @ApiProperty({
    example: ['https://example.com/image1.jpg'],
    required: false,
    description: 'Array of media URLs',
  })
  @IsArray()
  @IsOptional()
  mediaUrls?: string[];
}

