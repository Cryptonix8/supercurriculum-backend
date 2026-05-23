-- CreateEnum
CREATE TYPE "MasteryLevel" AS ENUM ('BEGINNER', 'DEVELOPING', 'SECURE', 'MASTERY');

-- CreateEnum
CREATE TYPE "LearningMode" AS ENUM ('VIDEO', 'TEXT', 'QUIZZES', 'HANDS_ON', 'PROJECTS', 'MIXED');

-- CreateEnum
CREATE TYPE "ChallengeLevel" AS ENUM ('EASY', 'MEDIUM', 'CHALLENGING', 'MIXED');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('NOT_CONFIDENT', 'SOMEWHAT_CONFIDENT', 'CONFIDENT', 'VERY_CONFIDENT');

-- CreateEnum
CREATE TYPE "PerformanceLevel" AS ENUM ('STRONG', 'OK', 'NEEDS_SUPPORT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'QUICK_QUIZ';
ALTER TYPE "ActivityType" ADD VALUE 'SCAFFOLDED_EXERCISE';
ALTER TYPE "ActivityType" ADD VALUE 'SUPERCURRICULUM_PROJECT';
ALTER TYPE "ActivityType" ADD VALUE 'EXAM_STYLE';
ALTER TYPE "ActivityType" ADD VALUE 'RETRIEVAL_PRACTICE';
ALTER TYPE "ActivityType" ADD VALUE 'INTERLEAVED_PRACTICE';

-- AlterTable
ALTER TABLE "student_profiles" ADD COLUMN     "age" INTEGER,
ADD COLUMN     "attitudeToDifficulty" TEXT,
ADD COLUMN     "communicationTone" TEXT NOT NULL DEFAULT 'friendly',
ADD COLUMN     "doesNotGiveUp" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "englishProficiency" TEXT,
ADD COLUMN     "getsAnxious" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "homeLanguages" TEXT[],
ADD COLUMN     "nickname" TEXT,
ADD COLUMN     "preferredChallengeLevel" "ChallengeLevel" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "preferredLearningMode" "LearningMode" NOT NULL DEFAULT 'MIXED',
ADD COLUMN     "preferredTaskDuration" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "subjectConfidence" JSONB,
ADD COLUMN     "weeklyStudyTime" INTEGER NOT NULL DEFAULT 120;

-- CreateTable
CREATE TABLE "diagnostic_skill_performances" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "performance" "PerformanceLevel" NOT NULL,
    "errorTags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnostic_skill_performances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_mastery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "masteryLevel" "MasteryLevel" NOT NULL DEFAULT 'BEGINNER',
    "masteryPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalAttempts" INTEGER NOT NULL DEFAULT 0,
    "correctAttempts" INTEGER NOT NULL DEFAULT 0,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "lastPracticed" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_mastery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT,
    "duration" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sessionPlan" JSONB,
    "completedItems" JSONB,
    "adaptations" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_items" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "skillId" TEXT,
    "question" TEXT NOT NULL,
    "expectedAnswer" TEXT,
    "difficulty" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "studentAnswer" TEXT,
    "isCorrect" BOOLEAN,
    "hintsGiven" JSONB,
    "timeSpent" INTEGER,
    "attemptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intervention_logs" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "interventionType" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "wasSuccessful" BOOLEAN NOT NULL DEFAULT false,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "escalationNote" TEXT,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "intervention_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_overrides" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT,
    "skillId" TEXT,
    "overrideType" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "reason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_notes" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT,
    "skillId" TEXT,
    "noteType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isVisibleToStudent" BOOLEAN NOT NULL DEFAULT false,
    "isVisibleToParent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_summaries" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "totalStudyMinutes" INTEGER NOT NULL DEFAULT 0,
    "sessionsCompleted" INTEGER NOT NULL DEFAULT 0,
    "subjectSummaries" JSONB NOT NULL,
    "recommendations" TEXT[],
    "highlights" TEXT[],
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_skill_performances_assessmentId_skillId_key" ON "diagnostic_skill_performances"("assessmentId", "skillId");

-- CreateIndex
CREATE INDEX "skill_mastery_userId_idx" ON "skill_mastery"("userId");

-- CreateIndex
CREATE INDEX "skill_mastery_userId_masteryLevel_idx" ON "skill_mastery"("userId", "masteryLevel");

-- CreateIndex
CREATE UNIQUE INDEX "skill_mastery_userId_subjectId_skillId_key" ON "skill_mastery"("userId", "subjectId", "skillId");

-- CreateIndex
CREATE INDEX "learning_sessions_userId_status_idx" ON "learning_sessions"("userId", "status");

-- CreateIndex
CREATE INDEX "learning_sessions_userId_startedAt_idx" ON "learning_sessions"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "session_items_sessionId_orderIndex_idx" ON "session_items"("sessionId", "orderIndex");

-- CreateIndex
CREATE INDEX "intervention_logs_sessionId_idx" ON "intervention_logs"("sessionId");

-- CreateIndex
CREATE INDEX "teacher_overrides_studentId_isActive_idx" ON "teacher_overrides"("studentId", "isActive");

-- CreateIndex
CREATE INDEX "teacher_notes_studentId_idx" ON "teacher_notes"("studentId");

-- CreateIndex
CREATE INDEX "parent_summaries_studentId_idx" ON "parent_summaries"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "parent_summaries_studentId_weekStart_key" ON "parent_summaries"("studentId", "weekStart");

-- AddForeignKey
ALTER TABLE "diagnostic_skill_performances" ADD CONSTRAINT "diagnostic_skill_performances_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_mastery" ADD CONSTRAINT "skill_mastery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_mastery" ADD CONSTRAINT "skill_mastery_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_mastery" ADD CONSTRAINT "skill_mastery_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "learning_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention_logs" ADD CONSTRAINT "intervention_logs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "learning_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
