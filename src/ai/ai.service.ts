import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';
import { EDUCATION_LEVELS_FOR_AI } from '../common/education-levels';
import * as fs from 'fs';
import { YouTubeRecommendationService } from './youtube-recommendation.service';
import { UpdateTutorVideoConfigDto } from './dto/tutor-video-config.dto';
import { Prisma } from '@prisma/client';
import {
  TutorConversationStateService,
  TutorFlowStep,
  TutorMissingField,
} from './tutor-conversation-state.service';

/** Bump when tutor system prompt or structured response contract in `chat()` changes materially (simulation baselines / regression tracking). */
export const AI_TUTOR_PROMPT_VERSION = '2026.05.06';

/** Tutor replies are always in English regardless of app UI locale. */
const TUTOR_RESPONSE_LOCALE_FOR_QUALITY = 'en-GB';

interface StructuredTutorContent {
  plan?: string;
  hints?: string[];
  steps?: string[];
  finalAnswer?: string;
  quickCheck?: string;
  commonMistakes?: string[];
  recap?: string;
  visualAid?: string;
}

interface StructuredTutorResponse {
  message: string;
  structuredContent: StructuredTutorContent;
}

interface TutorQualityAssessment {
  score: number;
  lowQuality: boolean;
  issues: string[];
  correctionsApplied: number;
}

