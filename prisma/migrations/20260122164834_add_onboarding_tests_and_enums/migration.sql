-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ExtensionLevel" ADD VALUE 'FOUNDATION';
ALTER TYPE "ExtensionLevel" ADD VALUE 'INTERMEDIATE';
ALTER TYPE "ExtensionLevel" ADD VALUE 'ADVANCED';

-- AlterEnum
ALTER TYPE "GeneratedBy" ADD VALUE 'AI_GENERATED';

-- AlterEnum
ALTER TYPE "MasteryLevel" ADD VALUE 'NEEDS_SUPPORT';

-- CreateTable
CREATE TABLE "personality_tests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "testType" TEXT NOT NULL DEFAULT 'LEARNING_STYLE',
    "questions" JSONB NOT NULL,
    "answers" JSONB,
    "results" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personality_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostic_onboarding_tests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "yearGroupId" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "answers" JSONB,
    "results" JSONB,
    "score" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diagnostic_onboarding_tests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "personality_tests_userId_idx" ON "personality_tests"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "personality_tests_userId_testType_key" ON "personality_tests"("userId", "testType");

-- CreateIndex
CREATE INDEX "diagnostic_onboarding_tests_userId_idx" ON "diagnostic_onboarding_tests"("userId");

-- CreateIndex
CREATE INDEX "diagnostic_onboarding_tests_yearGroupId_idx" ON "diagnostic_onboarding_tests"("yearGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_onboarding_tests_userId_yearGroupId_key" ON "diagnostic_onboarding_tests"("userId", "yearGroupId");
