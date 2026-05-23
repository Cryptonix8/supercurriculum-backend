import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Guard that blocks access to content until mandatory test is completed
 */
@Injectable()
export class OnboardingCompleteGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || user.role !== 'STUDENT') {
      return true; // Not a student, allow access
    }

    // Check if student has completed mandatory test
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId: user.id },
    });

    if (!profile) {
      throw new ForbiddenException('Please complete your profile first');
    }

    const personalityTest = await this.prisma.personalityTest.findFirst({
      where: { userId: user.id },
    });

    // Get year group to check year number
    const yearGroup = await this.prisma.yearGroup.findUnique({
      where: { id: profile.yearGroupId },
    });

    // Extract year number
    const currentYearNum = yearGroup 
      ? parseInt(yearGroup.displayName.match(/\d+/)?.[0] || '5')
      : 5;

    // Check if student is in minimum year (Part B is skipped for minimum year)
    const minimumYear = await this.prisma.yearGroup.findFirst({
      where: { isActive: true },
      orderBy: { orderIndex: 'asc' },
    });

    const isMinimumYear = minimumYear?.id === profile.yearGroupId;

    let testComplete = false;
    
    // For Year 5 students or minimum year, only Part A is required
    if (isMinimumYear || currentYearNum === 5) {
      // For minimum year/Year 5, only Part A is required
      testComplete = personalityTest?.status === 'COMPLETED';
    } else {
      // For other years, both Part A and Part B are required
      const diagnosticTest = await this.prisma.diagnosticOnboardingTest.findFirst({
        where: { userId: user.id, yearGroupId: profile.yearGroupId },
      });
      testComplete = personalityTest?.status === 'COMPLETED' && diagnosticTest?.status === 'COMPLETED';
    }

    if (!testComplete) {
      const message = (isMinimumYear || currentYearNum === 5)
        ? 'Please complete the mandatory test (Part A: Learning Style Assessment) before accessing content'
        : 'Please complete the mandatory test (Part A: Personality + Part B: Diagnostic) before accessing content';
      throw new ForbiddenException(message);
    }

    return true;
  }
}
