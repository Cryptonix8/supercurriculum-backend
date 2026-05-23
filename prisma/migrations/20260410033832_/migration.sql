-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "XpReason" AS ENUM ('EXERCISE_COMPLETED', 'TASK_COMPLETED', 'CHALLENGE_COMPLETED', 'CORRECT_FINAL_ANSWER', 'HINT_BASED_COMPLETION', 'TUTOR_CHECK_CORRECT', 'MISTAKE_CORRECTED_AFTER_FEEDBACK', 'DAILY_STREAK_BONUS', 'FINAL_ANSWER_ONLY_PENALTY', 'SPAM_WITHOUT_COMPLETION_PENALTY');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

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

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "TutorFlowStep" AS ENUM ('INTAKE', 'CLARIFY', 'PLAN', 'TEACH', 'CHECK', 'WRAP_UP');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "student_profiles"
  ADD COLUMN IF NOT EXISTS "shareChatTranscripts" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "shareProgressMetrics" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE IF NOT EXISTS "class_invites" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "educator_audit_logs" (
    "id" TEXT NOT NULL,
    "educatorId" TEXT NOT NULL,
    "studentId" TEXT,
    "classId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "educator_audit_logs_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE IF NOT EXISTS "tutor_video_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "allowlistChannels" JSONB,
    "blocklistChannels" JSONB,
    "blocklistKeywords" JSONB,
    "preferredKeywords" JSONB,
    "minDurationSec" INTEGER NOT NULL DEFAULT 180,
    "maxDurationSec" INTEGER NOT NULL DEFAULT 900,
    "maxResults" INTEGER NOT NULL DEFAULT 5,
    "autoSuggestEnabled" BOOLEAN NOT NULL DEFAULT true,
    "requireGreek" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_video_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "tutor_video_feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "videoId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "clicked" BOOLEAN NOT NULL DEFAULT false,
    "helpful" BOOLEAN,
    "reported" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_video_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "copy_issue_reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "screenId" TEXT NOT NULL,
    "textKey" TEXT,
    "rawText" TEXT NOT NULL,
    "locale" TEXT,
    "context" JSONB,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "copy_issue_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_gamification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "studyStreak" INTEGER NOT NULL DEFAULT 0,
    "lastStudyDate" DATE,
    "freezeUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_gamification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "xp_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "XpReason" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xp_events_pkey" PRIMARY KEY ("id")
);

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
CREATE UNIQUE INDEX IF NOT EXISTS "class_invites_code_key" ON "class_invites"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "class_invites_classId_isActive_idx" ON "class_invites"("classId", "isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "educator_audit_logs_educatorId_createdAt_idx" ON "educator_audit_logs"("educatorId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "educator_audit_logs_studentId_createdAt_idx" ON "educator_audit_logs"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tutor_conversation_states_userId_updatedAt_idx" ON "tutor_conversation_states"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tutor_conversation_states_flowStep_updatedAt_idx" ON "tutor_conversation_states"("flowStep", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "tutor_conversation_states_userId_sessionId_key" ON "tutor_conversation_states"("userId", "sessionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tutor_video_feedback_userId_createdAt_idx" ON "tutor_video_feedback"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tutor_video_feedback_videoId_createdAt_idx" ON "tutor_video_feedback"("videoId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "copy_issue_reports_screenId_createdAt_idx" ON "copy_issue_reports"("screenId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "copy_issue_reports_status_createdAt_idx" ON "copy_issue_reports"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "user_gamification_userId_key" ON "user_gamification"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "xp_events_userId_createdAt_idx" ON "xp_events"("userId", "createdAt");

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
  ALTER TABLE "class_invites" ADD CONSTRAINT "class_invites_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "educator_audit_logs" ADD CONSTRAINT "educator_audit_logs_educatorId_fkey" FOREIGN KEY ("educatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "educator_audit_logs" ADD CONSTRAINT "educator_audit_logs_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "educator_audit_logs" ADD CONSTRAINT "educator_audit_logs_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "tutor_conversation_states" ADD CONSTRAINT "tutor_conversation_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "tutor_video_feedback" ADD CONSTRAINT "tutor_video_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "user_gamification" ADD CONSTRAINT "user_gamification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_gamification"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

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
