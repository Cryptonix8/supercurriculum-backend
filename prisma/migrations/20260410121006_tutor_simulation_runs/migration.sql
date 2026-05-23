-- CreateTable
CREATE TABLE "tutor_simulation_runs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scenarioSetVersion" TEXT NOT NULL,
    "tutorConfigVersion" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'qa',
    "triggeredByUserId" TEXT,
    "triggerSource" TEXT,
    "totalScenarios" INTEGER NOT NULL,
    "passedCount" INTEGER NOT NULL,
    "failedCount" INTEGER NOT NULL,
    "passRate" DOUBLE PRECISION NOT NULL,
    "aggregateScores" JSONB,
    "regression" JSONB,
    "durationMs" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "errorMessage" TEXT,

    CONSTRAINT "tutor_simulation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_simulation_scenario_results" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "title" TEXT,
    "passed" BOOLEAN NOT NULL,
    "scores" JSONB NOT NULL,
    "transcript" JSONB NOT NULL,
    "finalState" JSONB,
    "failures" JSONB NOT NULL,
    "recommendations" JSONB,

    CONSTRAINT "tutor_simulation_scenario_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tutor_simulation_runs_createdAt_idx" ON "tutor_simulation_runs"("createdAt");

-- CreateIndex
CREATE INDEX "tutor_simulation_runs_scenarioSetVersion_tutorConfigVersion_idx" ON "tutor_simulation_runs"("scenarioSetVersion", "tutorConfigVersion", "createdAt");

-- CreateIndex
CREATE INDEX "tutor_simulation_scenario_results_runId_idx" ON "tutor_simulation_scenario_results"("runId");

-- AddForeignKey
ALTER TABLE "tutor_simulation_scenario_results" ADD CONSTRAINT "tutor_simulation_scenario_results_runId_fkey" FOREIGN KEY ("runId") REFERENCES "tutor_simulation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
