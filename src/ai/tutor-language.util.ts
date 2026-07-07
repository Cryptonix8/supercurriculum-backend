export type TutorSpokenLanguage = 'el' | 'en';

export function localeToSpokenLanguage(locale?: string): TutorSpokenLanguage {
  return locale === 'en-GB' ? 'en' : 'el';
}

export function spokenLanguageToLocale(language: TutorSpokenLanguage): 'el-GR' | 'en-GB' {
  return language === 'en' ? 'en-GB' : 'el-GR';
}

export function detectTextLanguage(text?: string | null): TutorSpokenLanguage | null {
  if (!text?.trim()) return null;

  const letters = [...text.matchAll(/\p{L}/gu)].map((match) => match[0]);
  if (!letters.length) return null;

  const greekCount = letters.filter((char) => /\p{Script=Greek}/u.test(char)).length;
  const latinCount = letters.filter((char) => /\p{Script=Latin}/u.test(char)).length;
  const greekRatio = greekCount / letters.length;

  if (greekRatio >= 0.35) return 'el';
  if (latinCount > 0 && greekRatio < 0.08) return 'en';
  return null;
}

/** Auto-detect conversation language from user text, session stickiness, then app UI locale. */
export function resolveTutorResponseLanguage(params: {
  appLocale?: string;
  messageText?: string | null;
  sessionResolvedLanguage?: TutorSpokenLanguage;
}): TutorSpokenLanguage {
  // In the Greek app, UI locale should enforce Greek-only responses.
  if (params.appLocale === 'el-GR') return 'el';
  if (params.appLocale === 'en-GB') return 'en';

  const detected = detectTextLanguage(params.messageText);
  if (detected) return detected;

  if (params.sessionResolvedLanguage) return params.sessionResolvedLanguage;

  return localeToSpokenLanguage(params.appLocale);
}

export function extractSessionResolvedLanguage(
  lastTransition?: Record<string, unknown>,
): TutorSpokenLanguage | undefined {
  if (!lastTransition || typeof lastTransition !== 'object') return undefined;
  const tutorLanguage = (lastTransition as { tutorLanguage?: unknown }).tutorLanguage;
  if (!tutorLanguage || typeof tutorLanguage !== 'object') return undefined;
  const resolved = (tutorLanguage as { resolved?: string }).resolved;
  if (resolved === 'en') return 'en';
  if (resolved === 'el') return 'el';
  return undefined;
}

export function mergeSessionLanguageTransition(
  base: Record<string, unknown>,
  resolved: TutorSpokenLanguage,
): Record<string, unknown> {
  return {
    ...base,
    tutorLanguage: { resolved },
  };
}

export function buildTutorLanguageInstruction(language: TutorSpokenLanguage): string {
  if (language === 'en') {
    return '\n\nLANGUAGE: Respond only in clear British English in all answers, explanations, and feedback. Match the language the student uses when they write or speak English.';
  }
  return '\n\nLANGUAGE: Απάντα στα Ελληνικά όταν ο μαθητής γράφει ή μιλάει Ελληνικά. Χρησιμοποίησε καθαρά, σωστά ελληνικά.';
}

export function buildTutorRepairInstruction(language: TutorSpokenLanguage): string {
  if (language === 'en') {
    return 'Rewrite the previous answer in clear British English without mixed scripts or garbled terms. If details are missing, ask one short clarification question instead of inventing words. Return valid JSON in the same shape only.';
  }
  return 'Επανέγραψε την προηγούμενη απάντηση με ΚΑΘΑΡΑ και σωστά Ελληνικά, χωρίς περίεργους ή αλλοιωμένους όρους, χωρίς ανάμειξη λατινικών χαρακτήρων μέσα σε ελληνικές λέξεις. Αν λείπουν στοιχεία, κάνε μία σύντομη διευκρινιστική ερώτηση αντί να εφεύρεις λέξεις. Επέστρεψε μόνο έγκυρο JSON στο ίδιο σχήμα.';
}

export function buildTutorLowQualityFallback(language: TutorSpokenLanguage): {
  message: string;
  plan: string;
  hints: string[];
} {
  if (language === 'en') {
    return {
      message:
        'Could you tell me a bit more specifically what you are stuck on? That will help me guide you with clear steps.',
      plan: 'I need one clarification to give more accurate help.',
      hints: ['Tell me the subject, topic, and what you have tried so far.'],
    };
  }
  return {
    message:
      'Μπορείς να μου πεις λίγο πιο συγκεκριμένα ποιο σημείο σε δυσκολεύει; Έτσι θα σε βοηθήσω με καθαρά και σωστά βήματα.',
    plan: 'Ζητώ μία διευκρίνιση για να δώσω πιο ακριβή βοήθεια.',
    hints: ['Πες μου μάθημα, κεφάλαιο και τι έχεις δοκιμάσει ήδη.'],
  };
}

/** Let Whisper auto-detect so a Greek session can still preserve English speech as English text. */
export function resolveWhisperLanguage(
  _sessionResolvedLanguage?: TutorSpokenLanguage,
): TutorSpokenLanguage | undefined {
  return undefined;
}
