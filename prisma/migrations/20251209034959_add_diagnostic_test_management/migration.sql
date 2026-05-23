-- CreateEnum
CREATE TYPE "DiagnosticTestType" AS ENUM ('PRE_TEST', 'MID_YEAR', 'POST_TEST', 'END_OF_YEAR', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DiagnosticTestStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "diagnostic_test_schedules" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "testType" "DiagnosticTestType" NOT NULL DEFAULT 'CUSTOM',
    "status" "DiagnosticTestStatus" NOT NULL DEFAULT 'SCHEDULED',
    "yearGroupId" TEXT NOT NULL,
    "classIds" TEXT[],
    "studentIds" TEXT[],
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diagnostic_test_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostic_test_assignments" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "assigned" BOOLEAN NOT NULL DEFAULT true,
    "completedAt" TIMESTAMP(3),
    "assessmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnostic_test_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "diagnostic_test_schedules_yearGroupId_status_idx" ON "diagnostic_test_schedules"("yearGroupId", "status");

-- CreateIndex
CREATE INDEX "diagnostic_test_schedules_startDate_endDate_idx" ON "diagnostic_test_schedules"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_test_assignments_assessmentId_key" ON "diagnostic_test_assignments"("assessmentId");

-- CreateIndex
CREATE INDEX "diagnostic_test_assignments_studentId_assigned_idx" ON "diagnostic_test_assignments"("studentId", "assigned");

-- CreateIndex
CREATE INDEX "diagnostic_test_assignments_scheduleId_completedAt_idx" ON "diagnostic_test_assignments"("scheduleId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_test_assignments_scheduleId_studentId_testId_key" ON "diagnostic_test_assignments"("scheduleId", "studentId", "testId");

-- AddForeignKey
ALTER TABLE "diagnostic_test_schedules" ADD CONSTRAINT "diagnostic_test_schedules_yearGroupId_fkey" FOREIGN KEY ("yearGroupId") REFERENCES "year_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_test_schedules" ADD CONSTRAINT "diagnostic_test_schedules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_test_assignments" ADD CONSTRAINT "diagnostic_test_assignments_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "diagnostic_test_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_test_assignments" ADD CONSTRAINT "diagnostic_test_assignments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_test_assignments" ADD CONSTRAINT "diagnostic_test_assignments_testId_fkey" FOREIGN KEY ("testId") REFERENCES "feedback_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_test_assignments" ADD CONSTRAINT "diagnostic_test_assignments_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
