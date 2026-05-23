import {
  IsString,
  IsArray,
  IsOptional,
  IsEnum,
  IsDateString,
  IsBoolean,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ReportType {
  STUDENT = 'STUDENT',
  CLASS = 'CLASS',
  PARENT_FRIENDLY = 'PARENT_FRIENDLY',
  CUSTOM = 'CUSTOM',
}

export enum ExportFormat {
  PDF = 'PDF',
  CSV = 'CSV',
  EXCEL = 'EXCEL',
  JSON = 'JSON',
}

export enum ReportFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
}

export class GenerateReportDto {
  @ApiProperty({ enum: ReportType })
  @IsEnum(ReportType)
  reportType: ReportType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  classId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subjectIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  metrics?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teacherCommentary?: string;

  @ApiPropertyOptional({ enum: ExportFormat, default: ExportFormat.PDF })
  @IsOptional()
  @IsEnum(ExportFormat)
  format?: ExportFormat;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  includeCharts?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  includeRecommendations?: boolean;
}

export class ScheduleReportDto {
  @ApiProperty({ enum: ReportType })
  @IsEnum(ReportType)
  reportType: ReportType;

  @ApiProperty({ enum: ReportFrequency })
  @IsEnum(ReportFrequency)
  frequency: ReportFrequency;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  classId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipientEmails?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subjectIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  metrics?: string[];

  @ApiPropertyOptional({ enum: ExportFormat, default: ExportFormat.PDF })
  @IsOptional()
  @IsEnum(ExportFormat)
  format?: ExportFormat;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class EmailReportDto {
  @ApiProperty()
  @IsUUID()
  reportId: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  recipientEmails: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  message?: string;
}

export interface StudentReportData {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    yearGroup: string;
  };
  overallProgress: {
    averageScore: number;
    completionRate: number;
    totalActivitiesCompleted: number;
    totalActivitiesAssigned: number;
    weekStreak: number;
  };
  subjectBreakdown: Array<{
    subjectId: string;
    subjectName: string;
    averageScore: number;
    masteryLevel: string;
    activitiesCompleted: number;
    timeSpent: number;
    trend: 'up' | 'down' | 'stable';
  }>;
  diagnosticTests: Array<{
    testId: string;
    testName: string;
    date: string;
    score: number;
    skillPerformances: Array<{
      skillName: string;
      score: number;
      performance: string;
    }>;
  }>;
  areasNeedingAttention: Array<{
    subjectName: string;
    skillName: string;
    currentLevel: string;
    recommendation: string;
  }>;
  engagement: {
    totalTimeSpent: number;
    averageSessionDuration: number;
    lastActive: string;
    loginFrequency: number;
  };
  teacherComments: Array<{
    date: string;
    teacher: string;
    comment: string;
    category: string;
  }>;
  achievements: Array<{
    badgeName: string;
    earnedAt: string;
    description: string;
  }>;
}

export interface ClassReportData {
  class: {
    id: string;
    name: string;
    yearGroup: string;
    totalStudents: number;
  };
  performanceOverview: {
    averageScore: number;
    averageCompletionRate: number;
    totalActivitiesCompleted: number;
    averageEngagementScore: number;
  };
  subjectComparison: Array<{
    subjectName: string;
    averageScore: number;
    completionRate: number;
    studentsStruggling: number;
    studentsExcelling: number;
  }>;
  engagementStatistics: {
    averageTimeSpent: number;
    activeStudents: number;
    inactiveStudents: number;
    averageLoginFrequency: number;
  };
  topPerformers: Array<{
    studentName: string;
    averageScore: number;
    completionRate: number;
  }>;
  studentsAtRisk: Array<{
    studentName: string;
    averageScore: number;
    areasOfConcern: string[];
    lastActive: string;
  }>;
  activityCompletion: {
    completed: number;
    inProgress: number;
    notStarted: number;
    overdue: number;
  };
  comparativeAnalysis?: {
    schoolAverage: number;
    yearGroupAverage: number;
    classRanking: number;
  };
}

export interface ParentFriendlyReportData {
  student: {
    firstName: string;
    lastName: string;
    yearGroup: string;
  };
  overallStatus: 'On Track' | 'Needs Support' | 'Strong';
  summary: string;
  subjects: Array<{
    name: string;
    status: 'On Track' | 'Needs Support' | 'Strong';
    description: string;
    icon: string;
  }>;
  keyAchievements: string[];
  areasForGrowth: Array<{
    area: string;
    suggestion: string;
  }>;
  homeSupport: {
    recommendations: string[];
    resources: Array<{
      title: string;
      description: string;
      url?: string;
    }>;
  };
  nextSteps: string[];
  teacherMessage: string;
}

