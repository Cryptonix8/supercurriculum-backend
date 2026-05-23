import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { OnboardingTestsService } from '../src/onboarding-tests/onboarding-tests.service';

async function main() {
  console.log('Starting Part B onboarding warmup...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const onboardingTests = app.get(OnboardingTestsService);
    const result = await onboardingTests.warmupPartBDiagnostics('en-GB');
    console.log('Part B warmup completed:', result);
  } catch (error) {
    console.error('Part B warmup failed:', error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Fatal warmup error:', error);
  process.exit(1);
});

