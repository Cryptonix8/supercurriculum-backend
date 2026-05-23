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

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "class_invites_code_key" ON "class_invites"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "class_invites_classId_isActive_idx" ON "class_invites"("classId", "isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "educator_audit_logs_educatorId_createdAt_idx" ON "educator_audit_logs"("educatorId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "educator_audit_logs_studentId_createdAt_idx" ON "educator_audit_logs"("studentId", "createdAt");

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
