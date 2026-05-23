-- CreateEnum
CREATE TYPE "InterventionPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "InterventionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "SkillGapSeverity" AS ENUM ('MINOR', 'MODERATE', 'SEVERE', 'CRITICAL');

-- CreateTable
CREATE TABLE "skill_gaps" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "yearGroupId" TEXT NOT NULL,
    "severity" "SkillGapSeverity" NOT NULL,
    "percentageScore" DOUBLE PRECISION NOT NULL,
    "assessmentId" TEXT,
    "lastDetected" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_gaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_gap_alerts" (
    "id" TEXT NOT NULL,
    "skillGapId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isSnoozed" BOOLEAN NOT NULL DEFAULT false,
    "snoozedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "skill_gap_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intervention_assignments" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "skillGapId" TEXT,
    "interventionId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "targetYearGroupId" TEXT,
    "targetSubjectId" TEXT NOT NULL,
    "targetSkillId" TEXT NOT NULL,
    "priority" "InterventionPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "InterventionStatus" NOT NULL DEFAULT 'PENDING',
    "microLessons" JSONB,
    "activities" JSONB,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "preScore" DOUBLE PRECISION,
    "postScore" DOUBLE PRECISION,
    "improvementPercentage" DOUBLE PRECISION,
    "attemptsCount" INTEGER NOT NULL DEFAULT 0,
    "timeSpent" INTEGER NOT NULL DEFAULT 0,
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "escalatedAt" TIMESTAMP(3),
    "escalationNotes" TEXT,

    CONSTRAINT "intervention_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intervention_progress_logs" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "activityCompleted" TEXT,
    "score" DOUBLE PRECISION,
    "timeSpent" INTEGER NOT NULL,
    "notes" TEXT,
    "wasSuccessful" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intervention_progress_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "skill_gaps_studentId_isResolved_idx" ON "skill_gaps"("studentId", "isResolved");

-- CreateIndex
CREATE INDEX "skill_gaps_severity_isResolved_idx" ON "skill_gaps"("severity", "isResolved");

-- CreateIndex
CREATE INDEX "skill_gaps_lastDetected_idx" ON "skill_gaps"("lastDetected");

-- CreateIndex
CREATE UNIQUE INDEX "skill_gaps_studentId_subjectId_skillId_key" ON "skill_gaps"("studentId", "subjectId", "skillId");

-- CreateIndex
CREATE INDEX "skill_gap_alerts_teacherId_isRead_idx" ON "skill_gap_alerts"("teacherId", "isRead");

-- CreateIndex
CREATE INDEX "skill_gap_alerts_createdAt_idx" ON "skill_gap_alerts"("createdAt");

-- CreateIndex
CREATE INDEX "intervention_assignments_studentId_status_idx" ON "intervention_assignments"("studentId", "status");

-- CreateIndex
CREATE INDEX "intervention_assignments_teacherId_status_idx" ON "intervention_assignments"("teacherId", "status");

-- CreateIndex
CREATE INDEX "intervention_assignments_priority_status_idx" ON "intervention_assignments"("priority", "status");

-- CreateIndex
CREATE INDEX "intervention_assignments_assignedAt_idx" ON "intervention_assignments"("assignedAt");

-- CreateIndex
CREATE INDEX "intervention_progress_logs_assignmentId_idx" ON "intervention_progress_logs"("assignmentId");

-- CreateIndex
CREATE INDEX "intervention_progress_logs_createdAt_idx" ON "intervention_progress_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "skill_gap_alerts" ADD CONSTRAINT "skill_gap_alerts_skillGapId_fkey" FOREIGN KEY ("skillGapId") REFERENCES "skill_gaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention_assignments" ADD CONSTRAINT "intervention_assignments_skillGapId_fkey" FOREIGN KEY ("skillGapId") REFERENCES "skill_gaps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention_assignments" ADD CONSTRAINT "intervention_assignments_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "interventions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention_progress_logs" ADD CONSTRAINT "intervention_progress_logs_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "intervention_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
