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
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { InterventionsService } from './interventions.service';
import { CreateInterventionDto } from './dto/create-intervention.dto';
import { UpdateInterventionDto } from './dto/update-intervention.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Content')
@Controller('interventions')
export class InterventionsController {
  constructor(private readonly interventionsService: InterventionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create intervention (Admin/Teacher)' })
  @ApiResponse({ status: 201, description: 'Intervention created' })
  create(@Body() createInterventionDto: CreateInterventionDto) {
    return this.interventionsService.create(createInterventionDto);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all interventions' })
  @ApiResponse({ status: 200, description: 'Interventions retrieved' })
  findAll(
    @Query('subjectId') subjectId?: string,
    @Query('skillId') skillId?: string,
    @Query('band') band?: string,
  ) {
    return this.interventionsService.findAll({ subjectId, skillId, band });
  }

  @Get('my-interventions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get interventions for my current bands' })
  @ApiResponse({ status: 200, description: 'Interventions retrieved' })
  getMyInterventions(@Request() req) {
    return this.interventionsService.getInterventionsForStudent(req.user.id);
  }

  @Get('subject/:subjectId')
  @Public()
  @ApiOperation({ summary: 'Get all interventions for a subject' })
  @ApiResponse({ status: 200, description: 'Interventions retrieved' })
  getSubjectInterventions(@Param('subjectId') subjectId: string) {
    return this.interventionsService.getInterventionsForSubject(subjectId);
  }

  @Get('subject/:subjectId/skill/:skillId/band/:band')
  @Public()
  @ApiOperation({ summary: 'Get intervention for specific combination' })
  @ApiResponse({ status: 200, description: 'Intervention found' })
  @ApiResponse({ status: 404, description: 'Intervention not found' })
  getSpecificIntervention(
    @Param('subjectId') subjectId: string,
    @Param('skillId') skillId: string,
    @Param('band') band: string,
  ) {
    return this.interventionsService.getIntervention(subjectId, skillId, band);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get intervention by ID' })
  @ApiResponse({ status: 200, description: 'Intervention found' })
  @ApiResponse({ status: 404, description: 'Intervention not found' })
  findOne(@Param('id') id: string) {
    return this.interventionsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update intervention (Admin/Teacher)' })
  @ApiResponse({ status: 200, description: 'Intervention updated' })
  update(
    @Param('id') id: string,
    @Body() updateInterventionDto: UpdateInterventionDto,
  ) {
    return this.interventionsService.update(id, updateInterventionDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete intervention (Admin)' })
  @ApiResponse({ status: 200, description: 'Intervention deleted' })
  remove(@Param('id') id: string) {
    return this.interventionsService.remove(id);
  }
}
