/*
  Warnings:

  - You are about to drop the `generated_reports` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `intervention_reports` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "NoteCategory" AS ENUM ('BEHAVIORAL', 'ACADEMIC', 'GENERAL');

-- CreateEnum
CREATE TYPE "MiniAssessmentStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'PASSED', 'FAILED');

-- DropForeignKey
ALTER TABLE "generated_reports" DROP CONSTRAINT "generated_reports_reportConfigId_fkey";

-- AlterTable
ALTER TABLE "teacher_notes" ADD COLUMN     "attachments" JSONB,
ADD COLUMN     "flaggedForFollowUp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "followUpCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "followUpDate" TIMESTAMP(3),
ADD COLUMN     "noteCategory" "NoteCategory" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "tags" TEXT[];

-- DropTable
DROP TABLE "generated_reports";

-- DropTable
DROP TABLE "intervention_reports";

-- DropEnum
DROP TYPE "ReportFormat";

-- DropEnum
DROP TYPE "ReportFrequency";

-- CreateTable
CREATE TABLE "mini_assessments" (
    "id" TEXT NOT NULL,
    "interventionAssignmentId" TEXT,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT,
    "skillGapId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetSkillId" TEXT NOT NULL,
    "targetSubjectId" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "passingScore" DOUBLE PRECISION NOT NULL DEFAULT 70.0,
    "status" "MiniAssessmentStatus" NOT NULL DEFAULT 'PENDING',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "studentAnswers" JSONB,
    "score" DOUBLE PRECISION,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "feedback" TEXT,
    "timeSpent" INTEGER NOT NULL DEFAULT 0,
    "attemptsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mini_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mini_assessments_studentId_status_idx" ON "mini_assessments"("studentId", "status");

-- CreateIndex
CREATE INDEX "mini_assessments_interventionAssignmentId_idx" ON "mini_assessments"("interventionAssignmentId");

-- CreateIndex
CREATE INDEX "mini_assessments_skillGapId_idx" ON "mini_assessments"("skillGapId");

-- CreateIndex
CREATE INDEX "teacher_notes_teacherId_flaggedForFollowUp_idx" ON "teacher_notes"("teacherId", "flaggedForFollowUp");

-- CreateIndex
CREATE INDEX "teacher_notes_noteCategory_idx" ON "teacher_notes"("noteCategory");
