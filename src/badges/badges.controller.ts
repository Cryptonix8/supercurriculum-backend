import { Controller, Get, Post, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BadgesService } from './badges.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Progress')
@Controller('badges')
export class BadgesController {
  constructor(private readonly badgesService: BadgesService) {}

  @Get()
  @Public()
  findAll() {
    return this.badgesService.findAll();
  }

  @Get('my-badges')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getMyBadges(@Request() req) {
    return this.badgesService.getUserBadges(req.user.id);
  }

  @Post('check-awards')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async checkAndAward(@Request() req) {
    const newBadges = await this.badgesService.checkAndAwardBadges(req.user.id);
    return {
      newBadges,
      count: newBadges.length,
      message: newBadges.length > 0 
        ? `Congratulations! You earned ${newBadges.length} new badge(s)!` 
        : 'No new badges yet. Keep practicing!',
    };
  }

  @Get('progress')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getBadgeProgress(@Request() req) {
    return this.badgesService.getBadgeProgress(req.user.id);
  }

  @Get('points')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getMyPoints(@Request() req) {
    return this.badgesService.getUserPoints(req.user.id);
  }
}

