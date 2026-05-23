import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { CustomAssignmentsService } from './custom-assignments.service';
import { CreateCustomAssignmentDto } from './dto/create-custom-assignment.dto';
import { UpdateCustomAssignmentDto } from './dto/update-custom-assignment.dto';
import { AssignToStudentsDto, ShareAssignmentDto } from './dto/assign-to-students.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AssignmentStatus, AssignmentVisibility } from '@prisma/client';

@ApiTags('Custom Assignments')
@Controller('custom-assignments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CustomAssignmentsController {
  constructor(
    private readonly customAssignmentsService: CustomAssignmentsService,
  ) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate a new custom assignment using AI' })
  @ApiResponse({ status: 201, description: 'Assignment generated successfully' })
  async generateAssignment(
    @Body() dto: CreateCustomAssignmentDto,
    @Request() req,
  ) {
    return this.customAssignmentsService.generateAssignment(dto, req.user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all custom assignments' })
  @ApiQuery({ name: 'createdById', required: false })
  @ApiQuery({ name: 'subjectId', required: false })
  @ApiQuery({ name: 'yearGroupId', required: false })
  @ApiQuery({ name: 'status', enum: AssignmentStatus, required: false })
  @ApiQuery({ name: 'visibility', enum: AssignmentVisibility, required: false })
  @ApiQuery({ name: 'tag', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiResponse({ status: 200, description: 'List of assignments' })
  async getAllAssignments(
    @Query('createdById') createdById?: string,
    @Query('subjectId') subjectId?: string,
    @Query('yearGroupId') yearGroupId?: string,
    @Query('status') status?: AssignmentStatus,
    @Query('visibility') visibility?: AssignmentVisibility,
    @Query('tag') tag?: string,
    @Query('search') search?: string,
  ) {
    return this.customAssignmentsService.getAllAssignments({
      createdById,
      subjectId,
      yearGroupId,
      status,
      visibility,
      tag,
      search,
    });
  }

  @Get('shared')
  @ApiOperation({ summary: 'Get assignments shared with me' })
  @ApiResponse({ status: 200, description: 'List of shared assignments' })
  async getSharedAssignments(@Request() req) {
    return this.customAssignmentsService.getSharedAssignments(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific assignment' })
  @ApiResponse({ status: 200, description: 'Assignment details' })
  @ApiResponse({ status: 404, description: 'Assignment not found' })
  async getAssignment(@Param('id') id: string, @Request() req) {
    return this.customAssignmentsService.getAssignment(id, req.user.userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an assignment' })
  @ApiResponse({ status: 200, description: 'Assignment updated successfully' })
  @ApiResponse({ status: 404, description: 'Assignment not found' })
  async updateAssignment(
    @Param('id') id: string,
    @Body() dto: UpdateCustomAssignmentDto,
    @Request() req,
  ) {
    return this.customAssignmentsService.updateAssignment(id, dto, req.user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an assignment' })
  @ApiResponse({ status: 200, description: 'Assignment deleted successfully' })
  @ApiResponse({ status: 404, description: 'Assignment not found' })
  async deleteAssignment(@Param('id') id: string, @Request() req) {
    return this.customAssignmentsService.deleteAssignment(id, req.user.userId);
  }

  @Post(':id/assign')
  @ApiOperation({ summary: 'Assign assignment to students' })
  @ApiResponse({ status: 200, description: 'Assignment assigned successfully' })
  async assignToStudents(
    @Param('id') id: string,
    @Body() dto: AssignToStudentsDto,
    @Request() req,
  ) {
    return this.customAssignmentsService.assignToStudents(id, dto, req.user.userId);
  }

  @Post(':id/share')
  @ApiOperation({ summary: 'Share assignment with other teachers' })
  @ApiResponse({ status: 200, description: 'Assignment shared successfully' })
  async shareAssignment(
    @Param('id') id: string,
    @Body() dto: ShareAssignmentDto,
    @Request() req,
  ) {
    return this.customAssignmentsService.shareAssignment(id, dto, req.user.userId);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get assignment statistics' })
  @ApiResponse({ status: 200, description: 'Assignment statistics' })
  async getAssignmentStats(@Param('id') id: string, @Request() req) {
    return this.customAssignmentsService.getAssignmentStats(id, req.user.userId);
  }
}

