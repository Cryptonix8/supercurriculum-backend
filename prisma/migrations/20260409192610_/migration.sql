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

-- CreateIndex
CREATE INDEX IF NOT EXISTS "copy_issue_reports_screenId_createdAt_idx" ON "copy_issue_reports"("screenId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "copy_issue_reports_status_createdAt_idx" ON "copy_issue_reports"("status", "createdAt");
