import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export type TutorFlowStep = 'INTAKE' | 'CLARIFY' | 'PLAN' | 'TEACH' | 'CHECK' | 'WRAP_UP';
export type TutorMissingField = 'grade' | 'subject';

export interface TutorStickyContext {
  grade?: string;
  currentSubject?: string;
  chapter?: string;
  learningMode?: 'hints' | 'full_solution';
}

export interface TutorStateSnapshot {
  id: string;
  userId: string;
  sessionId: string;
  grade?: string;
  subject?: string;
  chapter?: string;
  learningMode?: string;
  flowStep: TutorFlowStep;
  askedFields: Record<string, boolean>;
  answeredFields: Record<string, boolean>;
  clarificationCount: number;
  repeatedQuestionCount: number;
  repeatedMissingFieldCount: number;
  stalledTurnCount: number;
  lastAssistantQuestionHash?: string;
  lastAssistantMessageHash?: string;
  lastProgressAt?: string;
  assumptions: string[];
  lastTransition?: Record<string, unknown>;
}

const FLOW_ORDER: TutorFlowStep[] = ['INTAKE', 'CLARIFY', 'PLAN', 'TEACH', 'CHECK', 'WRAP_UP'];
const PROGRESS_STEPS: TutorFlowStep[] = ['INTAKE', 'CLARIFY', 'PLAN', 'TEACH', 'CHECK', 'WRAP_UP'];

@Injectable()
export class TutorConversationStateService {
  constructor(private readonly prisma: PrismaService) {}

  async loadOrCreateState(params: {
    userId: string;
    sessionId: string;
    context?: TutorStickyContext;
  }): Promise<TutorStateSnapshot> {
    const { userId, sessionId, context } = params;
    const existing = await (this.prisma as any).tutorConversationState.findUnique({
      where: { userId_sessionId: { userId, sessionId } },
    });

    if (!existing) {
      const askedFields: Record<string, boolean> = {};
      const answeredFields: Record<string, boolean> = {};
      if (context?.grade?.trim()) answeredFields.grade = true;
      if (context?.currentSubject?.trim()) answeredFields.subject = true;

      const created = await (this.prisma as any).tutorConversationState.create({
        data: {
          userId,
          sessionId,
          grade: this.normalizeString(context?.grade),
          subject: this.normalizeString(context?.currentSubject),
          chapter: this.normalizeString(context?.chapter),
          learningMode: this.normalizeString(context?.learningMode),
          flowStep: 'INTAKE',
          askedFields: askedFields as Prisma.InputJsonValue,
          answeredFields: answeredFields as Prisma.InputJsonValue,
          assumptions: [] as Prisma.InputJsonValue,
        },
      });
      return this.normalizeState(created);
    }

    const patch = this.buildStickyContextPatch(existing, context);
    if (Object.keys(patch).length > 0) {
      const updated = await (this.prisma as any).tutorConversationState.update({
        where: { id: existing.id },
        data: patch,
      });
      return this.normalizeState(updated);
    }

    return this.normalizeState(existing);
  }

  getMissingRequiredFields(state: TutorStateSnapshot): TutorMissingField[] {
    const missing: TutorMissingField[] = [];
    if (!state.grade) missing.push('grade');
    if (!state.subject) missing.push('subject');
    return missing;
  }

  hasAskedField(state: TutorStateSnapshot, field: TutorMissingField): boolean {
    return Boolean(state.askedFields[field]);
  }

  hasAnsweredField(state: TutorStateSnapshot, field: TutorMissingField): boolean {
    return Boolean(state.answeredFields[field]);
  }

  computeNextFlowStep(params: {
    currentStep: TutorFlowStep;
    missingFields: TutorMissingField[];
    clarificationCount: number;
    forcedProgress?: boolean;
  }): TutorFlowStep {
    const { currentStep, missingFields, clarificationCount, forcedProgress } = params;
    if (forcedProgress) {
      if (currentStep === 'INTAKE' || currentStep === 'CLARIFY') return 'PLAN';
    }

    if (currentStep === 'INTAKE' || currentStep === 'CLARIFY') {
      if (missingFields.length > 0 && clarificationCount < 2) return 'CLARIFY';
      return 'PLAN';
    }
    if (currentStep === 'PLAN') return 'TEACH';
    if (currentStep === 'TEACH') return 'CHECK';
    if (currentStep === 'CHECK') return 'WRAP_UP';
    return 'PLAN';
  }

  buildProgress(step: TutorFlowStep): { current: number; total: number; label: string } {
    const current = Math.max(PROGRESS_STEPS.indexOf(step) + 1, 1);
    const labels: Record<TutorFlowStep, string> = {
      INTAKE: 'Intake',
      CLARIFY: 'Clarify',
      PLAN: 'Plan',
      TEACH: 'Teach',
      CHECK: 'Check',
      WRAP_UP: 'Wrap-up',
    };
    return { current, total: PROGRESS_STEPS.length, label: labels[step] };
  }

