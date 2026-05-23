import { IsString, IsOptional, IsBoolean, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSkillGapAlertDto {
  @ApiProperty()
  @IsString()
  skillGapId: string;

  @ApiProperty()
  @IsString()
  studentId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teacherId?: string;

  @ApiProperty()
  @IsString()
  message: string;
}

export class UpdateAlertDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRead?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isSnoozed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  snoozedUntil?: string;
}

export class GetAlertsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teacherId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Only show unread alerts' })
  @IsOptional()
  @IsBoolean()
  unreadOnly?: boolean;
}

