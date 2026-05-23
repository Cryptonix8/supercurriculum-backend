-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "TutorFlowStep" AS ENUM ('INTAKE', 'CLARIFY', 'PLAN', 'TEACH', 'CHECK', 'WRAP_UP');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "tutor_conversation_states" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "grade" TEXT,
    "subject" TEXT,
    "chapter" TEXT,
    "learningMode" TEXT,
    "flowStep" "TutorFlowStep" NOT NULL DEFAULT 'INTAKE',
    "askedFields" JSONB,
    "answeredFields" JSONB,
    "clarificationCount" INTEGER NOT NULL DEFAULT 0,
    "repeatedQuestionCount" INTEGER NOT NULL DEFAULT 0,
    "repeatedMissingFieldCount" INTEGER NOT NULL DEFAULT 0,
    "stalledTurnCount" INTEGER NOT NULL DEFAULT 0,
    "lastAssistantQuestionHash" TEXT,
    "lastAssistantMessageHash" TEXT,
    "lastProgressAt" TIMESTAMP(3),
    "assumptions" JSONB,
    "lastTransition" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_conversation_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "tutor_conversation_states_userId_sessionId_key" ON "tutor_conversation_states"("userId", "sessionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tutor_conversation_states_userId_updatedAt_idx" ON "tutor_conversation_states"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tutor_conversation_states_flowStep_updatedAt_idx" ON "tutor_conversation_states"("flowStep", "updatedAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "tutor_conversation_states" ADD CONSTRAINT "tutor_conversation_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
