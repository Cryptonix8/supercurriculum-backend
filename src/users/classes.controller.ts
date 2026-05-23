import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ClassesService } from './classes.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Classes')
@Controller('classes')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create a new class (Admin only)' })
  @ApiResponse({ status: 201, description: 'Class created successfully' })
  create(@Body() createClassDto: CreateClassDto) {
    return this.classesService.create(createClassDto);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Get all classes' })
  @ApiResponse({ status: 200, description: 'Classes retrieved successfully' })
  findAll(
    @Query('yearGroupId') yearGroupId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('teacherId') teacherId?: string,
  ) {
    return this.classesService.findAll({ yearGroupId, subjectId, teacherId });
  }

  @Get(':id/analytics')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Get class analytics' })
  @ApiResponse({ status: 200, description: 'Analytics retrieved successfully' })
  getAnalytics(@Param('id') id: string) {
    return this.classesService.getClassAnalytics(id);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Get class by ID' })
  @ApiResponse({ status: 200, description: 'Class found' })
  @ApiResponse({ status: 404, description: 'Class not found' })
  findOne(@Param('id') id: string) {
    return this.classesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update class (Admin only)' })
  @ApiResponse({ status: 200, description: 'Class updated successfully' })
  update(@Param('id') id: string, @Body() updateClassDto: UpdateClassDto) {
    return this.classesService.update(id, updateClassDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete class (Admin only)' })
  @ApiResponse({ status: 200, description: 'Class deleted successfully' })
  remove(@Param('id') id: string) {
    return this.classesService.remove(id);
  }

  @Post(':id/students')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ 
    summary: 'Add students to class (Admin only)',
    description: 'Add multiple students to a class by their student profile IDs'
  })
  @ApiResponse({ status: 200, description: 'Students added successfully' })
  addStudents(@Param('id') id: string, @Body('studentIds') studentIds: string[]) {
    return this.classesService.addStudents(id, studentIds);
  }

  @Delete(':id/students')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ 
    summary: 'Remove students from class (Admin only)',
    description: 'Remove multiple students from a class'
  })
  @ApiResponse({ status: 200, description: 'Students removed successfully' })
  removeStudents(@Param('id') id: string, @Body('studentIds') studentIds: string[]) {
    return this.classesService.removeStudents(id, studentIds);
  }

  @Post(':id/teachers')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ 
    summary: 'Add teachers to class (Admin only)',
    description: 'Add multiple teachers to a class. First teacher can be set as main teacher.'
  })
  @ApiResponse({ status: 200, description: 'Teachers added successfully' })
  addTeachers(
    @Param('id') id: string,
    @Body('teacherIds') teacherIds: string[],
    @Body('makeMainTeacher') makeMainTeacher?: boolean,
  ) {
    return this.classesService.addTeachers(id, teacherIds, makeMainTeacher);
  }

  @Delete(':id/teachers')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ 
    summary: 'Remove teachers from class (Admin only)',
    description: 'Remove multiple teachers from a class'
  })
  @ApiResponse({ status: 200, description: 'Teachers removed successfully' })
  removeTeachers(@Param('id') id: string, @Body('teacherIds') teacherIds: string[]) {
    return this.classesService.removeTeachers(id, teacherIds);
  }

  // ============================================
  // CLASS SCHEDULE ENDPOINTS
  // ============================================

  @Get(':id/schedules')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ 
    summary: 'Get class schedules',
    description: 'Retrieve all schedules for a specific class'
  })
  @ApiResponse({ status: 200, description: 'Schedules retrieved successfully' })
  getSchedules(@Param('id') id: string) {
    return this.classesService.getSchedules(id);
  }

  @Get(':id/timetable')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ 
    summary: 'Get weekly timetable',
    description: 'Get organized weekly timetable for a class'
  })
  @ApiResponse({ status: 200, description: 'Timetable retrieved successfully' })
  getWeeklyTimetable(@Param('id') id: string) {
    return this.classesService.getWeeklyTimetable(id);
  }

  @Post(':id/schedules')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ 
    summary: 'Create class schedule (Admin only)',
    description: 'Add a new schedule entry for a class (e.g., Monday 9:00-10:00)'
  })
  @ApiResponse({ status: 201, description: 'Schedule created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid schedule or overlap detected' })
  createSchedule(@Param('id') id: string, @Body() createScheduleDto: CreateScheduleDto) {
    return this.classesService.createSchedule(id, createScheduleDto);
  }

  @Patch('schedules/:scheduleId')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ 
    summary: 'Update class schedule (Admin only)',
    description: 'Modify an existing class schedule'
  })
  @ApiResponse({ status: 200, description: 'Schedule updated successfully' })
  @ApiResponse({ status: 404, description: 'Schedule not found' })
  updateSchedule(@Param('scheduleId') scheduleId: string, @Body() updateScheduleDto: UpdateScheduleDto) {
    return this.classesService.updateSchedule(scheduleId, updateScheduleDto);
  }

  @Delete('schedules/:scheduleId')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ 
    summary: 'Delete class schedule (Admin only)',
    description: 'Remove a schedule entry from a class'
  })
  @ApiResponse({ status: 200, description: 'Schedule deleted successfully' })
  deleteSchedule(@Param('scheduleId') scheduleId: string) {
    return this.classesService.deleteSchedule(scheduleId);
  }
}

