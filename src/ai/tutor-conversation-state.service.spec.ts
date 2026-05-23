import { TutorConversationStateService } from './tutor-conversation-state.service';

describe('TutorConversationStateService', () => {
  let service: TutorConversationStateService;

  beforeEach(() => {
    service = new TutorConversationStateService({} as any);
  });

  it('returns missing grade and subject when absent', () => {
    const missing = service.getMissingRequiredFields({
      id: 'x',
      userId: 'u',
      sessionId: 's',
      flowStep: 'INTAKE',
      askedFields: {},
      answeredFields: {},
      clarificationCount: 0,
      repeatedQuestionCount: 0,
      repeatedMissingFieldCount: 0,
      stalledTurnCount: 0,
      assumptions: [],
    });

    expect(missing).toEqual(['grade', 'subject']);
  });

  it('moves intake to clarify when missing fields remain', () => {
    const next = service.computeNextFlowStep({
      currentStep: 'INTAKE',
      missingFields: ['grade'],
      clarificationCount: 0,
    });
    expect(next).toBe('CLARIFY');
  });

  it('forces clarify to plan after first ask when assumptions are used', () => {
    const next = service.computeNextFlowStep({
      currentStep: 'CLARIFY',
      missingFields: ['subject'],
      clarificationCount: 1,
      forcedProgress: true,
    });
    expect(next).toBe('PLAN');
  });

  it('advances from plan to teach', () => {
    const next = service.computeNextFlowStep({
      currentStep: 'PLAN',
      missingFields: [],
      clarificationCount: 0,
    });
    expect(next).toBe('TEACH');
  });

  it('builds progress metadata for each step', () => {
    const progress = service.buildProgress('CHECK');
    expect(progress).toEqual({
      current: 5,
      total: 6,
      label: 'Check',
    });
  });
});
