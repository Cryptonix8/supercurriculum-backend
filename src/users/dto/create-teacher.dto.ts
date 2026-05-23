import { IsEmail, IsString, MinLength, IsOptional, IsBoolean, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTeacherDto {
  @ApiProperty({ example: 'teacher@school.com', description: 'Teacher email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!', description: 'Password (min 8 characters)' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'John', description: 'Teacher first name' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Smith', description: 'Teacher last name' })
  @IsString()
  lastName: string;

  // Contact Information
  @ApiProperty({ example: '+44 7700 900000', required: false, description: 'Contact phone number' })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiProperty({ example: 'Room 203, Building A', required: false, description: 'Office location' })
  @IsString()
  @IsOptional()
  officeLocation?: string;

  @ApiProperty({ example: 'Mathematics', required: false, description: 'Department name' })
  @IsString()
  @IsOptional()
  department?: string;

  @ApiProperty({ example: 'Head of Department', required: false, description: 'Job title' })
  @IsString()
  @IsOptional()
  jobTitle?: string;

  @ApiProperty({ example: 'Experienced maths teacher with 10 years experience', required: false, description: 'Biography' })
  @IsString()
  @IsOptional()
  bio?: string;

  // Permissions
  @ApiProperty({ example: false, required: false, description: 'Can edit activities and content', default: false })
  @IsBoolean()
  @IsOptional()
  canEditContent?: boolean;

  @ApiProperty({ example: false, required: false, description: 'Can add/edit students', default: false })
  @IsBoolean()
  @IsOptional()
  canManageUsers?: boolean;

  @ApiProperty({ example: false, required: false, description: 'Can view all classes (not just assigned)', default: false })
  @IsBoolean()
  @IsOptional()
  canViewAllClasses?: boolean;

  @ApiProperty({ example: true, required: false, description: 'Can assign tasks to students', default: true })
  @IsBoolean()
  @IsOptional()
  canAssignTasks?: boolean;

  @ApiProperty({ example: true, required: false, description: 'Can grade student work', default: true })
  @IsBoolean()
  @IsOptional()
  canGradeWork?: boolean;

  // Preferences
  @ApiProperty({ 
    example: ['uuid-1', 'uuid-2'], 
    required: false, 
    description: 'Array of subject IDs this teacher can teach',
    type: [String]
  })
  @IsArray()
  @IsOptional()
  subjects?: string[];
}

