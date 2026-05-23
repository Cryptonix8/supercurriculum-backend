import { scoreSimulationScenario } from './tutor-simulation.scoring';
import type { TutorSimulationScenario, TranscriptEntry } from './tutor-simulation.types';
import type { TutorStateSnapshot } from '../ai/tutor-conversation-state.service';

describe('tutor-simulation.scoring', () => {
  const baseScenario: TutorSimulationScenario = {
    id: 'test',
    title: 'Test',
    behavior: 'standard',
    grade: 'G1',
    subject: 'Math',
    topic: 'Arithmetic',
    context: { grade: 'G1', currentSubject: 'Math', locale: 'en-GB' },
    studentTurns: ['1+1'],
    expectations: {
      minFlowStep: 'TEACH',
      answerContainsPatterns: ['2'],
    },
  };

  const okState: TutorStateSnapshot = {
    id: 's1',
    userId: 'u1',
    sessionId: 'sess',
    flowStep: 'TEACH',
    askedFields: {},
    answeredFields: {},
    clarificationCount: 0,
    repeatedQuestionCount: 0,
    repeatedMissingFieldCount: 0,
    stalledTurnCount: 0,
    assumptions: [],
  };

  it('passes when patterns and flow match', () => {
    const transcript: TranscriptEntry[] = [
      { role: 'user', text: '1+1' },
      {
        role: 'assistant',
        text: 'Απάντηση: 2',
        structuredContent: { steps: ['1+1=2'], finalAnswer: '2' },
      },
    ];
    const out = scoreSimulationScenario({
      scenario: baseScenario,
      transcript,
      finalState: okState,
    });
    expect(out.passed).toBe(true);
    expect(out.failures).toHaveLength(0);
  });

  it('fails when answer patterns missing', () => {
    const transcript: TranscriptEntry[] = [
      { role: 'user', text: '1+1' },
      { role: 'assistant', text: 'Σκέψου το μόνος σου.', structuredContent: { steps: ['hint'] } },
    ];
    const out = scoreSimulationScenario({
      scenario: baseScenario,
      transcript,
      finalState: okState,
    });
    expect(out.passed).toBe(false);
    expect(out.failures.some((f) => f.rubric === 'correctness')).toBe(true);
  });
});
