/**
 * CLI: run tutor simulation (same code path as production tutor chat).
 * Usage (from backend/): npx ts-node -r tsconfig-paths/register scripts/run-tutor-simulation.ts
 *
 * Requires OPENAI_API_KEY and DATABASE_URL. Exits 1 if pass rate below TUTOR_SIM_MIN_PASS_RATE
 * or if regression is detected vs the previous stored run.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { TutorSimulationService } from '../src/tutor-simulation/tutor-simulation.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const sim = app.get(TutorSimulationService);
    const { summary } = await sim.runFullSimulation({ triggerSource: 'cli' });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(summary, null, 2));

    const min = parseFloat(process.env.TUTOR_SIM_MIN_PASS_RATE || '0.55');
    const reg = summary.regression as {
      baselineMet?: boolean;
      regressionDetected?: boolean;
    };

    if (!reg.baselineMet) {
      // eslint-disable-next-line no-console
      console.error('FAIL: pass rate below minimum threshold.');
      process.exitCode = 1;
    }
    if (reg.regressionDetected) {
      // eslint-disable-next-line no-console
      console.error('FAIL: regression detected vs previous run.');
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
