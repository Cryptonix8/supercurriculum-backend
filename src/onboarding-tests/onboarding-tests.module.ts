import { Module } from '@nestjs/common';
import { OnboardingTestsService } from './onboarding-tests.service';
import { OnboardingTestsController } from './onboarding-tests.controller';
import { DiagnosticTestsParserController } from './diagnostic-tests-parser.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { QuestionnaireParserService } from './questionnaire-parser.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [PrismaModule, ConfigModule, UsersModule],
  controllers: [OnboardingTestsController, DiagnosticTestsParserController],
  providers: [OnboardingTestsService, QuestionnaireParserService],
  exports: [OnboardingTestsService],
})
export class OnboardingTestsModule {}