  async updateState(params: {
    stateId: string;
    patch: Partial<{
      grade: string | null;
      subject: string | null;
      chapter: string | null;
      learningMode: string | null;
      flowStep: TutorFlowStep;
      askedFields: Record<string, boolean>;
      answeredFields: Record<string, boolean>;
      clarificationCount: number;
      repeatedQuestionCount: number;
      repeatedMissingFieldCount: number;
      stalledTurnCount: number;
      lastAssistantQuestionHash: string | null;
      lastAssistantMessageHash: string | null;
      lastProgressAt: Date | null;
      assumptions: string[];
      lastTransition: Record<string, unknown>;
    }>;
  }): Promise<TutorStateSnapshot> {
    const patch = params.patch;
    const updated = await (this.prisma as any).tutorConversationState.update({
      where: { id: params.stateId },
      data: {
        ...(patch.grade !== undefined ? { grade: patch.grade } : {}),
        ...(patch.subject !== undefined ? { subject: patch.subject } : {}),
        ...(patch.chapter !== undefined ? { chapter: patch.chapter } : {}),
        ...(patch.learningMode !== undefined ? { learningMode: patch.learningMode } : {}),
        ...(patch.flowStep !== undefined ? { flowStep: patch.flowStep } : {}),
        ...(patch.askedFields !== undefined
          ? { askedFields: patch.askedFields as Prisma.InputJsonValue }
          : {}),
        ...(patch.answeredFields !== undefined
          ? { answeredFields: patch.answeredFields as Prisma.InputJsonValue }
          : {}),
        ...(patch.clarificationCount !== undefined
          ? { clarificationCount: patch.clarificationCount }
          : {}),
        ...(patch.repeatedQuestionCount !== undefined
          ? { repeatedQuestionCount: patch.repeatedQuestionCount }
          : {}),
        ...(patch.repeatedMissingFieldCount !== undefined
          ? { repeatedMissingFieldCount: patch.repeatedMissingFieldCount }
          : {}),
        ...(patch.stalledTurnCount !== undefined ? { stalledTurnCount: patch.stalledTurnCount } : {}),
        ...(patch.lastAssistantQuestionHash !== undefined
          ? { lastAssistantQuestionHash: patch.lastAssistantQuestionHash }
          : {}),
        ...(patch.lastAssistantMessageHash !== undefined
          ? { lastAssistantMessageHash: patch.lastAssistantMessageHash }
          : {}),
        ...(patch.lastProgressAt !== undefined ? { lastProgressAt: patch.lastProgressAt } : {}),
        ...(patch.assumptions !== undefined
          ? { assumptions: patch.assumptions as Prisma.InputJsonValue }
          : {}),
        ...(patch.lastTransition !== undefined
          ? { lastTransition: patch.lastTransition as Prisma.InputJsonValue }
          : {}),
      },
    });
    return this.normalizeState(updated);
  }

  mergeFieldTracking(params: {
    state: TutorStateSnapshot;
    asked?: TutorMissingField[];
    answered?: TutorMissingField[];
  }): { askedFields: Record<string, boolean>; answeredFields: Record<string, boolean> } {
    const askedFields = { ...(params.state.askedFields || {}) };
    const answeredFields = { ...(params.state.answeredFields || {}) };
    (params.asked || []).forEach((field) => {
      askedFields[field] = true;
    });
    (params.answered || []).forEach((field) => {
      answeredFields[field] = true;
    });
    return { askedFields, answeredFields };
  }

  isProgressStep(step: TutorFlowStep): boolean {
    return FLOW_ORDER.indexOf(step) >= FLOW_ORDER.indexOf('PLAN');
  }

  private buildStickyContextPatch(existing: any, context?: TutorStickyContext) {
    if (!context) return {};
    const patch: Record<string, unknown> = {};

    const grade = this.normalizeString(context.grade);
    const subject = this.normalizeString(context.currentSubject);
    const chapter = this.normalizeString(context.chapter);
    const learningMode = this.normalizeString(context.learningMode);

    const answeredFields = this.toBooleanMap(existing.answeredFields);

    if (grade && grade !== existing.grade) {
      patch.grade = grade;
      answeredFields.grade = true;
    }
    if (subject && subject !== existing.subject) {
      patch.subject = subject;
      answeredFields.subject = true;
    }
    if (chapter && chapter !== existing.chapter) patch.chapter = chapter;
    if (learningMode && learningMode !== existing.learningMode) patch.learningMode = learningMode;

    if (Object.keys(patch).length > 0) {
      patch.answeredFields = answeredFields as Prisma.InputJsonValue;
    }

    return patch;
  }

  /** Maps a persisted `TutorConversationState` row to a snapshot (e.g. tutor simulation QA). */
  toSnapshotFromRow(row: any): TutorStateSnapshot {
    return this.normalizeState(row);
  }

  private normalizeState(row: any): TutorStateSnapshot {
    return {
      id: row.id,
      userId: row.userId,
      sessionId: row.sessionId,
      grade: this.normalizeString(row.grade),
      subject: this.normalizeString(row.subject),
      chapter: this.normalizeString(row.chapter),
      learningMode: this.normalizeString(row.learningMode),
      flowStep: (row.flowStep || 'INTAKE') as TutorFlowStep,
      askedFields: this.toBooleanMap(row.askedFields),
      answeredFields: this.toBooleanMap(row.answeredFields),
      clarificationCount: Number(row.clarificationCount || 0),
      repeatedQuestionCount: Number(row.repeatedQuestionCount || 0),
      repeatedMissingFieldCount: Number(row.repeatedMissingFieldCount || 0),
      stalledTurnCount: Number(row.stalledTurnCount || 0),
      lastAssistantQuestionHash: this.normalizeString(row.lastAssistantQuestionHash),
      lastAssistantMessageHash: this.normalizeString(row.lastAssistantMessageHash),
      lastProgressAt: row.lastProgressAt ? new Date(row.lastProgressAt).toISOString() : undefined,
      assumptions: this.toStringArray(row.assumptions),
      lastTransition: (row.lastTransition as Record<string, unknown>) || undefined,
    };
  }

  private normalizeString(value?: string | null): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }

  private toBooleanMap(value: unknown): Record<string, boolean> {
    if (!value || typeof value !== 'object') return {};
    const result: Record<string, boolean> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, flag]) => {
      if (typeof flag === 'boolean') result[key] = flag;
    });
    return result;
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((entry) => typeof entry === 'string').map((entry) => (entry as string).trim()).filter(Boolean);
  }
}
