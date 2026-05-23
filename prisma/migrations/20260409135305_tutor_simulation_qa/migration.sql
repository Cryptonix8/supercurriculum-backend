-- CreateTable
CREATE TABLE "tutor_simulation_runs" (
    "id" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "scenarioSetVersion" TEXT NOT NULL,
    "tutorConfigVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "totals" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_simulation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_simulation_scenario_results" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "scores" JSONB NOT NULL,
    "failures" JSONB,
    "transcript" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_simulation_scenario_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tutor_simulation_runs_createdByUserId_createdAt_idx" ON "tutor_simulation_runs"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "tutor_simulation_scenario_results_runId_passed_idx" ON "tutor_simulation_scenario_results"("runId", "passed");

-- AddForeignKey
ALTER TABLE "tutor_simulation_runs" ADD CONSTRAINT "tutor_simulation_runs_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_simulation_scenario_results" ADD CONSTRAINT "tutor_simulation_scenario_results_runId_fkey" FOREIGN KEY ("runId") REFERENCES "tutor_simulation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
