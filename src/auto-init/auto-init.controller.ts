import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AutoInitService } from './auto-init.service';

@ApiTags('System')
@Controller('system')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AutoInitController {
  constructor(private readonly autoInitService: AutoInitService) {}

  @Post('reinitialize')
  @ApiOperation({ summary: 'Force re-initialization from PDFs (Admin only)' })
  async reinitialize() {
    return this.autoInitService.forceReInitialize();
  }
}
