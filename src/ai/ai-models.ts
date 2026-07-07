/** Primary chat / completion model for tutor, feedback, and curriculum AI. */
export const OPENAI_CHAT_MODEL = 'gpt-5.5';

/**
 * Speech-to-text model for voice messages.
 * gpt-4o-transcribe is OpenAI's latest and most accurate transcription model
 * (released 2025). It handles accented English far better than whisper-1 and
 * is significantly less likely to switch output language based on accent.
 * Falls back to whisper-1 if the primary model is unavailable.
 */
export const OPENAI_WHISPER_MODEL = 'gpt-4o-transcribe';
export const OPENAI_WHISPER_FALLBACK_MODEL = 'whisper-1';

/**
 * Text-to-speech models (OpenAI Audio API — separate from chat completions).
 * Tries the higher-quality model first, then falls back to tts-1.
 */
export const OPENAI_TTS_MODELS = ['gpt-4o-mini-tts', 'tts-1'] as const;

/** Voices supported by the OpenAI Audio speech endpoint. */
export const OPENAI_TTS_VOICES = [
  'alloy',
  'ash',
  'coral',
  'echo',
  'fable',
  'onyx',
  'nova',
  'sage',
  'shimmer',
] as const;

export type OpenAiTtsVoice = (typeof OPENAI_TTS_VOICES)[number];

/** Map legacy / invalid voice ids to a supported OpenAI voice. */
export function resolveOpenAiTtsVoice(voice?: string): OpenAiTtsVoice {
  if (voice && (OPENAI_TTS_VOICES as readonly string[]).includes(voice)) {
    return voice as OpenAiTtsVoice;
  }
  // Legacy app values that are not valid OpenAI voice ids
  if (voice === 'verse' || voice === 'aria') {
    return 'nova';
  }
  return 'alloy';
}
