import type { TutorStateSnapshot } from '../ai/tutor-conversation-state.service';

export type { TutorStateSnapshot };

export type SimulationBehavior =
  | 'confused'
  | 'rushing'
  | 'answer_only'
  | 'partial_attempt'
  | 'wrong_attempt'
  | 'standard';

export interface ScenarioExpectations {
  /** Minimum flow step reached after the last tutor turn */
  minFlowStep?: 'INTAKE' | 'CLARIFY' | 'PLAN' | 'TEACH' | 'CHECK' | 'WRAP_UP';
  maxRepeatedQuestions?: number;
  maxStalledTurns?: number;
  /** If set, at least one pattern must appear in the last tutor message or structured finalAnswer */
  answerContainsPatterns?: string[];
  /** If true, last structured response should include a non-empty quickCheck */
  structuredShouldHaveCheck?: boolean;
  /** Minimum number of steps in structured content (clarity) */
  minStructuredSteps?: number;
  /** Substrings that should appear somewhere in tutor outputs (curriculum/topic alignment) */
  topicKeywordsInResponse?: string[];
  /** If true, do not fail when answerContainsPatterns is absent (exploratory scenarios) */
  skipAnswerPatterns?: boolean;
}

export interface TutorSimulationScenario {
  id: string;
  title: string;
  behavior: SimulationBehavior;
  grade: string;
  subject: string;
  topic: string;
  locale?: string;
  context: {
    yearGroup?: string;
    grade?: string;
    currentSubject?: string;
    chapter?: string;
    learningMode?: 'hints' | 'full_solution';
    explainDepth?: 'short' | 'normal' | 'detailed';
    locale?: string;
  };
  /** Scripted student lines, in order */
  studentTurns: string[];
  expectations: ScenarioExpectations;
}

export interface TutorSimulationScenarioSet {
  version: string;
  scenarios: TutorSimulationScenario[];
}

export interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
  structuredContent?: Record<string, unknown>;
  flowStepAfter?: string;
}

export interface RubricScores {
  correctness: number;
  clarity: number;
  flow: number;
  safety: number;
  curriculum: number;
  aggregate: number;
}

export interface ScoreOutcome {
  passed: boolean;
  scores: RubricScores;
  failures: Array<{ rubric: string; detail: string }>;
  recommendations: string[];
  finalState: TutorStateSnapshot | null;
}
