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
import { YearsService } from './years.service';
import { CreateYearGroupDto } from './dto/create-year-group.dto';
import { UpdateYearGroupDto } from './dto/update-year-group.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Content')
@Controller('years')
export class YearsController {
  constructor(private readonly yearsService: YearsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new year group (Admin only)' })
  @ApiResponse({ status: 201, description: 'Year group created' })
  create(@Body() createYearGroupDto: CreateYearGroupDto) {
    return this.yearsService.create(createYearGroupDto);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all year groups' })
  @ApiResponse({ status: 200, description: 'Year groups retrieved' })
  findAll(
    @Query('includeInactive') includeInactive?: boolean,
    @Query('locale') locale?: string,
  ) {
    return this.yearsService.findAll(!includeInactive, locale);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get year group by ID' })
  @ApiResponse({ status: 200, description: 'Year group found' })
  @ApiResponse({ status: 404, description: 'Year group not found' })
  findOne(@Param('id') id: string) {
    return this.yearsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update year group (Admin only)' })
  @ApiResponse({ status: 200, description: 'Year group updated' })
  update(
    @Param('id') id: string,
    @Body() updateYearGroupDto: UpdateYearGroupDto,
  ) {
    return this.yearsService.update(id, updateYearGroupDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete year group (Admin only)' })
  @ApiResponse({ status: 200, description: 'Year group deleted' })
  remove(@Param('id') id: string) {
    return this.yearsService.remove(id);
  }
}

