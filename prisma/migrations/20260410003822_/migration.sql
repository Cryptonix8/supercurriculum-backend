-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ChallengeScope" AS ENUM ('PERSONAL', 'CLASSROOM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ChallengeAssignmentStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterEnum
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'XpReason' AND e.enumlabel = 'CHALLENGE_COMPLETED'
  ) THEN
    ALTER TYPE "XpReason" ADD VALUE 'CHALLENGE_COMPLETED';
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "learning_challenges" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdById" TEXT,
    "subjectId" TEXT,
    "skillId" TEXT,
    "scope" "ChallengeScope" NOT NULL DEFAULT 'PERSONAL',
    "targetCount" INTEGER NOT NULL DEFAULT 1,
    "xpReward" INTEGER NOT NULL DEFAULT 30,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "challenge_assignments" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "assignedById" TEXT,
    "status" "ChallengeAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenge_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "learning_challenges_createdById_isActive_idx" ON "learning_challenges"("createdById", "isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "learning_challenges_scope_isActive_idx" ON "learning_challenges"("scope", "isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "challenge_assignments_studentId_status_idx" ON "challenge_assignments"("studentId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "challenge_assignments_assignedById_status_idx" ON "challenge_assignments"("assignedById", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "challenge_assignments_challengeId_studentId_key" ON "challenge_assignments"("challengeId", "studentId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "learning_challenges" ADD CONSTRAINT "learning_challenges_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "learning_challenges" ADD CONSTRAINT "learning_challenges_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "learning_challenges" ADD CONSTRAINT "learning_challenges_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "challenge_assignments" ADD CONSTRAINT "challenge_assignments_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "learning_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "challenge_assignments" ADD CONSTRAINT "challenge_assignments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "challenge_assignments" ADD CONSTRAINT "challenge_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
