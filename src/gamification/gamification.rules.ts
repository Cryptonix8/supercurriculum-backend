export interface XpRuleContext {
  usedFullSolution?: boolean;
  hintsUsed?: number;
  isCorrect?: boolean;
  correctedAfterFeedback?: boolean;
  spamWithoutCompletion?: boolean;
}

export const GAMIFICATION_XP = {
  TASK_COMPLETED: 20,
  EXERCISE_COMPLETED: 15,
  CORRECT_FINAL_ANSWER: 10,
  HINT_BASED_COMPLETION: 8,
  TUTOR_CHECK_CORRECT: 6,
  MISTAKE_CORRECTED_AFTER_FEEDBACK: 12,
  DAILY_STREAK_BONUS: 5,
  FINAL_ANSWER_ONLY_PENALTY: -8,
  SPAM_WITHOUT_COMPLETION_PENALTY: -10,
} as const;

export function getXpForTaskCompletion(): number {
  return GAMIFICATION_XP.TASK_COMPLETED;
}

export function getXpForExerciseCompletion(context: XpRuleContext): number {
  if (context.usedFullSolution) {
    return 0;
  }
  if ((context.hintsUsed ?? 0) > 0) {
    return GAMIFICATION_XP.HINT_BASED_COMPLETION;
  }
  return GAMIFICATION_XP.EXERCISE_COMPLETED;
}

export function getXpForTutorCheck(context: XpRuleContext): number {
  return context.isCorrect ? GAMIFICATION_XP.TUTOR_CHECK_CORRECT : 0;
}

export function getXpForCorrection(context: XpRuleContext): number {
  return context.correctedAfterFeedback ? GAMIFICATION_XP.MISTAKE_CORRECTED_AFTER_FEEDBACK : 0;
}

export function getPenaltyForFinalAnswerOnlyPattern(context: XpRuleContext): number {
  return context.usedFullSolution ? GAMIFICATION_XP.FINAL_ANSWER_ONLY_PENALTY : 0;
}

export function getPenaltyForSpamWithoutCompletion(context: XpRuleContext): number {
  return context.spamWithoutCompletion ? GAMIFICATION_XP.SPAM_WITHOUT_COMPLETION_PENALTY : 0;
}

