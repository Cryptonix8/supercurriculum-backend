import { Controller, Get, Query, Param } from '@nestjs/common';
import { SupercurriculumService } from './supercurriculum.service';
import { Band } from '@prisma/client';

@Controller('supercurriculum')
export class SupercurriculumController {
  constructor(private readonly supercurriculumService: SupercurriculumService) {}

  /**
   * GET /supercurriculum/structure?yearGroup=year_7
   * Returns complete curriculum structure for a year group
   */
  @Get('structure')
  async getStructure(@Query('yearGroup') yearGroup: string = 'year_7') {
    return this.supercurriculumService.getCompleteStructure(yearGroup);
  }

  /**
   * GET /supercurriculum/intervention?subject=english&skill=reading&band=DEVELOPING&yearGroup=year_7
   * Returns intervention guidance for specific subject/skill/band
   */
  @Get('intervention')
  async getIntervention(
    @Query('subject') subject: string,
    @Query('skill') skill: string,
    @Query('band') band: Band,
    @Query('yearGroup') yearGroup: string = 'year_7',
  ) {
    return this.supercurriculumService.getIntervention(
      subject,
      skill,
      band,
      yearGroup,
    );
  }

  /**
   * GET /supercurriculum/activities?subject=english&skill=reading&band=DEVELOPING&yearGroup=year_7&limit=10
   * Returns activities for specific subject/skill/band
   */
  @Get('activities')
  async getActivities(
    @Query('subject') subject: string,
    @Query('skill') skill: string,
    @Query('band') band: Band,
    @Query('yearGroup') yearGroup: string = 'year_7',
    @Query('limit') limit: string = '10',
  ) {
    return this.supercurriculumService.getActivities(
      subject,
      skill,
      band,
      yearGroup,
      parseInt(limit, 10),
    );
  }

  /**
   * GET /supercurriculum/student/:userId/recommendations
   * Returns personalized recommendations based on student's current bands
   */
  @Get('student/:userId/recommendations')
  async getStudentRecommendations(@Param('userId') userId: string) {
    return this.supercurriculumService.getStudentRecommendations(userId);
  }

  /**
   * GET /supercurriculum/openai-reference?yearGroup=year_7
   * Returns formatted data for OpenAI system prompt or RAG
   */
  @Get('openai-reference')
  async getOpenAIReference(@Query('yearGroup') yearGroup: string = 'year_7') {
    return this.supercurriculumService.generateOpenAIReference(yearGroup);
  }

  /**
   * GET /supercurriculum/export
   * Exports complete curriculum data for all year groups
   * Use this to generate a JSON file for OpenAI reference
   */
  @Get('export')
  async exportForOpenAI() {
    return this.supercurriculumService.exportForOpenAI();
  }
}

