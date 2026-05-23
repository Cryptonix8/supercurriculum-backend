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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FeedbackTestsService } from './feedback-tests.service';
import { CreateFeedbackTestDto } from './dto/create-feedback-test.dto';
import { UpdateFeedbackTestDto } from './dto/update-feedback-test.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Assessments')
@Controller('feedback-tests')
export class FeedbackTestsController {
  constructor(private readonly feedbackTestsService: FeedbackTestsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create feedback test (Admin/Teacher)' })
  @ApiResponse({ status: 201, description: 'Test created successfully' })
  create(@Body() createFeedbackTestDto: CreateFeedbackTestDto) {
    return this.feedbackTestsService.create(createFeedbackTestDto);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all feedback tests' })
  @ApiResponse({ status: 200, description: 'Tests retrieved successfully' })
  findAll(
    @Query('subjectId') subjectId?: string,
    @Query('skillId') skillId?: string,
    @Query('yearGroupId') yearGroupId?: string,
  ) {
    return this.feedbackTestsService.findAll(subjectId, skillId, yearGroupId);
  }

  @Get('year/:yearGroupId')
  @Public()
  @ApiOperation({ summary: 'Get all tests for a year group' })
  findByYearGroup(@Param('yearGroupId') yearGroupId: string) {
    return this.feedbackTestsService.findByYearGroup(yearGroupId);
  }

  @Get('subject/:subjectId/skill/:skillId')
  @Public()
  @ApiOperation({ summary: 'Get test for specific subject and skill' })
  @ApiResponse({ status: 200, description: 'Test found' })
  @ApiResponse({ status: 404, description: 'Test not found' })
  findBySubjectAndSkill(
    @Param('subjectId') subjectId: string,
    @Param('skillId') skillId: string,
  ) {
    return this.feedbackTestsService.findBySubjectAndSkill(subjectId, skillId);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get feedback test by ID' })
  @ApiResponse({ status: 200, description: 'Test found' })
  @ApiResponse({ status: 404, description: 'Test not found' })
  findOne(@Param('id') id: string) {
    return this.feedbackTestsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update feedback test (Admin/Teacher)' })
  @ApiResponse({ status: 200, description: 'Test updated successfully' })
  update(
    @Param('id') id: string,
    @Body() updateFeedbackTestDto: UpdateFeedbackTestDto,
  ) {
    return this.feedbackTestsService.update(id, updateFeedbackTestDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete feedback test (Admin)' })
  @ApiResponse({ status: 200, description: 'Test deleted successfully' })
  remove(@Param('id') id: string) {
    return this.feedbackTestsService.remove(id);
  }
}
