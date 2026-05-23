import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OnboardingTestsService } from './onboarding-tests.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

@ApiTags('Onboarding Tests')
@Controller('onboarding')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OnboardingTestsController {
  constructor(
    private readonly onboardingTestsService: OnboardingTestsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Get student onboarding status' })
  @ApiResponse({ status: 200, description: 'Returns current onboarding status' })
  async getOnboardingStatus(@Request() req) {
    return this.onboardingTestsService.getOnboardingStatus(req.user.id);
  }

  @Get('mandatory-test')
  @ApiOperation({ summary: 'Get unified mandatory test (Part A + Part B)' })
  @ApiResponse({ status: 200, description: 'Returns the mandatory test that must be completed' })
  async getMandatoryTest(
    @Request() req,
    @Query('yearGroupId') yearGroupId?: string,
    @Query('locale') locale?: string,
  ) {
    // Get student profile to get year group
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId: req.user.id },
    });

    if (!profile) {
      throw new NotFoundException('Student profile not found. Please complete your profile first.');
    }

    return this.onboardingTestsService.getUnifiedMandatoryTest(
      req.user.id,
      yearGroupId || profile.yearGroupId,
      locale,
    );
  }

  @Post('mandatory-test/submit')
  @ApiOperation({ summary: 'Submit unified mandatory test (Part A + Part B, Part B optional for first year)' })
  @ApiResponse({ status: 200, description: 'Test submitted and curriculum-first learning access enabled' })
  async submitMandatoryTest(
    @Request() req,
    @Body() body: {
      yearGroupId: string;
      partAAnswers: Record<string, any>;
      partBAnswers?: Record<string, any>; // Required when Part B applies (validated server-side)
      selectedSubjectIds?: string[];
    },
  ) {
    // Submit the test
    const result = await this.onboardingTestsService.submitUnifiedMandatoryTest(
      req.user.id,
      body.yearGroupId,
      body.partAAnswers,
      body.partBAnswers, // May be undefined for first year students
    );

    return {
      ...result,
      selectedSubjectIds: body.selectedSubjectIds || [],
      message: 'Test completed! Your curriculum setup is ready. Continue with Practice by Topic or Revision / Test Prep.',
    };
  }

  @Get('personality-test')
  @ApiOperation({ summary: 'Get personality test questions' })
  @ApiResponse({ status: 200, description: 'Returns personality test questions' })
  async getPersonalityTest(@Request() req, @Query('locale') locale?: string) {
    return this.onboardingTestsService.generatePersonalityTest(req.user.id, locale);
  }

  @Post('personality-test/submit')
  @ApiOperation({ summary: 'Submit personality test answers' })
  @ApiResponse({ status: 200, description: 'Returns personality test results' })
  async submitPersonalityTest(
    @Request() req,
    @Body() body: { answers: Record<string, any> },
  ) {
    return this.onboardingTestsService.submitPersonalityTest(
      req.user.id,
      body.answers,
    );
  }

  @Get('diagnostic-test/:yearGroupId')
  @ApiOperation({ summary: 'Get diagnostic test questions for a year group' })
  @ApiResponse({ status: 200, description: 'Returns diagnostic test questions' })
  async getDiagnosticTest(
    @Request() req,
    @Param('yearGroupId') yearGroupId: string,
    @Query('locale') locale?: string,
  ) {
    return this.onboardingTestsService.generateDiagnosticTest(
      req.user.id,
      yearGroupId,
      locale,
    );
  }

  @Post('diagnostic-test/:yearGroupId/submit')
  @ApiOperation({ summary: 'Submit diagnostic test answers' })
  @ApiResponse({ status: 200, description: 'Returns diagnostic test results with gap analysis' })
  async submitDiagnosticTest(
    @Request() req,
    @Param('yearGroupId') yearGroupId: string,
    @Body() body: { answers: Record<string, string> },
  ) {
    return this.onboardingTestsService.submitDiagnosticTest(
      req.user.id,
      yearGroupId,
      body.answers,
    );
  }
}
