-- CreateEnum
CREATE TYPE "AssignmentDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD', 'MIXED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssignmentVisibility" AS ENUM ('PRIVATE', 'SHARED_WITH_SCHOOL', 'PUBLIC');

-- CreateTable
CREATE TABLE "custom_assignments" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "aiPrompt" TEXT NOT NULL,
    "subjectId" TEXT,
    "yearGroupId" TEXT,
    "topic" TEXT,
    "difficulty" "AssignmentDifficulty" NOT NULL DEFAULT 'MIXED',
    "duration" INTEGER,
    "questionCount" INTEGER,
    "content" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generationModel" TEXT,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "AssignmentVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdById" TEXT NOT NULL,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "custom_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_assignment_students" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "feedback" TEXT,
    "timeSpent" INTEGER,

    CONSTRAINT "custom_assignment_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_assignment_shares" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "sharedWithId" TEXT NOT NULL,
    "sharedById" TEXT NOT NULL,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_assignment_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_assignment_tags" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "custom_assignment_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_assignments_createdById_status_idx" ON "custom_assignments"("createdById", "status");

-- CreateIndex
CREATE INDEX "custom_assignments_subjectId_yearGroupId_idx" ON "custom_assignments"("subjectId", "yearGroupId");

-- CreateIndex
CREATE INDEX "custom_assignments_visibility_status_idx" ON "custom_assignments"("visibility", "status");

-- CreateIndex
CREATE INDEX "custom_assignment_students_studentId_completedAt_idx" ON "custom_assignment_students"("studentId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "custom_assignment_students_assignmentId_studentId_key" ON "custom_assignment_students"("assignmentId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "custom_assignment_shares_assignmentId_sharedWithId_key" ON "custom_assignment_shares"("assignmentId", "sharedWithId");

-- CreateIndex
CREATE INDEX "custom_assignment_tags_tag_idx" ON "custom_assignment_tags"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "custom_assignment_tags_assignmentId_tag_key" ON "custom_assignment_tags"("assignmentId", "tag");

-- AddForeignKey
ALTER TABLE "custom_assignments" ADD CONSTRAINT "custom_assignments_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_assignments" ADD CONSTRAINT "custom_assignments_yearGroupId_fkey" FOREIGN KEY ("yearGroupId") REFERENCES "year_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_assignments" ADD CONSTRAINT "custom_assignments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_assignment_students" ADD CONSTRAINT "custom_assignment_students_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "custom_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_assignment_students" ADD CONSTRAINT "custom_assignment_students_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_assignment_shares" ADD CONSTRAINT "custom_assignment_shares_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "custom_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_assignment_shares" ADD CONSTRAINT "custom_assignment_shares_sharedWithId_fkey" FOREIGN KEY ("sharedWithId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_assignment_shares" ADD CONSTRAINT "custom_assignment_shares_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_assignment_tags" ADD CONSTRAINT "custom_assignment_tags_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "custom_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
