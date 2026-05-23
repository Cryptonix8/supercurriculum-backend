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
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { BulkImportStudentsDto } from './dto/bulk-import-students.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Students')
@Controller('students')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ 
    summary: 'Create a new student',
    description: 'Creates a student user account with profile'
  })
  @ApiResponse({ status: 201, description: 'Student created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin/Teacher role required' })
  create(@Body() createStudentDto: CreateStudentDto) {
    return this.studentsService.create(createStudentDto);
  }

  @Post('bulk-import')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ 
    summary: 'Bulk import students (Admin only)',
    description: 'Import multiple students from an array of student data'
  })
  @ApiResponse({ status: 201, description: 'Students imported successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  bulkImportStudents(@Body() bulkImportDto: BulkImportStudentsDto) {
    return this.studentsService.bulkImport(bulkImportDto);
  }

  @Post('bulk-import/csv')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ 
    summary: 'Bulk import students from CSV (Admin only)',
    description: 'Upload a CSV file to import multiple students. Required columns: email, password, firstName, lastName. Optional: yearGroupName, className, nickname, age, homeLanguages, englishProficiency'
  })
  @ApiResponse({ status: 201, description: 'Students imported from CSV successfully' })
  @ApiResponse({ status: 400, description: 'Invalid CSV file' })
  async bulkImportFromCSV(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No CSV file provided');
    }
    return this.studentsService.bulkImportFromCSV(file);
  }

  @Post(':id/avatar')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ 
    summary: 'Upload student avatar',
    description: 'Upload a profile photo/avatar for a student'
  })
  @ApiResponse({ status: 200, description: 'Avatar uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file' })
  async uploadAvatar(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }
    return this.studentsService.uploadAvatar(id, file);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ 
    summary: 'Get all students',
    description: 'Retrieves a list of all students with their profiles'
  })
  @ApiResponse({ status: 200, description: 'Students retrieved successfully' })
  findAll(
    @Query('yearGroupId') yearGroupId?: string,
    @Query('classId') classId?: string,
    @Query('search') search?: string,
  ) {
    return this.studentsService.findAll({ yearGroupId, classId, search });
  }

  @Get(':id/performance')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ 
    summary: 'Get student performance data',
    description: 'Retrieves comprehensive performance data including mastery levels, tests, and activity'
  })
  @ApiResponse({ status: 200, description: 'Performance data retrieved successfully' })
  getPerformance(@Param('id') id: string) {
    return this.studentsService.getStudentPerformance(id);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ 
    summary: 'Get student by ID',
    description: 'Retrieves detailed student information including profile and class assignments'
  })
  @ApiResponse({ status: 200, description: 'Student found' })
  @ApiResponse({ status: 404, description: 'Student not found' })
  findOne(@Param('id') id: string) {
    return this.studentsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ 
    summary: 'Update student',
    description: 'Updates student account information and profile'
  })
  @ApiResponse({ status: 200, description: 'Student updated successfully' })
  @ApiResponse({ status: 404, description: 'Student not found' })
  update(@Param('id') id: string, @Body() updateStudentDto: UpdateStudentDto) {
    return this.studentsService.update(id, updateStudentDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ 
    summary: 'Delete student (Admin only)',
    description: 'Soft deletes a student by deactivating their account'
  })
  @ApiResponse({ status: 200, description: 'Student deleted successfully' })
  remove(@Param('id') id: string) {
    return this.studentsService.remove(id);
  }

  @Post(':id/assign-class')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ 
    summary: 'Assign student to class',
    description: 'Assigns a student to one or more classes'
  })
  @ApiResponse({ status: 200, description: 'Student assigned to class successfully' })
  assignToClass(
    @Param('id') id: string,
    @Body('classIds') classIds: string[],
  ) {
    return this.studentsService.assignToClasses(id, classIds);
  }

  @Delete(':id/unassign-class/:classId')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiOperation({ 
    summary: 'Unassign student from class',
    description: 'Removes a student from a class'
  })
  @ApiResponse({ status: 200, description: 'Student unassigned from class successfully' })
  unassignFromClass(
    @Param('id') id: string,
    @Param('classId') classId: string,
  ) {
    return this.studentsService.unassignFromClass(id, classId);
  }
}

