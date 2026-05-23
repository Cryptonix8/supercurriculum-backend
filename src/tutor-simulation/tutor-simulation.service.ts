import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AiService, AI_TUTOR_PROMPT_VERSION } from '../ai/ai.service';
import { TutorConversationStateService } from '../ai/tutor-conversation-state.service';
import { SCENARIO_SET_CORE_V1 } from './scenarios/core-v1.scenarios';
import { scoreSimulationScenario } from './tutor-simulation.scoring';
import type {
  TranscriptEntry,
  TutorSimulationScenario,
  TutorSimulationScenarioSet,
} from './tutor-simulation.types';
import type { TutorStateSnapshot } from '../ai/tutor-conversation-state.service';

const SIM_USER_EMAIL = 'tutor.simulation@internal.qa';

@Injectable()
export class TutorSimulationService {
  private readonly logger = new Logger(TutorSimulationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly tutorState: TutorConversationStateService,
    private readonly config: ConfigService,
  ) {}

  getScenarioSet(): TutorSimulationScenarioSet {
    return SCENARIO_SET_CORE_V1;
  }

  getTutorConfigVersion(): string {
    return AI_TUTOR_PROMPT_VERSION;
  }

  /**
   * Dedicated student user for QA simulations — never shown in production UI when filtered by flags.
   */
  async ensureSimulationUserId(): Promise<string> {
    const email =
      this.config.get<string>('TUTOR_SIMULATION_USER_EMAIL')?.trim() || SIM_USER_EMAIL;
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      return existing.id;
    }
    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    const created = await this.prisma.user.create({
      data: {
        email,
        password: passwordHash,
        firstName: 'Tutor',
        lastName: 'Simulation',
        role: 'STUDENT',
        isActive: true,
      },
    });
    this.logger.warn(`Created tutor simulation user ${email} (id=${created.id})`);
    return created.id;
  }

  private async cleanupSession(userId: string, sessionId: string): Promise<void> {
    await this.prisma.chatMessage.deleteMany({ where: { userId, sessionId } });
    await this.prisma.tutorConversationState.deleteMany({ where: { userId, sessionId } });
  }

  private async loadFinalState(userId: string, sessionId: string): Promise<TutorStateSnapshot | null> {
    const row = await this.prisma.tutorConversationState.findUnique({
      where: { userId_sessionId: { userId, sessionId } },
    });
    if (!row) return null;
    return this.tutorState.toSnapshotFromRow(row as any);
  }

  async runScenario(params: { userId: string; runId: string; scenario: TutorSimulationScenario }) {
    const { userId, runId, scenario } = params;
    const sessionId = `sim-${runId}-${scenario.id}`.slice(0, 200);
    const transcript: TranscriptEntry[] = [];

    try {
      for (const line of scenario.studentTurns) {
        const res = await this.aiService.chat({
          userId,
          sessionId,
          message: line,
          context: scenario.context,
        });

        transcript.push({ role: 'user', text: line });
        transcript.push({
          role: 'assistant',
          text: res.message,
          structuredContent: res.structuredContent as Record<string, unknown>,
          flowStepAfter: res.tutoringState?.flowStep,
        });
      }

      const finalState = await this.loadFinalState(userId, sessionId);
      const outcome = scoreSimulationScenario({ scenario, transcript, finalState });

      return {
        scenarioId: scenario.id,
        title: scenario.title,
        passed: outcome.passed,
        scores: outcome.scores,
        transcript,
        finalState: outcome.finalState,
        failures: outcome.failures,
        recommendations: outcome.recommendations,
      };
    } finally {
      await this.cleanupSession(userId, sessionId);
    }
  }

  async runFullSimulation(params: {
    triggeredByUserId?: string;
    triggerSource: 'admin' | 'cli';
    scenarioSetVersion?: string;
  }) {
    const scenarioSet = this.getScenarioSet();
    if (params.scenarioSetVersion && params.scenarioSetVersion !== scenarioSet.version) {
      throw new Error(`Unknown scenario set: ${params.scenarioSetVersion}`);
    }

    const minPassRate = parseFloat(
      this.config.get<string>('TUTOR_SIM_MIN_PASS_RATE') || '0.55',
    );
    const regressionDelta = parseFloat(
      this.config.get<string>('TUTOR_SIM_REGRESSION_DELTA') || '0.1',
    );

    const userId = await this.ensureSimulationUserId();
    const runId = randomBytes(16).toString('hex');
    const started = Date.now();
    const tutorConfigVersion = this.getTutorConfigVersion();

    const scenarioResults: Array<{
      scenarioId: string;
      title: string | null;
      passed: boolean;
      scores: unknown;
      transcript: unknown;
      finalState: unknown;
      failures: unknown;
      recommendations: unknown;
    }> = [];

    let passedCount = 0;

    for (const scenario of scenarioSet.scenarios) {
      const r = await this.runScenario({ userId, runId, scenario });
      if (r.passed) passedCount++;
      scenarioResults.push({
        scenarioId: r.scenarioId,
        title: r.title,
        passed: r.passed,
        scores: r.scores,
        transcript: r.transcript,
        finalState: r.finalState,
        failures: r.failures,
        recommendations: r.recommendations,
      });
    }

    const total = scenarioSet.scenarios.length;
    const passRate = total === 0 ? 0 : passedCount / total;
    const durationMs = Date.now() - started;

    const previous = await this.prisma.tutorSimulationRun.findFirst({
      where: {
        scenarioSetVersion: scenarioSet.version,
        tutorConfigVersion,
        status: 'completed',
      },
      orderBy: { createdAt: 'desc' },
    });

    let regression: Record<string, unknown> = {
      baselineMet: passRate >= minPassRate,
      minPassRate,
      previousPassRate: null as number | null,
      delta: null as number | null,
      regressionDetected: false,
      message: passRate >= minPassRate ? 'Pass rate meets minimum threshold.' : 'Pass rate below minimum threshold.',
    };

    if (previous) {
      const prevRate = previous.passRate;
      regression.previousPassRate = prevRate;
      regression.delta = passRate - prevRate;
      if (passRate < prevRate - regressionDelta) {
        regression.regressionDetected = true;
        regression.message = `Regression: pass rate dropped by more than ${regressionDelta} vs previous run.`;
      }
    }

    const aggregateScores = this.averageScores(scenarioResults.map((s) => s.scores as any));

    const run = await this.prisma.tutorSimulationRun.create({
      data: {
        scenarioSetVersion: scenarioSet.version,
        tutorConfigVersion,
        environment: this.config.get<string>('TUTOR_SIM_ENV') || 'qa',
        triggeredByUserId: params.triggeredByUserId,
        triggerSource: params.triggerSource,
        totalScenarios: total,
        passedCount,
        failedCount: total - passedCount,
        passRate,
        aggregateScores: aggregateScores as any,
        regression: regression as any,
        durationMs,
        status: 'completed',
        results: {
          create: scenarioResults.map((row) => ({
            scenarioId: row.scenarioId,
            title: row.title,
            passed: row.passed,
            scores: row.scores as any,
            transcript: row.transcript as any,
            finalState: row.finalState as any,
            failures: row.failures as any,
            recommendations: row.recommendations as any,
          })),
        },
      },
      include: { results: true },
    });

    return {
      run,
      summary: {
        scenarioSetVersion: scenarioSet.version,
        tutorConfigVersion,
        totalScenarios: total,
        passedCount,
        failedCount: total - passedCount,
        passRate,
        durationMs,
        regression,
        aggregateScores,
      },
    };
  }

  private averageScores(scores: Array<{ aggregate?: number }>): { aggregate: number } {
    if (!scores.length) return { aggregate: 0 };
    const sum = scores.reduce((a, s) => a + (typeof s.aggregate === 'number' ? s.aggregate : 0), 0);
    return { aggregate: sum / scores.length };
  }

  async listRuns(limit = 30) {
    return this.prisma.tutorSimulationRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        results: {
          select: {
            id: true,
            scenarioId: true,
            title: true,
            passed: true,
            scores: true,
            failures: true,
          },
        },
      },
    });
  }

  async getRun(id: string) {
    return this.prisma.tutorSimulationRun.findUnique({
      where: { id },
      include: { results: true },
    });
  }
}
