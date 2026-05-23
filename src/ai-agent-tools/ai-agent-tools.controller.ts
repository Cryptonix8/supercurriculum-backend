import { Controller, Post, Body, UseGuards, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AiAgentToolsService } from './ai-agent-tools.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurriculumLookupDto,
  ExtractObjectivesDto,
  AnalyzeStudentDto,
  GenerateActivityTemplateDto,
  ValidateStandardsDto,
  FindResourcesDto,
} from './dto';

@ApiTags('AI Agent Tools')
@Controller('ai-agent-tools')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AiAgentToolsController {
  constructor(private readonly aiAgentToolsService: AiAgentToolsService) {}

  @Post('curriculum-lookup')
  @ApiOperation({ summary: 'Retrieve curriculum content from database' })
  @ApiResponse({ status: 200, description: 'Curriculum topics retrieved successfully' })
  async curriculumLookup(@Body() dto: CurriculumLookupDto) {
    return this.aiAgentToolsService.curriculumLookup(dto);
  }

  @Post('extract-objectives')
  @ApiOperation({ summary: 'Get specific learning objectives for topics' })
  @ApiResponse({ status: 200, description: 'Learning objectives extracted successfully' })
  async extractObjectives(@Body() dto: ExtractObjectivesDto) {
    return this.aiAgentToolsService.extractObjectives(dto);
  }

  @Post('analyze-student')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @ApiOperation({ summary: 'Analyze student data for personalization (Teachers/Admins only)' })
  @ApiResponse({ status: 200, description: 'Student analysis completed successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Teacher or Admin role required' })
  async analyzeStudent(@Body() dto: AnalyzeStudentDto) {
    return this.aiAgentToolsService.analyzeStudent(dto);
  }

  @Post('generate-activity-template')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @ApiOperation({ summary: 'Generate structured activity template (Teachers/Admins only)' })
  @ApiResponse({ status: 200, description: 'Activity template generated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Teacher or Admin role required' })
  async generateActivityTemplate(@Body() dto: GenerateActivityTemplateDto) {
    return this.aiAgentToolsService.generateActivityTemplate(dto);
  }

  @Post('validate-standards')
  @ApiOperation({ summary: 'Check curriculum alignment with national standards' })
  @ApiResponse({ status: 200, description: 'Standards validation completed successfully' })
  async validateStandards(@Body() dto: ValidateStandardsDto) {
    return this.aiAgentToolsService.validateStandards(dto);
  }

  @Get('find-resources')
  @ApiOperation({ summary: 'Find educational resources (BBC Bitesize, Khan Academy, etc.)' })
  @ApiResponse({ status: 200, description: 'Resources found successfully' })
  async findResources(@Query() dto: FindResourcesDto) {
    return this.aiAgentToolsService.findResources(dto);
  }

  @Post('find-resources')
  @ApiOperation({ summary: 'Find educational resources (POST version with body)' })
  @ApiResponse({ status: 200, description: 'Resources found successfully' })
  async findResourcesPost(@Body() dto: FindResourcesDto) {
    return this.aiAgentToolsService.findResources(dto);
  }
}

