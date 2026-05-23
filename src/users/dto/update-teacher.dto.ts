import { IsString, IsOptional, IsBoolean, IsArray, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateTeacherDto {
  @ApiProperty({ example: 'teacher@school.com', required: false, description: 'Teacher email address' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'John', required: false, description: 'Teacher first name' })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiProperty({ example: 'Smith', required: false, description: 'Teacher last name' })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiProperty({ example: true, required: false, description: 'Is teacher account active' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

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
  @ApiProperty({ example: false, required: false, description: 'Can edit activities and content' })
  @IsBoolean()
  @IsOptional()
  canEditContent?: boolean;

  @ApiProperty({ example: false, required: false, description: 'Can add/edit students' })
  @IsBoolean()
  @IsOptional()
  canManageUsers?: boolean;

  @ApiProperty({ example: false, required: false, description: 'Can view all classes (not just assigned)' })
  @IsBoolean()
  @IsOptional()
  canViewAllClasses?: boolean;

  @ApiProperty({ example: true, required: false, description: 'Can assign tasks to students' })
  @IsBoolean()
  @IsOptional()
  canAssignTasks?: boolean;

  @ApiProperty({ example: true, required: false, description: 'Can grade student work' })
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

