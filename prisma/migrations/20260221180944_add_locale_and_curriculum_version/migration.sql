/*
  Warnings:

  - A unique constraint covering the columns `[yearGroupId,name,locale]` on the table `subjects` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[name,locale]` on the table `year_groups` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "subjects_yearGroupId_name_key";

-- DropIndex
DROP INDEX "year_groups_name_key";

-- AlterTable
ALTER TABLE "curriculum_topics" ADD COLUMN     "curriculumVersion" TEXT,
ADD COLUMN     "locale" TEXT DEFAULT 'en-GB';

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "curriculumVersion" TEXT,
ADD COLUMN     "locale" TEXT DEFAULT 'en-GB';

-- AlterTable
ALTER TABLE "year_groups" ADD COLUMN     "curriculumVersion" TEXT,
ADD COLUMN     "locale" TEXT DEFAULT 'en-GB';

-- CreateIndex
CREATE INDEX "curriculum_topics_locale_idx" ON "curriculum_topics"("locale");

-- CreateIndex
CREATE INDEX "subjects_locale_idx" ON "subjects"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_yearGroupId_name_locale_key" ON "subjects"("yearGroupId", "name", "locale");

-- CreateIndex
CREATE INDEX "year_groups_locale_idx" ON "year_groups"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "year_groups_name_locale_key" ON "year_groups"("name", "locale");
