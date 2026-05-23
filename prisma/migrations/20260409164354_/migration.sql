/*
  Warnings:

  - You are about to drop the column `shareChatTranscripts` on the `student_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `shareProgressMetrics` on the `student_profiles` table. All the data in the column will be lost.
  - You are about to drop the `chat_session_state` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `class_invites` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `educator_audit_logs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tutor_simulation_runs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tutor_simulation_scenario_results` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_gamification` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `xp_events` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "chat_session_state" DROP CONSTRAINT IF EXISTS "chat_session_state_userId_fkey";

-- DropForeignKey
ALTER TABLE "class_invites" DROP CONSTRAINT IF EXISTS "class_invites_classId_fkey";

-- DropForeignKey
ALTER TABLE "educator_audit_logs" DROP CONSTRAINT IF EXISTS "educator_audit_logs_classId_fkey";

-- DropForeignKey
ALTER TABLE "educator_audit_logs" DROP CONSTRAINT IF EXISTS "educator_audit_logs_educatorId_fkey";

-- DropForeignKey
ALTER TABLE "educator_audit_logs" DROP CONSTRAINT IF EXISTS "educator_audit_logs_studentId_fkey";

-- DropForeignKey
ALTER TABLE "tutor_simulation_runs" DROP CONSTRAINT IF EXISTS "tutor_simulation_runs_createdByUserId_fkey";

-- DropForeignKey
ALTER TABLE "tutor_simulation_scenario_results" DROP CONSTRAINT IF EXISTS "tutor_simulation_scenario_results_runId_fkey";

-- DropForeignKey
ALTER TABLE "user_gamification" DROP CONSTRAINT IF EXISTS "user_gamification_userId_fkey";

-- DropForeignKey
ALTER TABLE "xp_events" DROP CONSTRAINT IF EXISTS "xp_events_userId_fkey";

-- AlterTable
ALTER TABLE "student_profiles"
  DROP COLUMN IF EXISTS "shareChatTranscripts",
  DROP COLUMN IF EXISTS "shareProgressMetrics";

-- DropTable
DROP TABLE IF EXISTS "chat_session_state";

-- DropTable
DROP TABLE IF EXISTS "class_invites";

-- DropTable
DROP TABLE IF EXISTS "educator_audit_logs";

-- DropTable
DROP TABLE IF EXISTS "tutor_simulation_runs";

-- DropTable
DROP TABLE IF EXISTS "tutor_simulation_scenario_results";

-- DropTable
DROP TABLE IF EXISTS "user_gamification";

-- DropTable
DROP TABLE IF EXISTS "xp_events";

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

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tutor_video_feedback_userId_createdAt_idx" ON "tutor_video_feedback"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tutor_video_feedback_videoId_createdAt_idx" ON "tutor_video_feedback"("videoId", "createdAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "tutor_video_feedback" ADD CONSTRAINT "tutor_video_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
