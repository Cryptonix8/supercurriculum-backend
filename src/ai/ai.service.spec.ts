import { AiService } from './ai.service';

describe('AiService flow guards', () => {
  const createService = () =>
    new AiService(
      { get: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );

  it('replaces repeated known-field ask with best-effort hints flow', () => {
    const service = createService();
    const guarded = (service as any).enforceForwardProgress({
      response: {
        message: 'What grade are you in?',
        structuredContent: {},
      },
      state: {
        grade: 'Grade 7',
        subject: 'Math',
        clarificationCount: 1,
        flowStep: 'CLARIFY',
      },
      missingFields: [],
      assumptionsUsed: [],
      learningMode: 'hints',
      locale: 'en',
    });

    expect(guarded.structuredContent.plan).toBeDefined();
    expect(guarded.structuredContent.hints?.length).toBeGreaterThan(0);
    expect(guarded.message.toLowerCase()).toContain('move forward');
  });

  it('replaces send-exercise loop with full-solution progression content', () => {
    const service = createService();
    const guarded = (service as any).enforceForwardProgress({
      response: {
        message: 'Please send the exercise first.',
        structuredContent: {},
      },
      state: {
        clarificationCount: 2,
        flowStep: 'TEACH',
      },
      missingFields: ['subject'],
      assumptionsUsed: ['Assumption: school-level medium difficulty.'],
      learningMode: 'full_solution',
      locale: 'en',
    });

    expect(guarded.structuredContent.steps?.length).toBeGreaterThan(0);
    expect(guarded.structuredContent.finalAnswer).toContain('share');
  });

  it('keeps response unchanged when progress content already exists', () => {
    const service = createService();
    const original = {
      message: 'Great, here is the plan.',
      structuredContent: {
        plan: 'Step by step.',
      },
    };
    const guarded = (service as any).enforceForwardProgress({
      response: original,
      state: {
        clarificationCount: 0,
        flowStep: 'PLAN',
      },
      missingFields: [],
      assumptionsUsed: [],
      learningMode: 'hints',
      locale: 'en',
    });

    expect(guarded).toEqual(original);
  });

  it('normalizes multiline steps and arrays into separate step items', () => {
    const service = createService();
    const normalized = (service as any).sanitizeStructuredTutorPayload({
      structuredContent: {
        steps: ['1. Add 2 and 3\n2. Subtract 1 from the result'],
      },
    });

    expect(normalized.structuredContent.steps).toEqual([
      '1. Add 2 and 3',
      '2. Subtract 1 from the result',
    ]);
  });

  it('rescues numbered problems from visualAid to steps when steps are generic', () => {
    const service = createService();
    const normalized = (service as any).sanitizeStructuredTutorPayload({
      structuredContent: {
        steps: ['Think about the method first.'],
        visualAid: '1. Calculate 5 + 7\n2. Find the perimeter of a 3 cm square',
      },
    });

    expect(normalized.structuredContent.steps).toEqual([
      'Think about the method first.',
      '1. Calculate 5 + 7',
      '2. Find the perimeter of a 3 cm square',
    ]);
    expect(normalized.structuredContent.visualAid).toBeUndefined();
  });

  it('rescues numbered problems from visualAid during structured content normalization', () => {
    const service = createService();
    const normalized = (service as any).normalizeStructuredContent({
      steps: ['Think about the method first.'],
      visualAid: '1. Calculate 5 + 7\n2. Find the perimeter of a 3 cm square',
    });

    expect(normalized.content.steps).toEqual([
      'Think about the method first.',
      '1. Calculate 5 + 7',
      '2. Find the perimeter of a 3 cm square',
    ]);
    expect(normalized.content.visualAid).toBeUndefined();
  });

  it('detects practice intent for exercise-generation requests', () => {
    const service = createService();
    const intent = (service as any).detectTutorIntent({
      message: 'Give me 5 practice problems on fractions',
      context: { learningMode: 'full_solution' },
    });

    expect(intent).toBe('practice');
  });

  it('detects hint intent for scaffolded help requests', () => {
    const service = createService();
    const prompt = (service as any).buildTutorSystemPrompt({
      message: 'Give me a hint for this algebra question',
      context: { learningMode: 'hints' },
      effectiveContext: { grade: 'Grade 8', currentSubject: 'Math' },
      state: { flowStep: 'PLAN' },
      missingFields: [],
      assumptionsUsed: [],
      learningMode: 'hints',
      explainDepth: 'normal',
      responseLanguage: 'en',
      languageInstruction: 'LANGUAGE: Respond only in clear British English.',
    });

    expect(prompt).toContain('hint');
    expect(prompt).toContain('scaffold');
  });
});