interface TutorSpeechChunk {
  id: string;
  title: string;
  text: string;
  audioBase64: string;
  mimeType: string;
  estimatedDurationMs: number;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI;
  private readonly controlledCorrections: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /κλώτσιενσε/giu, replacement: 'κλώτσησε' },
    { pattern: /παρονομαστηςς/giu, replacement: 'παρονομαστής' },
    { pattern: /κλασμαα/giu, replacement: 'κλάσμα' },
    { pattern: /προτασιη/giu, replacement: 'πρόταση' },
  ];

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private youtubeRecommendations: YouTubeRecommendationService,
    private tutorConversationState: TutorConversationStateService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  /**
   * Generate AI feedback for a student submission
   */
  async generateFeedback(params: {
    taskInstructions: string;
    expectedOutcome: string;
    studentSubmission: string;
    yearGroup: string;
    subject: string;
    skill: string;
    band: string;
  }) {
    const prompt = `You are an experienced, supportive educator. Give feedback for a ${params.yearGroup} student on ${params.subject} (${params.skill}).

Task instructions:
${params.taskInstructions}

Expected outcome:
${params.expectedOutcome}

Student submission:
${params.studentSubmission}

Student band level: ${params.band}

Return ONLY valid JSON with this exact shape:
{
  "strength": "One specific strength",
  "nextStep": "One clear next step for improvement",
  "modelAnswer": "Short exemplar answer (2-3 sentences)"
}

Write entirely in English, friendly and encouraging, age-appropriate.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a supportive educational AI assistant. Always respond in clear English for student-facing feedback.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      const feedbackText = response.choices[0].message.content;
      const feedback = JSON.parse(feedbackText);

      return feedback;
    } catch (error) {
      console.error('Error generating AI feedback:', error);
      // Return fallback feedback
      return {
        strength: 'You made a solid attempt on this task.',
        nextStep: 'Next time, add a bit more detail and one concrete example.',
        modelAnswer: 'A strong answer includes specific examples and clear explanations.',
      };
    }
  }

  /**
   * AI Tutor Chat - handle a conversation message
   */
  async chat(params: {
    userId: string;
    sessionId: string;
    message: string;
    context?: {
      yearGroup?: string;
      currentSubject?: string;
      chapter?: string;
      grade?: string;
      learningMode?: 'hints' | 'full_solution';
      explainDepth?: 'short' | 'normal' | 'detailed';
      recentTasks?: string[];
      locale?: string;
      preferFastResponses?: boolean;
    };
  }) {
    const responseLanguage = 'en';
    const fieldLabels: Record<TutorMissingField, string> = {
      grade: 'grade',
      subject: 'subject/topic',
    };

    const state = await this.tutorConversationState.loadOrCreateState({
      userId: params.userId,
      sessionId: params.sessionId,
      context: {
        grade: params.context?.grade,
        currentSubject: params.context?.currentSubject,
        chapter: params.context?.chapter,
        learningMode: params.context?.learningMode,
      },
    });

    const effectiveContext = {
      ...(params.context || {}),
      grade: params.context?.grade || state.grade,
      currentSubject: params.context?.currentSubject || state.subject,
      chapter: params.context?.chapter || state.chapter,
      learningMode: params.context?.learningMode || (state.learningMode as 'hints' | 'full_solution'),
    };

    const learningMode = effectiveContext.learningMode || 'full_solution';
    const explainDepth = params.context?.explainDepth || 'normal';
    const preferFastResponses = params.context?.preferFastResponses !== false;

    const stateWithEffectiveContext = {
      ...state,
      grade: effectiveContext.grade || state.grade,
      subject: effectiveContext.currentSubject || state.subject,
      chapter: effectiveContext.chapter || state.chapter,
      learningMode: learningMode,
    };

    const answeredByContext: TutorMissingField[] = [];
    if (stateWithEffectiveContext.grade) answeredByContext.push('grade');
    if (stateWithEffectiveContext.subject) answeredByContext.push('subject');
    const baseTracking = this.tutorConversationState.mergeFieldTracking({
      state,
      answered: answeredByContext,
    });
    const missingFields = this.tutorConversationState.getMissingRequiredFields(
      stateWithEffectiveContext as any,
    );
    const fieldsToAsk = missingFields.filter((field) => !this.tutorConversationState.hasAskedField(state, field));
    const shouldClarifyNow =
      fieldsToAsk.length > 0 &&
      state.clarificationCount < 2 &&
      (state.flowStep === 'INTAKE' || state.flowStep === 'CLARIFY');

    if (shouldClarifyNow) {
      const field = fieldsToAsk[0];
      const question =
        field === 'grade'
          ? 'Before we continue, tell me your grade/class (for example Year 7 or Grade 8) so I can adjust the steps.'
          : 'To continue accurately, what subject or topic are you working on now?';

      const clarificationResponse: StructuredTutorResponse = {
        message: question,
        structuredContent: {
          plan: 'I need one more detail to give accurate guidance.',
          hints: [`Share only your ${fieldLabels[field]} and we continue immediately.`],
        },
      };

      await this.prisma.chatMessage.create({
        data: {
          userId: params.userId,
          sessionId: params.sessionId,
          role: 'USER',
          content: params.message,
          context: effectiveContext || {},
        },
      });

      const askedTracking = this.tutorConversationState.mergeFieldTracking({
        state,
        asked: [field],
        answered: answeredByContext,
      });
      const questionHash = this.hashTutorText(clarificationResponse.message);
      const updatedState = await this.tutorConversationState.updateState({
        stateId: state.id,
        patch: {
          grade: stateWithEffectiveContext.grade || null,
          subject: stateWithEffectiveContext.subject || null,
          chapter: stateWithEffectiveContext.chapter || null,
          learningMode: learningMode,
          flowStep: 'CLARIFY',
          askedFields: askedTracking.askedFields,
          answeredFields: askedTracking.answeredFields,
          clarificationCount: state.clarificationCount + 1,
          repeatedQuestionCount:
            state.lastAssistantQuestionHash === questionHash ? state.repeatedQuestionCount + 1 : 0,
          repeatedMissingFieldCount: state.repeatedMissingFieldCount,
          stalledTurnCount: state.stalledTurnCount + 1,
          lastAssistantQuestionHash: questionHash,
          lastAssistantMessageHash: this.hashTutorText(clarificationResponse.message),
          assumptions: state.assumptions,
          lastTransition: {
            fromStep: state.flowStep,
            toStep: 'CLARIFY',
            missingFields,
            askedField: field,
            forcedProgress: false,
            mode: 'clarify_once',
            at: new Date().toISOString(),
          },
        },
      });

      await this.prisma.chatMessage.create({
        data: {
          userId: params.userId,
          sessionId: params.sessionId,
          role: 'ASSISTANT',
          content: clarificationResponse.message,
          context: {
            ...(effectiveContext || {}),
            structuredContent: clarificationResponse.structuredContent as unknown as Prisma.InputJsonValue,
            tutoringState: {
              flowStep: updatedState.flowStep,
              grade: updatedState.grade || null,
              subject: updatedState.subject || null,
              learningMode: updatedState.learningMode || learningMode,
              assumptionsUsed: [],
            },
            progress: this.tutorConversationState.buildProgress(updatedState.flowStep),
          } as Prisma.InputJsonValue,
        },
      });

      this.logger.log(
        JSON.stringify({
          event: 'tutor_flow_transition',
          sessionId: params.sessionId,
          userId: params.userId,
          fromStep: state.flowStep,
          toStep: 'CLARIFY',
          clarificationCount: updatedState.clarificationCount,
          missingFields,
          loopSignals: {
            repeatedQuestionCount: updatedState.repeatedQuestionCount,
            repeatedMissingFieldCount: updatedState.repeatedMissingFieldCount,
            stalledTurnCount: updatedState.stalledTurnCount,
          },
        }),
      );

      return {
        message: clarificationResponse.message,
        structuredContent: clarificationResponse.structuredContent,
        learningModeApplied: learningMode,
        explainDepthApplied: explainDepth,
        sessionId: params.sessionId,
        tutoringState: {
          flowStep: updatedState.flowStep,
          grade: updatedState.grade || undefined,
          subject: updatedState.subject || undefined,
          learningMode: (updatedState.learningMode as 'hints' | 'full_solution') || learningMode,
          assumptionsUsed: [],
        },
        progress: this.tutorConversationState.buildProgress(updatedState.flowStep),
        videoSuggestion: { shouldSuggest: false },
      };
    }

    const assumptionsUsed = this.buildAssumptions(missingFields, responseLanguage);
    const mergedAssumptions = Array.from(new Set([...(state.assumptions || []), ...assumptionsUsed]));

    // Get conversation history
    const history = await this.prisma.chatMessage.findMany({
      where: {
        userId: params.userId,
        sessionId: params.sessionId,
      },
      orderBy: { createdAt: 'asc' },
      take: preferFastResponses ? 6 : 10,
    });

    const languageInstruction =
      '\n\nLANGUAGE: You must reply only in English in every field (message and structuredContent): explanations, prompts, hints, checks, and recaps must be fluent, clear British or international classroom English.';

    // Build system prompt with context
    const systemPrompt = `You are a friendly, supportive AI tutor helping a ${effectiveContext?.yearGroup || ''} student with their studies.

Your role:
- Answer questions clearly and simply
- Guide students to find answers themselves rather than just giving them
- Be encouraging and maintain a growth mindset
- Keep responses concise (2-4 sentences usually)
- Use age-appropriate language
- If the student's question is unclear, ambiguous, or missing key details, ask at most 1 short clarification question only when absolutely needed.
- Do not guess the student's intent when multiple interpretations are possible.
- Follow this strict tutoring flow and keep moving forward: understand -> clarify (once) -> plan -> teach -> check -> summarize.
- Never re-ask grade or subject if they are already known in the provided context.
- If key details are still missing after one ask, proceed with explicit assumptions and provide the next actionable step.

IMPORTANT - Math Equations:
- When writing mathematical equations, formulas, or expressions, wrap them in LaTeX format using double dollar signs: $$equation$$
- For inline math, use single dollar signs: $equation$
- Examples:
  - Quadratic formula: $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$
  - Simple equation: $2x + 5 = 13$
  - Fractions: $\\frac{3}{4}$ or $\\frac{a}{b}$
  - Powers: $x^2$ or $2^{10}$
  - Square roots: $\\sqrt{16} = 4$
- Always use proper LaTeX notation for all mathematical expressions

IMPORTANT - Equation Presentation Style:
- Start with a short line explaining what is being solved.
- Show one transformation per line (no large jumps).
- Keep steps ordered and readable for school students.
- Clearly mark the final answer on its own line.
- Add a quick check line when useful (substitution or sanity check).

IMPORTANT - Diagrams (Tier 1 text-based required when visuals are needed):
- If a question needs a diagram/graph/circuit/geometry sketch, explicitly say what you will provide.
- Provide a text-based diagram using structured points/lines/angles/relationships.
- For graphs, include a small value table + key points (intercepts/vertex/turning point) + shape description.
- Ask at most 1-2 targeted clarification questions only if critical data is missing.
- Pair every text-based diagram with a short reasoning line: "From the diagram, we see..., therefore..."

Current subject focus: ${effectiveContext?.currentSubject || 'General'}
Current chapter focus: ${effectiveContext?.chapter || 'Not specified'}
Current grade context: ${effectiveContext?.grade || effectiveContext?.yearGroup || 'Not specified'}
Learning mode: ${learningMode}
Explain depth: ${explainDepth}
Current flow step: ${state.flowStep}
Known missing fields: ${missingFields.join(', ') || 'none'}
Assumptions to use if needed: ${assumptionsUsed.join(' | ') || 'none'}

${EDUCATION_LEVELS_FOR_AI}

Response contract (REQUIRED):
- Return valid JSON only.
- Use this exact shape:
{
  "message": "concise natural-language answer text",
  "structuredContent": {
    "plan": "short plan",
    "hints": ["hint 1", "hint 2"],
    "steps": ["step 1", "step 2"],
    "finalAnswer": "final answer line",
    "quickCheck": "short check",
    "commonMistakes": ["mistake 1", "mistake 2"],
    "recap": "one-line recap",
    "visualAid": "optional text diagram or graph guidance"
  }
}
- Keep all fields optional except "message" and "structuredContent", but prefer filling most of them when useful.
- If learning mode is "hints", prioritize plan + hints and keep finalAnswer concise.
- If learning mode is "full_solution", include clear steps and finalAnswer.
- Respect explain depth:
  - short: compact and minimal
  - normal: balanced detail
  - detailed: richer explanation with extra reasoning
- Keep equations in LaTeX format exactly as specified above.${languageInstruction}`;

    // Build messages array
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add history
    history.forEach((msg) => {
      if (msg.role === 'USER') {
        messages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'ASSISTANT') {
        // Do not feed back non-English assistant history; it can anchor future replies in Greek.
        if (!this.containsGreekScript(msg.content || '')) {
          messages.push({ role: 'assistant', content: msg.content });
        }
      }
    });

    // Add current message
    messages.push({ role: 'user', content: params.message });

    try {
      let { parsed, tokenCount } = await this.requestStructuredTutorCompletion(messages, {
        maxTokens: preferFastResponses ? 520 : 900,
        temperature: preferFastResponses ? 0.7 : 0.8,
      });
      let { filtered, quality } = this.applyTutorQualityFilter(parsed, TUTOR_RESPONSE_LOCALE_FOR_QUALITY);
      if (this.containsGreekScript(this.collectTutorResponseText(filtered))) {
        quality.lowQuality = true;
        if (!quality.issues.includes('non_english_script_presence')) {
          quality.issues.push('non_english_script_presence');
        }
      }

      const shouldRepairLowQuality =
        quality.lowQuality &&
        (!preferFastResponses || quality.issues.includes('non_english_script_presence'));
      if (shouldRepairLowQuality) {
        const repairInstruction =
          'Rewrite your previous answer in clear, natural English only. Translate every Greek/non-English part into English and remove all non-Latin script. If something is missing, ask one short clarification question instead of inventing terms. Return only valid JSON in the same shape.';
        const retry = await this.requestStructuredTutorCompletion([
          ...messages,
          { role: 'user', content: repairInstruction },
        ], {
          maxTokens: preferFastResponses ? 420 : 700,
          temperature: 0.6,
        });
        tokenCount += retry.tokenCount;
        const retried = this.applyTutorQualityFilter(retry.parsed, TUTOR_RESPONSE_LOCALE_FOR_QUALITY);
        filtered = retried.filtered;
        quality = retried.quality;
        if (this.containsGreekScript(this.collectTutorResponseText(filtered))) {
          quality.lowQuality = true;
          if (!quality.issues.includes('non_english_script_presence')) {
            quality.issues.push('non_english_script_presence');
          }
        }
      }

      if (quality.lowQuality) {
        filtered = {
          message:
            'Which part are you stuck on? A bit more detail will help me give clear, step-by-step help.',
          structuredContent: {
            plan: 'I need a quick clarification to give more accurate help.',
            hints: ['Tell me the subject, topic, and what you have tried so far.'],
          },
        };
      }

      filtered = this.enforceForwardProgress({
        response: filtered,
        state: stateWithEffectiveContext as any,
        missingFields,
        assumptionsUsed,
        learningMode,
        locale: responseLanguage,
      });

      const flatMessage = filtered.message;
      const inferredStep = this.inferStepFromStructuredContent(filtered.structuredContent);
      const computedStep = this.tutorConversationState.computeNextFlowStep({
        currentStep: state.flowStep,
        missingFields,
        clarificationCount: state.clarificationCount,
        forcedProgress: assumptionsUsed.length > 0,
      });
      const nextFlowStep = this.pickMostAdvancedStep(computedStep, inferredStep);
      const assistantQuestionHash = flatMessage.includes('?') ? this.hashTutorText(flatMessage) : null;
      const repeatedQuestionCount =
        assistantQuestionHash && assistantQuestionHash === state.lastAssistantQuestionHash
          ? state.repeatedQuestionCount + 1
          : 0;
      const repeatedMissingFieldCount =
        this.detectRepeatedKnownFieldAsk(flatMessage, stateWithEffectiveContext as any) > 0
          ? state.repeatedMissingFieldCount + 1
          : state.repeatedMissingFieldCount;
      const madeProgress = this.tutorConversationState.isProgressStep(nextFlowStep);
      const stalledTurnCount = madeProgress ? 0 : state.stalledTurnCount + 1;
      const mergedTracking = this.tutorConversationState.mergeFieldTracking({
        state,
        answered: answeredByContext,
      });

      const updatedState = await this.tutorConversationState.updateState({
        stateId: state.id,
        patch: {
          grade: stateWithEffectiveContext.grade || null,
          subject: stateWithEffectiveContext.subject || null,
          chapter: stateWithEffectiveContext.chapter || null,
          learningMode,
          flowStep: nextFlowStep,
          askedFields: baseTracking.askedFields,
          answeredFields: mergedTracking.answeredFields,
          clarificationCount: state.clarificationCount,
          repeatedQuestionCount,
          repeatedMissingFieldCount,
          stalledTurnCount,
          lastAssistantQuestionHash: assistantQuestionHash,
          lastAssistantMessageHash: this.hashTutorText(flatMessage),
          lastProgressAt: madeProgress ? new Date() : null,
          assumptions: mergedAssumptions,
          lastTransition: {
            fromStep: state.flowStep,
            toStep: nextFlowStep,
            missingFields,
            assumptionsUsed,
            mode: 'model_response',
            at: new Date().toISOString(),
          },
        },
      });

      const configPromise = this.youtubeRecommendations.getConfig();

      // Save user message
      await this.prisma.chatMessage.create({
        data: {
          userId: params.userId,
          sessionId: params.sessionId,
          role: 'USER',
          content: params.message,
          context: effectiveContext || {},
        },
      });

      // Save AI response
      await this.prisma.chatMessage.create({
        data: {
          userId: params.userId,
          sessionId: params.sessionId,
          role: 'ASSISTANT',
          content: flatMessage,
          context: {
            ...(effectiveContext || {}),
            structuredContent: filtered.structuredContent as unknown as Prisma.InputJsonValue,
            qualityScore: quality.score,
            qualityIssues: quality.issues,
            qualityCorrectionsApplied: quality.correctionsApplied,
            tutoringState: {
              flowStep: updatedState.flowStep,
              grade: updatedState.grade || null,
              subject: updatedState.subject || null,
              learningMode: updatedState.learningMode || learningMode,
              assumptionsUsed,
            },
            progress: this.tutorConversationState.buildProgress(updatedState.flowStep),
          } as Prisma.InputJsonValue,
          tokenCount,
        },
      });

      this.logger.log(
        `[ai.tutor.quality] score=${quality.score} lowQuality=${quality.lowQuality} corrections=${quality.correctionsApplied} issues=${quality.issues.join('|')}`,
      );
      this.logger.log(
        JSON.stringify({
          event: 'tutor_flow_transition',
          sessionId: params.sessionId,
          userId: params.userId,
          fromStep: state.flowStep,
          toStep: updatedState.flowStep,
          missingFields,
          assumptionsUsed,
          clarificationCount: updatedState.clarificationCount,
          loopSignals: {
            repeatedQuestionCount: updatedState.repeatedQuestionCount,
            repeatedMissingFieldCount: updatedState.repeatedMissingFieldCount,
            stalledTurnCount: updatedState.stalledTurnCount,
          },
        }),
      );

      const config = await configPromise;
      const shouldSuggest =
        config.autoSuggestEnabled &&
        this.youtubeRecommendations.shouldAutoSuggestVideos(params.message || '');

      return {
        message: flatMessage,
        structuredContent: filtered.structuredContent,
        learningModeApplied: learningMode,
        explainDepthApplied: explainDepth,
        sessionId: params.sessionId,
        tutoringState: {
          flowStep: updatedState.flowStep,
          grade: updatedState.grade || undefined,
          subject: updatedState.subject || undefined,
          learningMode: (updatedState.learningMode as 'hints' | 'full_solution') || learningMode,
          assumptionsUsed,
        },
        progress: this.tutorConversationState.buildProgress(updatedState.flowStep),
        videoSuggestion: shouldSuggest
          ? {
              shouldSuggest: true,
              prompt: 'Want a couple of short videos on this?',
              topicHint: params.message,
            }
          : { shouldSuggest: false },
      };
    } catch (error) {
      console.error('Error in AI chat:', error);
      const fallback = "I'm having connection trouble right now. Please try again in a moment.";
      const parsedFallback = this.buildStructuredTutorFallback(
        JSON.stringify({
          message: fallback,
          structuredContent: {
            plan: fallback,
          },
        }),
      );
      return {
        message: parsedFallback.message,
        structuredContent: parsedFallback.structuredContent,
        learningModeApplied: learningMode,
        explainDepthApplied: params.context?.explainDepth || 'normal',
        sessionId: params.sessionId,
        tutoringState: {
          flowStep: state.flowStep,
          grade: state.grade || undefined,
          subject: state.subject || undefined,
          learningMode: (state.learningMode as 'hints' | 'full_solution') || learningMode,
          assumptionsUsed,
        },
        progress: this.tutorConversationState.buildProgress(state.flowStep),
        videoSuggestion: { shouldSuggest: false },
      };
    }
  }

  async recommendVideos(params: {
    userId: string;
    sessionId?: string;
    topic?: string;
    message?: string;
    context?: {
      yearGroup?: string;
      currentSubject?: string;
      locale?: string;
    };
    maxResults?: number;
  }) {
    const topic = (params.topic || params.message || '').trim();
    if (!topic) {
      return {
        query: '',
        results: [],
        quality: {
          weak: true,
          reason: 'Please share a specific topic first (subject + concept).',
        },
      };
    }

    const previousFeedbackRows = await this.prisma.tutorVideoFeedback.findMany({
      where: {
        userId: params.userId,
        sessionId: params.sessionId,
        query: topic,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { videoId: true, metadata: true },
    });

    const previousVideoIds = previousFeedbackRows
      .filter((row) => (row.metadata as any)?.action === 'shown')
      .map((row) => row.videoId);

    const recommendation = await this.youtubeRecommendations.recommend({
      topic,
      subject: params.context?.currentSubject,
      yearGroup: params.context?.yearGroup,
      locale: params.context?.locale,
      maxResults: params.maxResults,
      previousVideoIds,
    });

    if (recommendation.results?.length) {
      await Promise.all(
        recommendation.results.map((item) =>
          this.youtubeRecommendations.saveFeedback({
            userId: params.userId,
            sessionId: params.sessionId,
            videoId: item.videoId,
            query: topic,
            clicked: false,
            metadata: { action: 'shown' },
          }),
        ),
      );
    }

    return recommendation;
  }

  async saveVideoFeedback(params: {
    userId: string;
    sessionId?: string;
    videoId: string;
    query: string;
    clicked?: boolean;
    helpful?: boolean;
    reported?: boolean;
    reason?: string;
    metadata?: Record<string, any>;
  }) {
    return this.youtubeRecommendations.saveFeedback(params);
  }

  async reportTypo(params: {
    userId: string;
    screenId: string;
    textKey?: string;
    rawText: string;
    locale?: string;
    sessionId?: string;
    context?: Record<string, any>;
  }) {
    const payload = {
      userId: params.userId,
      screenId: params.screenId,
      textKey: params.textKey || null,
      rawText: params.rawText,
      locale: params.locale || null,
      context: {
        ...(params.context || {}),
        sessionId: params.sessionId || null,
      },
    };
    const row = await (this.prisma as any).copyIssueReport.create({
      data: payload,
      select: { id: true, status: true, createdAt: true },
    });
    return {
      ok: true,
      reportId: row.id,
      status: row.status,
      createdAt: row.createdAt,
    };
  }

  async getTutorVideoConfig() {
    return this.youtubeRecommendations.getConfig();
  }

  async updateTutorVideoConfig(dto: UpdateTutorVideoConfigDto) {
    return this.youtubeRecommendations.updateConfig(dto);
  }

  /**
   * Get chat history for a session
   */
  async getChatHistory(userId: string, sessionId: string) {
    return this.prisma.chatMessage.findMany({
      where: {
        userId,
        sessionId,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Create a new chat session
   */
  async createSession(userId: string) {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return { sessionId };
  }

  /**
   * Process image message - analyze image and get AI tutor response
   * Uses GPT-4o Vision for image understanding
   * Supports: homework help, handwritten answers, school book exercises
   */
  async processImageMessage(params: {
    userId: string;
    sessionId: string;
    imagePath: string;
    userMessage?: string;
    context?: {
      yearGroup?: string;
      currentSubject?: string;
      purpose?: 'homework_help' | 'answer_submission' | 'general';
      locale?: string;
    };
  }) {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    const imageLanguageInstruction =
      '\n\nLANGUAGE: Reply only in English for the whole analysis and feedback.';

    try {
      const imageBuffer = fs.readFileSync(params.imagePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = this.getImageMimeType(params.imagePath);

      const history = await this.prisma.chatMessage.findMany({
        where: {
          userId: params.userId,
          sessionId: params.sessionId,
        },
        orderBy: { createdAt: 'asc' },
        take: 5,
      });

      const purpose = params.context?.purpose || 'homework_help';
      let systemPrompt: string;

      if (purpose === 'homework_help') {
        systemPrompt = `You are a friendly, supportive AI tutor helping a ${params.context?.yearGroup || ''} student with their studies.

The student has sent you a photo of something they need help with (could be a textbook page, worksheet, homework problem, or handwritten work).

Your role:
1. First, carefully analyze what's in the image
2. Identify the subject and type of problem/question
3. Guide the student through understanding it step by step
4. DON'T just give the answer - help them learn
5. Ask guiding questions to check their understanding
6. Be encouraging and supportive

IMPORTANT - Math Equations:
- When writing mathematical equations, formulas, or expressions, wrap them in LaTeX format using double dollar signs: $$equation$$
- For inline math, use single dollar signs: $equation$
- Examples: $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$ or $2x + 5 = 13$
- Always use proper LaTeX notation for all mathematical expressions

For equation-heavy answers, present steps clearly: one step per line, final answer clearly marked, and a short check when useful.
If a visual is required, provide at least a Tier 1 text-based diagram (points/lines/angles or value table + key points for graphs) and then explain what it implies.

${EDUCATION_LEVELS_FOR_AI}

Keep responses concise and age-appropriate. If you can't clearly see or understand something in the image, ask for clarification.${imageLanguageInstruction}`;
      } else if (purpose === 'answer_submission') {
        systemPrompt = `You are a friendly, supportive AI tutor reviewing a ${params.context?.yearGroup || ''} student's handwritten answer.

The student has submitted a photo of their written work/answer.

Your role:
1. Carefully read and understand their handwritten response
2. Check if the work is correct
3. If correct, praise them and explain why it's right
4. If incorrect, gently guide them to find the error themselves
5. Provide specific, constructive feedback
6. Suggest next steps for improvement

IMPORTANT - Math Equations:
- When writing mathematical equations, formulas, or expressions, wrap them in LaTeX format using double dollar signs: $$equation$$
- For inline math, use single dollar signs: $equation$
- Examples: $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$ or $2x + 5 = 13$
- Always use proper LaTeX notation for all mathematical expressions

For equation-heavy answers, present steps clearly: one step per line, final answer clearly marked, and a short check when useful.
If a visual is required, provide at least a Tier 1 text-based diagram (points/lines/angles or value table + key points for graphs) and then explain what it implies.

${EDUCATION_LEVELS_FOR_AI}

Be encouraging and focus on learning, not just being right or wrong.${imageLanguageInstruction}`;
      } else {
        systemPrompt = `You are a helpful AI tutor. Analyze this image and help the student with whatever they need.
${EDUCATION_LEVELS_FOR_AI}

Keep responses friendly, age-appropriate for a ${params.context?.yearGroup || 'school'} student, and educational.
Use clear step-by-step equations where relevant (one transformation per line) and provide Tier 1 text-based diagrams when a visual explanation is needed.${imageLanguageInstruction}`;
      }

      // Build messages array
      const messages: any[] = [
        { role: 'system', content: systemPrompt },
      ];

      // Add recent history for context
      history.forEach((msg) => {
        if (msg.role === 'USER') {
          messages.push({ role: 'user', content: msg.content });
        } else if (msg.role === 'ASSISTANT') {
          messages.push({ role: 'assistant', content: msg.content });
        }
      });

      // Add current image message with GPT-4o Vision format
      const userContent: any[] = [
        {
          type: 'image_url',
          image_url: {
            url: `data:${mimeType};base64,${base64Image}`,
            detail: 'high', // Use high detail for better text recognition
          },
        },
      ];

      // Add optional text message
      if (params.userMessage && params.userMessage.trim()) {
        userContent.unshift({
          type: 'text',
          text: params.userMessage,
        });
      } else {
        // Default message based on purpose
        const defaultMessages = {
          homework_help: 'I need help with this. Can you explain it to me?',
          answer_submission: "Here's my answer. Can you check if it's correct?",
          general: 'What can you tell me about this?',
        };
        userContent.unshift({
          type: 'text',
          text: defaultMessages[purpose],
        });
      }

      messages.push({ role: 'user', content: userContent });

      // Call GPT-4o Vision
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o', // GPT-4o has vision capabilities
        messages,
        temperature: 0.7,
        max_tokens: 1000,
      });

      let aiResponse = response.choices[0].message.content || '';
      if (this.containsGreekScript(aiResponse)) {
        const englishRewrite = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'Convert the given tutor response to clear English only. Keep the educational meaning and remove all Greek/non-Latin script.',
            },
            {
              role: 'user',
              content: aiResponse,
            },
          ],
          temperature: 0.2,
          max_tokens: 1000,
        });
        aiResponse = englishRewrite.choices[0].message.content || aiResponse;
      }

      // Save user message (with image indicator)
      const userMessageContent = params.userMessage 
        ? `[📷 Image] ${params.userMessage}`
        : `[📷 Image sent for ${purpose === 'homework_help' ? 'homework help' : purpose === 'answer_submission' ? 'answer check' : 'analysis'}]`;

      await this.prisma.chatMessage.create({
        data: {
          userId: params.userId,
          sessionId: params.sessionId,
          role: 'USER',
          content: userMessageContent,
          context: {
            ...params.context,
            hasImage: true,
            imagePurpose: purpose,
          },
        },
      });

      // Save AI response
      await this.prisma.chatMessage.create({
        data: {
          userId: params.userId,
          sessionId: params.sessionId,
          role: 'ASSISTANT',
          content: aiResponse,
          context: params.context || {},
          tokenCount: response.usage?.total_tokens || 0,
        },
      });

      return {
        message: aiResponse,
        sessionId: params.sessionId,
        imageAnalyzed: true,
        purpose,
      };
    } catch (error) {
      console.error('Error processing image message:', error);
      const errorMsg =
        "I'm having trouble analyzing that image right now. Please try again, or make sure the image is clear and well-lit.";
      return {
        message: errorMsg,
        sessionId: params.sessionId,
        imageAnalyzed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Helper to determine image MIME type from file path
   */
  private getImageMimeType(filePath: string): string {
    const ext = filePath.toLowerCase().split('.').pop();
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
    };
    return mimeTypes[ext || ''] || 'image/jpeg';
  }

  private hashTutorText(value: string): string {
    const normalized = (value || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\p{L}\p{N}\s?!.,]/gu, '')
      .trim();
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      hash = (hash << 5) - hash + normalized.charCodeAt(i);
      hash |= 0;
    }
    return `${hash}`;
  }

  private buildAssumptions(missingFields: TutorMissingField[], locale: 'el' | 'en'): string[] {
    const assumptions: string[] = [];
    if (!missingFields.length) return assumptions;
    if (missingFields.includes('grade')) {
      assumptions.push(
        locale === 'el'
          ? 'Υπόθεση: επίπεδο περίπου μέσης δυσκολίας σχολείου.'
          : 'Assumption: school-level medium difficulty.',
      );
    }
    if (missingFields.includes('subject')) {
      assumptions.push(
        locale === 'el'
          ? 'Υπόθεση: γενικό θέμα σχετικό με την ερώτηση του μαθητή.'
          : 'Assumption: general subject inferred from the student question.',
      );
    }
    return assumptions;
  }

  private detectRepeatedKnownFieldAsk(
    message: string,
    state: { grade?: string; subject?: string },
  ): number {
    const text = (message || '').toLowerCase();
    let hits = 0;
    const asksGrade = /grade|class|year|τάξη|classroom/.test(text);
    const asksSubject = /subject|topic|μάθημα|θέμα/.test(text);
    if (state.grade && asksGrade) hits += 1;
    if (state.subject && asksSubject) hits += 1;
    return hits;
  }

  private inferStepFromStructuredContent(content: StructuredTutorContent): TutorFlowStep {
    if (content.recap) return 'WRAP_UP';
    if (content.quickCheck) return 'CHECK';
    if (content.steps?.length || content.finalAnswer) return 'TEACH';
    if (content.plan) return 'PLAN';
    return 'CLARIFY';
  }

  private pickMostAdvancedStep(base: TutorFlowStep, inferred: TutorFlowStep): TutorFlowStep {
    const order: TutorFlowStep[] = ['INTAKE', 'CLARIFY', 'PLAN', 'TEACH', 'CHECK', 'WRAP_UP'];
    const baseIndex = order.indexOf(base);
    const inferredIndex = order.indexOf(inferred);
    return inferredIndex > baseIndex ? inferred : base;
  }

  private enforceForwardProgress(params: {
    response: StructuredTutorResponse;
    state: {
      grade?: string;
      subject?: string;
      clarificationCount: number;
      flowStep: TutorFlowStep;
    };
    missingFields: TutorMissingField[];
    assumptionsUsed: string[];
    learningMode: 'hints' | 'full_solution';
    locale: 'el' | 'en';
  }): StructuredTutorResponse {
    const { response, state, missingFields, assumptionsUsed, learningMode, locale } = params;
    const text = (response.message || '').toLowerCase();
    const repeatedKnownFieldAsk = this.detectRepeatedKnownFieldAsk(response.message, state) > 0;
    const asksForExerciseAgain = /send the exercise|στείλε την άσκηση|i need the exercise/.test(text);
    const hasProgress =
      Boolean(response.structuredContent.plan) ||
      Boolean(response.structuredContent.steps?.length) ||
      Boolean(response.structuredContent.hints?.length) ||
      Boolean(response.structuredContent.quickCheck);

    if (!repeatedKnownFieldAsk && !asksForExerciseAgain && (hasProgress || state.flowStep === 'CLARIFY')) {
      return response;
    }

    const assumptionLine = assumptionsUsed.length
      ? assumptionsUsed.join(locale === 'el' ? ' ' : ' | ')
      : locale === 'el'
        ? 'Υπόθεση: βασικό σχολικό επίπεδο.'
        : 'Assumption: standard school level.';
    const nextInfo = missingFields.length
      ? locale === 'el'
        ? `Για πιο ακριβή λύση, στείλε στη συνέχεια: ${missingFields.join(', ')}.`
        : `To improve accuracy next, share: ${missingFields.join(', ')}.`
      : locale === 'el'
        ? 'Αν θέλεις, στείλε την ακριβή εκφώνηση για ακόμη πιο στοχευμένη βοήθεια.'
        : 'If you want, send the exact exercise text for even more targeted help.';

    if (learningMode === 'hints') {
      return {
        message:
          locale === 'el'
            ? 'Προχωράμε με υπόθεση και ένα πρακτικό επόμενο βήμα.'
            : 'Let us move forward with assumptions and a practical next step.',
        structuredContent: {
          plan:
            locale === 'el'
              ? '1) Εντοπίζουμε τι ζητείται 2) Επιλέγουμε κανόνα 3) Ελέγχουμε αποτέλεσμα.'
              : '1) Identify what is asked 2) choose the rule 3) verify the result.',
          hints: [
            assumptionLine,
            locale === 'el'
              ? 'Γράψε πρώτα τα δεδομένα της άσκησης σε μία γραμμή.'
              : 'Write the known values from the problem in one line first.',
          ],
          quickCheck: nextInfo,
          recap:
            locale === 'el'
              ? 'Δεν μένουμε σε βρόχο: κάνουμε επόμενο σαφές βήμα τώρα.'
              : 'No loop: we take the next concrete step now.',
        },
      };
    }

    return {
      message:
        locale === 'el'
          ? 'Συνεχίζω με λογικές υποθέσεις και πλήρη καθοδήγηση.'
          : 'I will proceed with reasonable assumptions and full guidance.',
      structuredContent: {
        plan:
          locale === 'el'
            ? 'Λύνουμε με γενική μεθοδολογία και μετά κάνουμε γρήγορο έλεγχο.'
            : 'Solve with a general method and then run a quick check.',
        steps: [
          locale === 'el'
            ? 'Κατέγραψε τα γνωστά δεδομένα και το ζητούμενο.'
            : 'List the known data and the target.',
          locale === 'el'
            ? 'Εφάρμοσε τον βασικό κανόνα ή τύπο βήμα-βήμα.'
            : 'Apply the core rule or formula step by step.',
          locale === 'el'
            ? 'Κάνε έλεγχο αντικατάστασης ή λογικής συνέπειας.'
            : 'Do a substitution or reasoning check.',
        ],
        finalAnswer: nextInfo,
        quickCheck: assumptionLine,
        recap:
          locale === 'el'
            ? 'Προχωρήσαμε με πρόοδο χωρίς να επαναλάβουμε την ίδια ερώτηση.'
            : 'We moved forward without repeating the same question.',
      },
    };
  }

  private buildStructuredTutorFallback(rawContent: string): StructuredTutorResponse {
    const fallbackText =
      "I couldn't format that answer. Please try again with the same question.";

    try {
      const parsed = JSON.parse(rawContent);
      const normalized = this.sanitizeStructuredTutorPayload(parsed);
      const message = normalized.message || this.stringifyStructuredTutorContent(normalized.structuredContent);
      return {
        message: message || fallbackText,
        structuredContent: normalized.structuredContent,
      };
    } catch (error) {
      const plain = rawContent?.trim();
      return {
        message: plain || fallbackText,
        structuredContent: {
          plan: plain || fallbackText,
        },
      };
    }
  }

  private sanitizeStructuredTutorPayload(payload: any): StructuredTutorResponse {
    const sectionSource = payload?.structuredContent || payload || {};
    const structuredContent: StructuredTutorContent = {
      plan: typeof sectionSource.plan === 'string' ? sectionSource.plan : undefined,
      hints: this.toStringArray(sectionSource.hints),
      steps: this.toStringArray(sectionSource.steps),
      finalAnswer:
        typeof sectionSource.finalAnswer === 'string' ? sectionSource.finalAnswer : undefined,
      quickCheck: typeof sectionSource.quickCheck === 'string' ? sectionSource.quickCheck : undefined,
      commonMistakes: this.toStringArray(sectionSource.commonMistakes),
      recap: typeof sectionSource.recap === 'string' ? sectionSource.recap : undefined,
      visualAid: typeof sectionSource.visualAid === 'string' ? sectionSource.visualAid : undefined,
    };

    return {
      message: typeof payload?.message === 'string' ? payload.message : '',
      structuredContent,
    };
  }

  private stringifyStructuredTutorContent(structuredContent: StructuredTutorContent): string {
    const segments: string[] = [];
    if (structuredContent.plan) segments.push(`Plan: ${structuredContent.plan}`);
    if (structuredContent.hints?.length) segments.push(`Hints: ${structuredContent.hints.join(' ')}`);
    if (structuredContent.steps?.length) segments.push(`Steps: ${structuredContent.steps.join(' ')}`);
    if (structuredContent.finalAnswer) segments.push(`Final answer: ${structuredContent.finalAnswer}`);
    if (structuredContent.quickCheck) segments.push(`Quick check: ${structuredContent.quickCheck}`);
    if (structuredContent.commonMistakes?.length) {
      segments.push(`Common mistakes: ${structuredContent.commonMistakes.join(' ')}`);
    }
    if (structuredContent.recap) segments.push(`Recap: ${structuredContent.recap}`);
    return segments.join('\n');
  }

  private async requestStructuredTutorCompletion(
    messages: any[],
    options?: { maxTokens?: number; temperature?: number },
  ): Promise<{
    parsed: StructuredTutorResponse;
    tokenCount: number;
  }> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: options?.temperature ?? 0.8,
      max_tokens: options?.maxTokens ?? 900,
      response_format: { type: 'json_object' },
    });
    const aiResponse = response.choices[0].message.content || '';
    return {
      parsed: this.buildStructuredTutorFallback(aiResponse),
      tokenCount: response.usage?.total_tokens || 0,
    };
  }

  private applyTutorQualityFilter(
    parsed: StructuredTutorResponse,
    locale?: string,
  ): { filtered: StructuredTutorResponse; quality: TutorQualityAssessment } {
    const normalizedMessage = this.normalizeTutorText(parsed.message || '');
    const normalizedStructured = this.normalizeStructuredContent(parsed.structuredContent);
    const filtered: StructuredTutorResponse = {
      message: normalizedMessage.text || this.stringifyStructuredTutorContent(normalizedStructured.content),
      structuredContent: normalizedStructured.content,
    };

    const aggregateText = [
      filtered.message,
      filtered.structuredContent.plan,
      ...(filtered.structuredContent.hints || []),
      ...(filtered.structuredContent.steps || []),
      filtered.structuredContent.finalAnswer,
      filtered.structuredContent.quickCheck,
      ...(filtered.structuredContent.commonMistakes || []),
      filtered.structuredContent.recap,
      filtered.structuredContent.visualAid,
    ]
      .filter(Boolean)
      .join(' ');

    const quality = this.assessTutorTextQuality(aggregateText, locale);
    quality.correctionsApplied +=
      normalizedMessage.correctionsApplied + normalizedStructured.correctionsApplied;
    return { filtered, quality };
  }

  private normalizeStructuredContent(
    structuredContent: StructuredTutorContent,
  ): { content: StructuredTutorContent; correctionsApplied: number } {
    let correctionsApplied = 0;
    const normalize = (value?: string) => {
      if (!value) return undefined;
      const normalized = this.normalizeTutorText(value);
      correctionsApplied += normalized.correctionsApplied;
      return normalized.text;
    };
    const normalizeArray = (value?: string[]) => {
      if (!value?.length) return undefined;
      return value
        .map((entry) => normalize(entry))
        .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
    };

    return {
      content: {
        plan: normalize(structuredContent.plan),
        hints: normalizeArray(structuredContent.hints),
        steps: normalizeArray(structuredContent.steps),
        finalAnswer: normalize(structuredContent.finalAnswer),
        quickCheck: normalize(structuredContent.quickCheck),
        commonMistakes: normalizeArray(structuredContent.commonMistakes),
        recap: normalize(structuredContent.recap),
        visualAid: normalize(structuredContent.visualAid),
      },
      correctionsApplied,
    };
  }

  private normalizeTutorText(text: string): { text: string; correctionsApplied: number } {
    let normalized = text;
    let correctionsApplied = 0;
    for (const rule of this.controlledCorrections) {
      normalized = normalized.replace(rule.pattern, () => {
        correctionsApplied += 1;
        return rule.replacement;
      });
    }
    return { text: normalized, correctionsApplied };
  }

  private assessTutorTextQuality(text: string, locale?: string): TutorQualityAssessment {
    const issues: string[] = [];
    let score = 100;

    const suspiciousMatches = text.match(/\uFFFD|Ã|Î|Ï|Ð|Ñ|â€™|â€œ|â€\x9d|â€”|â€“/g) || [];
    if (suspiciousMatches.length > 0) {
      issues.push('suspicious_encoding');
      score -= 35;
    }

    const mixedTokens = this.extractMixedScriptTokens(text);
    if (mixedTokens.length > 0) {
      issues.push('mixed_script_tokens');
      score -= Math.min(30, mixedTokens.length * 6);
    }

    const tutorExpectsEnglish = !locale || locale === TUTOR_RESPONSE_LOCALE_FOR_QUALITY || /^en/i.test(locale);
    if (tutorExpectsEnglish) {
      const letterCount = (text.match(/\p{L}/gu) || []).length;
      const greekRatio = this.computeGreekCharacterRatio(text);
      if (letterCount >= 40 && greekRatio > 0.4) {
        issues.push('dominant_non_english_script');
        score -= 28;
      }
    }

    const knownBadCount = this.controlledCorrections.reduce((count, rule) => {
      const matches = text.match(rule.pattern);
      return count + (matches ? matches.length : 0);
    }, 0);
    if (knownBadCount > 0) {
      issues.push('known_bad_terms');
      score -= Math.min(20, knownBadCount * 5);
    }

    return {
      score: Math.max(0, score),
      lowQuality: score < 65 || issues.includes('suspicious_encoding'),
      issues,
      correctionsApplied: 0,
    };
  }

  private extractMixedScriptTokens(text: string): string[] {
    const tokens = text.match(/[\p{L}\p{M}\p{Nd}_-]{2,}/gu) || [];
    return tokens.filter((token) => {
      let hasGreek = false;
      let hasLatin = false;
      for (const char of token) {
        if (/\p{Script=Greek}/u.test(char)) hasGreek = true;
        if (/\p{Script=Latin}/u.test(char)) hasLatin = true;
        if (hasGreek && hasLatin) return true;
      }
      return false;
    });
  }

  private computeGreekCharacterRatio(text: string): number {
    const letters = text.match(/\p{L}/gu) || [];
    if (letters.length === 0) return 0;
    const greekLetters = letters.filter((char) => /\p{Script=Greek}/u.test(char));
    return greekLetters.length / letters.length;
  }

  private containsGreekScript(text: string): boolean {
    return /\p{Script=Greek}/u.test(text || '');
  }

  private collectTutorResponseText(response: StructuredTutorResponse): string {
    return [
      response.message,
      response.structuredContent?.plan,
      ...(response.structuredContent?.hints || []),
      ...(response.structuredContent?.steps || []),
      response.structuredContent?.finalAnswer,
      response.structuredContent?.quickCheck,
      ...(response.structuredContent?.commonMistakes || []),
      response.structuredContent?.recap,
      response.structuredContent?.visualAid,
    ]
      .filter(Boolean)
      .join(' ');
  }

  private toStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }
    const normalized = value.filter((entry) => typeof entry === 'string') as string[];
    return normalized.length ? normalized : undefined;
  }

  async generateTutorSpeech(params: {
    userId: string;
    sessionId?: string;
    text: string;
    locale?: string;
    learningMode?: 'hints' | 'full_solution';
    voice?: 'alloy' | 'verse' | 'aria';
    speed?: number;
    structuredContent?: StructuredTutorContent;
  }) {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    const locale = TUTOR_RESPONSE_LOCALE_FOR_QUALITY;
    const isGreek = false;
    const speed = Math.max(0.8, Math.min(1.2, params.speed ?? 1.0));
    const voice = params.voice || 'alloy';
    const sections = this.buildSpeechSections(
      params.text,
      params.structuredContent,
      params.learningMode || 'full_solution',
      isGreek,
    );

    const chunks: TutorSpeechChunk[] = [];

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
      const section = sections[sectionIndex];
      const subChunks = this.splitIntoSpeechChunks(section.text, 320);

      for (let subIndex = 0; subIndex < subChunks.length; subIndex += 1) {
        const normalized = this.prepareSpeechText(subChunks[subIndex], isGreek);
        const audioResponse = await (this.openai.audio.speech as any).create({
          model: 'gpt-4o-mini-tts',
          voice,
          speed,
          response_format: 'mp3',
          input: normalized,
        });

        const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
        chunks.push({
          id: `chunk_${sectionIndex}_${subIndex}`,
          title:
            subChunks.length > 1
              ? `${section.title} ${isGreek ? 'μέρος' : 'part'} ${subIndex + 1}`
              : section.title,
          text: subChunks[subIndex],
          audioBase64: audioBuffer.toString('base64'),
          mimeType: 'audio/mpeg',
          estimatedDurationMs: this.estimateSpeechDurationMs(normalized, speed),
        });
      }
    }

    return {
      ok: true,
      sessionId: params.sessionId || null,
      locale,
      voice,
      speed,
      totalChunks: chunks.length,
      chunks,
    };
  }

  private buildSpeechSections(
    text: string,
    structuredContent: StructuredTutorContent | undefined,
    learningMode: 'hints' | 'full_solution',
    isGreek: boolean,
  ): Array<{ title: string; text: string }> {
    const sections: Array<{ title: string; text: string }> = [];
    const add = (title: string, value?: string) => {
      if (!value || !value.trim()) return;
      sections.push({ title, text: value.trim() });
    };

    const addList = (title: string, values?: string[]) => {
      if (!values?.length) return;
      const rendered = values
        .map((entry, idx) => `${isGreek ? 'Σημείο' : 'Point'} ${idx + 1}: ${entry}`)
        .join('. ');
      sections.push({ title, text: rendered });
    };

    const labels = isGreek
      ? {
          answer: 'Απάντηση',
          plan: 'Πλάνο',
          hints: 'Υποδείξεις',
          steps: 'Βήματα',
          finalAnswer: 'Τελική απάντηση',
          quickCheck: 'Γρήγορος έλεγχος',
          recap: 'Ανακεφαλαίωση',
          commonMistakes: 'Συχνά λάθη',
        }
      : {
          answer: 'Answer',
          plan: 'Plan',
          hints: 'Hints',
          steps: 'Steps',
          finalAnswer: 'Final answer',
          quickCheck: 'Quick check',
          recap: 'Recap',
          commonMistakes: 'Common mistakes',
        };

    if (structuredContent) {
      if (learningMode === 'hints') {
        add(labels.plan, structuredContent.plan);
        addList(labels.hints, structuredContent.hints);
        add(labels.quickCheck, structuredContent.quickCheck);
      } else {
        add(labels.plan, structuredContent.plan);
        addList(labels.steps, structuredContent.steps);
        add(labels.finalAnswer, structuredContent.finalAnswer);
        add(labels.quickCheck, structuredContent.quickCheck);
      }
      addList(labels.commonMistakes, structuredContent.commonMistakes);
      add(labels.recap, structuredContent.recap);
    }

    if (sections.length === 0) {
      add(labels.answer, text);
    }

    return sections;
  }

  private splitIntoSpeechChunks(text: string, maxChars: number): string[] {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return [];
    if (normalized.length <= maxChars) return [normalized];

    const sentences = normalized.split(/(?<=[.!?;·])\s+/).filter(Boolean);
    if (sentences.length <= 1) {
      const parts: string[] = [];
      let cursor = 0;
      while (cursor < normalized.length) {
        parts.push(normalized.slice(cursor, cursor + maxChars));
        cursor += maxChars;
      }
      return parts;
    }

    const chunks: string[] = [];
    let current = '';
    for (const sentence of sentences) {
      const next = current ? `${current} ${sentence}` : sentence;
      if (next.length > maxChars && current) {
        chunks.push(current);
        current = sentence;
      } else {
        current = next;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  private prepareSpeechText(text: string, isGreek: boolean): string {
    let out = text;

    out = out.replace(/\$\$([\s\S]*?)\$\$/g, '$1');
    out = out.replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, '$1');

    out = out.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, (_, numerator: string, denominator: string) =>
      this.formatFractionForSpeech(numerator, denominator, isGreek),
    );
    out = out.replace(/(\d+)\s*\/\s*(\d+)/g, (_, numerator: string, denominator: string) =>
      this.formatFractionForSpeech(numerator, denominator, isGreek),
    );
    out = out.replace(/\\sqrt\{([^{}]+)\}/g, (_, value: string) =>
      isGreek ? `τετραγωνική ρίζα του ${value}` : `square root of ${value}`,
    );
    out = out.replace(/\(([^()]+)\)\s*\^2/g, (_, value: string) =>
      isGreek ? `${value}, όλο στο τετράγωνο` : `${value}, all squared`,
    );
    out = out.replace(
      /([A-Za-zΑ-Ωα-ω0-9]+)\s*\^2\b/g,
      (_, base: string) => (isGreek ? `${base} στο τετράγωνο` : `${base} squared`),
    );
    out = out.replace(
      /([A-Za-zΑ-Ωα-ω0-9]+)\s*\^3\b/g,
      (_, base: string) => (isGreek ? `${base} στον κύβο` : `${base} cubed`),
    );
    out = out.replace(
      /([A-Za-zΑ-Ωα-ω0-9]+)\s*\^([4-9]|[1-9][0-9]+)\b/g,
      (_, base: string, power: string) =>
        isGreek ? `${base} στη δύναμη ${power}` : `${base} to the power of ${power}`,
    );

    out = out.replace(/\bm\/s\b/g, isGreek ? 'μέτρα ανά δευτερόλεπτο' : 'meters per second');
    out = out.replace(/\bN\b/g, isGreek ? 'Νιούτον' : 'newtons');
    out = out.replace(/\bJ\b/g, isGreek ? 'Τζάουλ' : 'joules');

    out = out
      .replace(/[=]/g, isGreek ? ' ισούται με ' : ' equals ')
      .replace(/[×]/g, isGreek ? ' επί ' : ' times ')
      .replace(/[-]/g, isGreek ? ' μείον ' : ' minus ')
      .replace(/[+]/g, isGreek ? ' συν ' : ' plus ');

    out = out.replace(/\s+/g, ' ').trim();
    return out;
  }

  private formatFractionForSpeech(numerator: string, denominator: string, isGreek: boolean) {
    const simpleFractions: Record<string, { en: string; el: string }> = {
      '1/2': { en: 'one half', el: 'ένα δεύτερο' },
      '1/3': { en: 'one third', el: 'ένα τρίτο' },
      '2/3': { en: 'two thirds', el: 'δύο τρίτα' },
      '1/4': { en: 'one quarter', el: 'ένα τέταρτο' },
      '3/4': { en: 'three quarters', el: 'τρία τέταρτα' },
    };
    const key = `${numerator}/${denominator}`;
    const known = simpleFractions[key];
    if (known) return isGreek ? known.el : known.en;
    return isGreek
      ? `${numerator} προς ${denominator}`
      : `${numerator} over ${denominator}`;
  }

  private estimateSpeechDurationMs(text: string, speed: number): number {
    const words = text.split(/\s+/).filter(Boolean).length;
    const baseWordsPerMinute = 145;
    const minutes = words / (baseWordsPerMinute * speed);
    return Math.max(1800, Math.round(minutes * 60 * 1000));
  }

  /**
   * Process voice message - transcribe audio and get AI response
   * Uses OpenAI Whisper for speech-to-text
   */
  async processVoiceMessage(params: {
    userId: string;
    sessionId: string;
    audioFilePath: string;
    context?: {
      yearGroup?: string;
      currentSubject?: string;
      locale?: string;
      preferFastResponses?: boolean;
    };
  }) {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      // Step 1: Transcribe (auto-detect language; tutor reply is always English)
      const audioFile = fs.createReadStream(params.audioFilePath);

      const transcription = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
      });

      const transcribedText = transcription.text;

      if (!transcribedText || transcribedText.trim().length === 0) {
        return {
          transcription: '',
          message: "I couldn't hear that clearly. Could you please try again?",
          sessionId: params.sessionId,
        };
      }

      // Step 2: AI tutor response (English)
      const chatResponse = await this.chat({
        userId: params.userId,
        sessionId: params.sessionId,
        message: transcribedText,
        context: params.context,
      });

      return {
        transcription: transcribedText,
        message: chatResponse.message,
        sessionId: params.sessionId,
      };
    } catch (error) {
      console.error('Error processing voice message:', error);
      
      // Check if it's an OpenAI API error
      if (error instanceof Error && error.message.includes('Invalid file format')) {
        return {
          transcription: '',
          message:
            'Sorry, there was a problem with the audio format. Please try recording again.',
          sessionId: params.sessionId,
        };
      }

      return {
        transcription: '',
        message:
          "I'm having trouble processing your voice message right now. Please try typing instead.",
        sessionId: params.sessionId,
      };
    }
  }

  /**
   * Generate motivational message based on student progress
   */
  async generateMotivationalMessage(userId: string) {
    // Get recent progress
    const recentSessions = await (this.prisma as any).learningSession.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: 5,
      include: {
        sessionItems: true,
      },
    });

    if (recentSessions.length === 0) {
      return {
        message: "Let's get started! Every learning journey begins with a single step.",
        type: 'welcome',
      };
    }

    // Check for streak
    const sessionDates = recentSessions.map((s) =>
      s.startedAt.toISOString().split('T')[0],
    );
    const uniqueDates = new Set(sessionDates);

    if (uniqueDates.size >= 3) {
      return {
        message: `Amazing! You've practiced on ${uniqueDates.size} different days this week! 🌟`,
        type: 'streak',
      };
    }

    // Check recent performance
    const recentItems = recentSessions
      .flatMap((s) => s.sessionItems)
      .filter((item) => item.isCorrect !== null);

    const correctCount = recentItems.filter((item) => item.isCorrect).length;
    const accuracy = recentItems.length > 0 ? (correctCount / recentItems.length) * 100 : 0;

    if (accuracy >= 80) {
      return {
        message: "You're doing brilliantly! Your hard work is really paying off! 🎉",
        type: 'achievement',
      };
    } else if (accuracy >= 60) {
      return {
        message: 'Great progress! Keep up the excellent effort! 💪',
        type: 'encouragement',
      };
    } else {
      return {
        message: "Remember, every mistake is a step towards understanding. You've got this! 🌱",
        type: 'growth_mindset',
      };
    }
  }

  /**
   * Generate reflection prompt for students
   */
  generateReflectionPrompt(yearGroup: string): string {
    const prompts = {
      young: [
        'What was the most fun part of today?',
        'What did you learn today?',
        'What would you like to practice more?',
      ],
      middle: [
        'What felt challenging today?',
        'What strategy helped you the most?',
        'What would you do differently next time?',
      ],
      older: [
        'What was the most difficult concept today and why?',
        'How did you overcome challenges in this session?',
        'What connections can you make to other topics?',
      ],
    };

    const yearNum = parseInt(yearGroup.replace(/\D/g, ''));
    let category = 'middle';

    if (yearNum <= 6) category = 'young';
    else if (yearNum >= 11) category = 'older';

    const categoryPrompts = prompts[category];
    return categoryPrompts[Math.floor(Math.random() * categoryPrompts.length)];
  }

  /**
   * Generic completion method for custom prompts
   */
  async generateCompletion(params: {
    prompt: string;
    maxTokens?: number;
    temperature?: number;
    model?: string;
  }): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: params.model || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert educational content creator specializing in creating high-quality assignments and questions for students.',
          },
          {
            role: 'user',
            content: params.prompt,
          },
        ],
        temperature: params.temperature || 0.7,
        max_tokens: params.maxTokens || 2000,
      });

      return response.choices[0].message.content || '';
    } catch (error) {
      console.error('Error generating AI completion:', error);
      throw new Error('Failed to generate content with AI');
    }
  }
}


