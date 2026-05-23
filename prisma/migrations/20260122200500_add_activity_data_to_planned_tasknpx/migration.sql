-- DropForeignKey
ALTER TABLE "planned_tasks" DROP CONSTRAINT "planned_tasks_activityId_fkey";

-- AlterTable
ALTER TABLE "planned_tasks" ADD COLUMN     "activityData" JSONB,
ALTER COLUMN "activityId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "planned_tasks" ADD CONSTRAINT "planned_tasks_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
