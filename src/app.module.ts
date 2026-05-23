import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { YearsModule } from './years/years.module';
import { SubjectsModule } from './subjects/subjects.module';
import { SkillsModule } from './skills/skills.module';
import { ActivitiesModule } from './activities/activities.module';
import { FeedbackTestsModule } from './feedback-tests/feedback-tests.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { InterventionsModule } from './interventions/interventions.module';
import { WeeklyPlansModule } from './weekly-plans/weekly-plans.module';
import { TasksModule } from './tasks/tasks.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { AiModule } from './ai/ai.module';
import { ProgressModule } from './progress/progress.module';
import { BadgesModule } from './badges/badges.module';
import { UploadsModule } from './uploads/uploads.module';
import { TeachersModule } from './teachers/teachers.module';
import { ParentsModule } from './parents/parents.module';
import { SkillMasteryModule } from './skill-mastery/skill-mastery.module';
import { AiTutorModule } from './ai-tutor/ai-tutor.module';
import { TeacherControlsModule } from './teacher-controls/teacher-controls.module';
import { ParentViewModule } from './parent-view/parent-view.module';
import { ActivityGenerationModule } from './activity-generation/activity-generation.module';
// import { SystemInfoModule } from './system-info/system-info.module';
import { AiAgentToolsModule } from './ai-agent-tools/ai-agent-tools.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { DiagnosticTestsModule } from './diagnostic-tests/diagnostic-tests.module';
import { CustomAssignmentsModule } from './custom-assignments/custom-assignments.module';
import { ReportsModule } from './reports/reports.module';
import { EmailModule } from './email/email.module';
import { SupercurriculumModule } from './supercurriculum/supercurriculum.module';
import { CurriculumPdfParserModule } from './curriculum-parser/curriculum-pdf-parser.module';
import { AutoInitModule } from './auto-init/auto-init.module';
import { OnboardingTestsModule } from './onboarding-tests/onboarding-tests.module';
import { GamificationModule } from './gamification/gamification.module';
import { ChallengesModule } from './challenges/challenges.module';
import { EducatorPilotModule } from './educator-pilot/educator-pilot.module';
import { TutorSimulationModule } from './tutor-simulation/tutor-simulation.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate limiting
    ThrottlerModule.forRoot([{
      ttl: parseInt(process.env.THROTTLE_TTL) || 60000,
      limit: parseInt(process.env.THROTTLE_LIMIT) || 10,
    }]),

    // Database
    PrismaModule,

    // Feature modules
    AuthModule,
    UsersModule,
    YearsModule,
    SubjectsModule,
    SkillsModule,
    ActivitiesModule,
    FeedbackTestsModule,
    AssessmentsModule,
    InterventionsModule,
    WeeklyPlansModule,
    TasksModule,
    SubmissionsModule,
    AiModule,
    ProgressModule,
    BadgesModule,
    UploadsModule,
    TeachersModule,
    ParentsModule,
    SupercurriculumModule,
    
    // AI Tutor modules
    SkillMasteryModule,
    AiTutorModule,
    TeacherControlsModule,
    ParentViewModule,
    ActivityGenerationModule,
    AiAgentToolsModule,
    
    // System modules
    // SystemInfoModule, // Commented out - uses shell commands that may be killed on VPS
    AnalyticsModule,
    DiagnosticTestsModule,
    CustomAssignmentsModule,
    ReportsModule,
    EmailModule,
    GamificationModule,
    
    // Curriculum Parser
    CurriculumPdfParserModule,
    
    // Auto-initialization (runs on startup to seed data)
    AutoInitModule,
    
    // Onboarding tests (personality + diagnostic)
    OnboardingTestsModule,
    ChallengesModule,
    EducatorPilotModule,
    TutorSimulationModule,
  ],
})
export class AppModule {}

