import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Get all users (Admin/Teacher only)' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  findAll(@Query('role') role?: string) {
    return this.usersService.findAll(role);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user info' })
  @ApiResponse({ status: 200, description: 'User info retrieved' })
  getCurrentUser(@Request() req) {
    return this.usersService.findOne(req.user.id);
  }

  @Get('me/profile')
  @ApiOperation({ summary: 'Get student profile' })
  @ApiResponse({ status: 200, description: 'Student profile retrieved' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  getMyProfile(@Request() req) {
    return this.usersService.getProfile(req.user.id);
  }

  @Patch('me/profile')
  @ApiOperation({ summary: 'Update student profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  updateMyProfile(@Request() req, @Body() updateProfileDto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.id, updateProfileDto);
  }

  // Teacher Management Endpoints (must come before :id routes)
  @Get('teachers')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ 
    summary: 'Get all teachers',
    description: 'Retrieves a list of all teachers with their profiles'
  })
  @ApiResponse({ status: 200, description: 'Teachers retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findAllTeachers() {
    return this.usersService.findAllTeachers();
  }

  @Post('teachers')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ 
    summary: 'Create a new teacher (Admin only)',
    description: 'Creates a teacher user account with profile, contact info, and permissions'
  })
  @ApiResponse({ status: 201, description: 'Teacher created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  createTeacher(@Body() createTeacherDto: CreateTeacherDto) {
    return this.usersService.createTeacher(createTeacherDto);
  }

  @Get('teachers/:id/profile')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ 
    summary: 'Get teacher profile',
    description: 'Retrieves detailed teacher profile including contact info, permissions, and assigned classes'
  })
  @ApiResponse({ status: 200, description: 'Teacher profile retrieved' })
  @ApiResponse({ status: 404, description: 'Teacher profile not found' })
  getTeacherProfile(@Param('id') id: string) {
    return this.usersService.getTeacherProfile(id);
  }

  @Patch('teachers/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ 
    summary: 'Update teacher (Admin only)',
    description: 'Updates teacher account information, contact details, and permissions'
  })
  @ApiResponse({ status: 200, description: 'Teacher updated successfully' })
  @ApiResponse({ status: 404, description: 'Teacher not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  updateTeacher(@Param('id') id: string, @Body() updateTeacherDto: UpdateTeacherDto) {
    return this.usersService.updateTeacher(id, updateTeacherDto);
  }

  // Generic user routes (must come after specific routes like 'teachers')
  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'User found' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update user (Admin only)' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete user (Admin only)' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}

