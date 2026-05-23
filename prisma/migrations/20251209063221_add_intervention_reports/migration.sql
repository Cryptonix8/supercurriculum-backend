-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('PDF', 'CSV', 'EXCEL');

-- CreateEnum
CREATE TYPE "ReportFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');

-- CreateTable
CREATE TABLE "intervention_reports" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "dateRangeStart" TIMESTAMP(3),
    "dateRangeEnd" TIMESTAMP(3),
    "relativePeriod" TEXT,
    "classIds" JSONB,
    "subjectIds" JSONB,
    "yearGroupIds" JSONB,
    "studentIds" JSONB,
    "activityTypes" JSONB,
    "metrics" JSONB NOT NULL,
    "includeCharts" BOOLEAN NOT NULL DEFAULT true,
    "includeGaps" BOOLEAN NOT NULL DEFAULT true,
    "includeProgress" BOOLEAN NOT NULL DEFAULT true,
    "includeAlerts" BOOLEAN NOT NULL DEFAULT true,
    "teacherComments" TEXT,
    "isScheduled" BOOLEAN NOT NULL DEFAULT false,
    "frequency" "ReportFrequency",
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "emailRecipients" JSONB,
    "emailSubject" TEXT,
    "emailBody" TEXT,
    "defaultFormat" "ReportFormat" NOT NULL DEFAULT 'PDF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intervention_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_reports" (
    "id" TEXT NOT NULL,
    "reportConfigId" TEXT NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileUrl" TEXT,
    "filePath" TEXT,
    "wasSent" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "sentTo" JSONB,
    "totalStudents" INTEGER,
    "totalGaps" INTEGER,
    "totalInterventions" INTEGER,
    "completionRate" DOUBLE PRECISION,

    CONSTRAINT "generated_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intervention_reports_createdById_idx" ON "intervention_reports"("createdById");

-- CreateIndex
CREATE INDEX "intervention_reports_isScheduled_nextRunAt_idx" ON "intervention_reports"("isScheduled", "nextRunAt");

-- CreateIndex
CREATE INDEX "generated_reports_reportConfigId_idx" ON "generated_reports"("reportConfigId");

-- CreateIndex
CREATE INDEX "generated_reports_generatedAt_idx" ON "generated_reports"("generatedAt");

-- AddForeignKey
ALTER TABLE "generated_reports" ADD CONSTRAINT "generated_reports_reportConfigId_fkey" FOREIGN KEY ("reportConfigId") REFERENCES "intervention_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
