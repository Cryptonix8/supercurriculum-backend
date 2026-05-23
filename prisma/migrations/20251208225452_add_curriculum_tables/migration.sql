-- CreateEnum
CREATE TYPE "KeyStage" AS ENUM ('KS2', 'KS3', 'KS4', 'KS5');

-- CreateEnum
CREATE TYPE "ExtensionLevel" AS ENUM ('BEYOND_CURRICULUM', 'ENRICHMENT');

-- CreateEnum
CREATE TYPE "GeneratedBy" AS ENUM ('AI_AGENT', 'TEACHER', 'HYBRID');

-- CreateTable
CREATE TABLE "curriculum_topics" (
    "id" TEXT NOT NULL,
    "yearGroupId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "topicName" TEXT NOT NULL,
    "keyStage" "KeyStage" NOT NULL,
    "learningObjectives" JSONB NOT NULL,
    "nationalCurriculumRef" TEXT,
    "coreContent" TEXT,
    "extendedContent" TEXT,
    "keySkills" TEXT[],
    "priorKnowledge" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supercurriculum_activities" (
    "id" TEXT NOT NULL,
    "curriculumTopicId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT NOT NULL,
    "successCriteria" TEXT,
    "extensionLevel" "ExtensionLevel" NOT NULL,
    "curriculumAlignment" INTEGER NOT NULL,
    "generatedBy" "GeneratedBy" NOT NULL,
    "teacherApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supercurriculum_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_standards" (
    "id" TEXT NOT NULL,
    "standardCode" TEXT NOT NULL,
    "keyStage" "KeyStage" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "standardText" TEXT NOT NULL,
    "assessmentCriteria" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_standards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "curriculum_topics_yearGroupId_subjectId_idx" ON "curriculum_topics"("yearGroupId", "subjectId");

-- CreateIndex
CREATE INDEX "curriculum_topics_keyStage_idx" ON "curriculum_topics"("keyStage");

-- CreateIndex
CREATE INDEX "supercurriculum_activities_curriculumTopicId_idx" ON "supercurriculum_activities"("curriculumTopicId");

-- CreateIndex
CREATE INDEX "supercurriculum_activities_extensionLevel_idx" ON "supercurriculum_activities"("extensionLevel");

-- CreateIndex
CREATE INDEX "supercurriculum_activities_generatedBy_idx" ON "supercurriculum_activities"("generatedBy");

-- CreateIndex
CREATE INDEX "supercurriculum_activities_teacherApproved_idx" ON "supercurriculum_activities"("teacherApproved");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_standards_standardCode_key" ON "curriculum_standards"("standardCode");

-- CreateIndex
CREATE INDEX "curriculum_standards_keyStage_subjectId_idx" ON "curriculum_standards"("keyStage", "subjectId");

-- CreateIndex
CREATE INDEX "curriculum_standards_standardCode_idx" ON "curriculum_standards"("standardCode");

-- AddForeignKey
ALTER TABLE "curriculum_topics" ADD CONSTRAINT "curriculum_topics_yearGroupId_fkey" FOREIGN KEY ("yearGroupId") REFERENCES "year_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_topics" ADD CONSTRAINT "curriculum_topics_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supercurriculum_activities" ADD CONSTRAINT "supercurriculum_activities_curriculumTopicId_fkey" FOREIGN KEY ("curriculumTopicId") REFERENCES "curriculum_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_standards" ADD CONSTRAINT "curriculum_standards_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
