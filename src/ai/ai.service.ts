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
  TutorStateSnapshot,
} from './tutor-conversation-state.service';
import {
  buildTutorLanguageInstruction,
  buildTutorLowQualityFallback,
  buildTutorRepairInstruction,
  extractSessionResolvedLanguage,
  mergeSessionLanguageTransition,
  resolveTutorResponseLanguage,
  resolveWhisperLanguage,
  spokenLanguageToLocale,
  TutorSpokenLanguage,
} from './tutor-language.util';
import { prepareTutorSpeechText } from './tutor-speech-text.util';
import {
  OPENAI_CHAT_MODEL,
  OPENAI_TTS_MODELS,
  OPENAI_WHISPER_MODEL,
  OPENAI_WHISPER_FALLBACK_MODEL,
  OpenAiTtsVoice,
  resolveOpenAiTtsVoice,
} from './ai-models';

/** Bump when tutor system prompt or structured response contract in `chat()` changes materially (simulation baselines / regression tracking). */
export const AI_TUTOR_PROMPT_VERSION = '2026.05.06';

/** Locale tag used when running quality checks on Greek tutor responses. */
const TUTOR_RESPONSE_LOCALE_FOR_QUALITY = 'el-GR';

interface StructuredTutorContent {
  plan?: string;
  hints?: string[];
  steps?: string[];
  examples?: string[];
  exercise?: string;
  exerciseAnswers?: string;
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
    const prompt = `Είσαι έμπειρος και υποστηρικτικός εκπαιδευτικός. Δίνεις ανατροφοδότηση σε μαθητή/μαθήτρια ${params.yearGroup} για εργασία ${params.subject} (${params.skill}).

Οδηγίες εργασίας:
${params.taskInstructions}

Αναμενόμενο αποτέλεσμα:
${params.expectedOutcome}

Απάντηση μαθητή/μαθήτριας:
${params.studentSubmission}

Τρέχον επίπεδο μαθητή/μαθήτριας: ${params.band}

Επέστρεψε ΑΠΟΚΛΕΙΣΤΙΚΑ έγκυρο JSON με το ακόλουθο σχήμα:
{
  "strength": "Ένα συγκεκριμένο δυνατό σημείο",
  "nextStep": "Ένα σαφές επόμενο βήμα βελτίωσης",
  "modelAnswer": "Σύντομο πρότυπο απάντησης (2-3 προτάσεις)"
}

Γράψε μόνο στα Ελληνικά, με φιλικό και ενθαρρυντικό τόνο, κατάλληλο για ηλικία μαθητή/μαθήτριας.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: OPENAI_CHAT_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a supportive educational AI assistant. Always respond in clear monotonic Greek for student-facing feedback.',
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
        strength: 'Έκανες καλή προσπάθεια σε αυτή την εργασία.',
        nextStep: 'Στο επόμενο βήμα προσπάθησε να δώσεις περισσότερες λεπτομέρειες και παραδείγματα.',
        modelAnswer: 'Μια δυνατή απάντηση περιλαμβάνει συγκεκριμένα παραδείγματα και καθαρές εξηγήσεις.',
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
      fastResponse?: boolean;
      preferFastResponses?: boolean;
    };
  }) {
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

    const tutorLanguage = this.resolveTutorLanguageForRequest({
      context: params.context,
      state,
      messageText: params.message,
    });
    const responseLanguage = tutorLanguage.resolved;
    const isGreekLocale = tutorLanguage.isGreekResponse;
    const responseLocaleCode = tutorLanguage.responseLocale;
    const fieldLabels: Record<TutorMissingField, string> = {
      grade: isGreekLocale ? 'τάξη' : 'grade',
      subject: isGreekLocale ? 'μάθημα' : 'subject/topic',
    };

    const effectiveContext = {
      ...(params.context || {}),
      grade: params.context?.grade || state.grade,
      currentSubject: params.context?.currentSubject || state.subject,
      chapter: params.context?.chapter || state.chapter,
      learningMode: params.context?.learningMode || (state.learningMode as 'hints' | 'full_solution'),
    };

    const learningMode = effectiveContext.learningMode || 'full_solution';
    const fastResponse =
      params.context?.fastResponse === true || params.context?.explainDepth === 'short';
    const preferFastResponses = params.context?.preferFastResponses !== false && !fastResponse ? true : fastResponse;
    const explainDepth = fastResponse ? 'short' : params.context?.explainDepth || 'normal';

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
          ? isGreekLocale
            ? 'Πριν συνεχίσουμε, πες μου την τάξη σου (π.χ. Δ\' Δημοτικού ή Α\' Γυμνασίου) για να προσαρμόσω τα βήματα.'
            : 'Before we continue, tell me your grade/class so I can adjust the steps.'
          : isGreekLocale
            ? 'Για να προχωρήσουμε σωστά, ποιο μάθημα ή θέμα δουλεύεις τώρα;'
            : 'To continue accurately, what subject or topic are you working on now?';

      const clarificationResponse: StructuredTutorResponse = {
        message: question,
        structuredContent: {
          plan: isGreekLocale
            ? 'Χρειάζομαι ένα στοιχείο ακόμη για να δώσω ακριβή καθοδήγηση.'
            : 'I need one more detail to give accurate guidance.',
          hints: [
            isGreekLocale
              ? `Γράψε μόνο ${fieldLabels[field]} και συνεχίζουμε άμεσα.`
              : `Share only your ${fieldLabels[field]} and we continue immediately.`,
          ],
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
          lastTransition: mergeSessionLanguageTransition(
            {
              fromStep: state.flowStep,
              toStep: 'CLARIFY',
              missingFields,
              askedField: field,
              forcedProgress: false,
              mode: 'clarify_once',
              at: new Date().toISOString(),
            },
            responseLanguage,
          ),
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
        resolvedLanguage: responseLanguage,
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

    const languageInstruction = buildTutorLanguageInstruction(responseLanguage);

    // Build system prompt with context
    const systemPrompt = `Είσαι έμπειρος εκπαιδευτικός AI και προσωπικός δάσκαλος που βοηθάει έναν/μία μαθητή/μαθήτρια ${effectiveContext?.yearGroup || ''} να μαθαίνει αποτελεσματικά.

Ο στόχος σου δεν είναι μόνο να απαντάς ερωτήσεις, αλλά να διδάσκεις τους μαθητές ώστε να κατανοούν πραγματικά το θέμα.

==================================================
ΓΕΝΙΚΉ ΣΥΜΠΕΡΙΦΟΡΆ
==================================================

- Να είσαι φιλικός, ενθαρρυντικός και υποστηρικτικός.
- Χρησιμοποίησε θετική ενίσχυση.
- Προσάρμοσε τις εξηγήσεις στην ηλικία και την τάξη του/της μαθητή/μαθήτριας.
- Εξήγησε έννοιες πριν δώσεις απαντήσεις όποτε αυτό είναι κατάλληλο.
- Καθοδήγησε τους μαθητές να σκέφτονται αντί να τους δίνεις απλώς απαντήσεις.
- Μην κάνεις ποτέ τους μαθητές να νιώθουν άσχημα για λάθη.
- Διατήρησε νοοτροπία ανάπτυξης.

==================================================
ΕΚΠΑΙΔΕΥΤΙΚΉ ΡΟΉ
==================================================

Ακολούθησε πάντα αυτή τη διδακτική διαδικασία:

1. Κατανόησε το αίτημα του/της μαθητή/μαθήτριας.
2. Κάνε ΜΙΑ ερώτηση διευκρίνισης μόνο αν είναι απολύτως απαραίτητο.
3. Κάνε λογικές υποθέσεις αν λείπουν πληροφορίες.
4. Εξήγησε την έννοια.
5. Δώσε παραδείγματα.
6. Καθοδήγησε τον/την μαθητή/μαθήτρια.
7. Παρέχε εξάσκηση.
8. Έλεγξε την κατανόηση.
9. Συνόψισε τα βασικά σημεία μάθησης.

Μην κάνεις ποτέ ξανά την ίδια ερώτηση διευκρίνισης.

Μην ρωτάς επανειλημμένως για:
- τάξη
- έτος
- μάθημα
- κεφάλαιο

αν υπάρχουν ήδη στο παρεχόμενο πλαίσιο.

==================================================
ΔΗΜΙΟΥΡΓΊΑ ΜΑΘΉΜΑΤΟΣ
==================================================

Αν ο/η μαθητής/μαθήτρια ζητήσει να μάθει ένα θέμα, δίδαξε ένα μάθημα.

Το μάθημα πρέπει να περιλαμβάνει:

1. Εισαγωγή στο θέμα
2. Καθαρή εξήγηση
3. Σημαντικοί κανόνες
4. Παραδείγματα από την πραγματική ζωή
5. Συνηθισμένα λάθη
6. Άσκηση εξάσκησης
7. Κλειδί απαντήσεων ή γρήγορος έλεγχος
8. Ανακεφαλαίωση μιας πρότασης

Εκτός αν ο/η μαθητής/μαθήτρια ζητήσει συγκεκριμένα σύντομη απάντηση, ΜΗΝ περιορίσεις τα μαθήματα σε μερικές μόνο προτάσεις.

==================================================
ΑΣΚΉΣΕΙΣ ΚΑΙ ΛΊΣΤΕΣ ΠΡΟΒΛΗΜΆΤΩΝ
==================================================

Όποτε είναι κατάλληλο, δημιούργησε ασκήσεις.

Δυνατοί τύποι ασκήσεων:

- Συμπλήρωση κενών
- Πολλαπλής επιλογής
- Σωστό / Λάθος
- Αντιστοίχιση
- Σύντομη απάντηση
- Προβλήματα λέξεων
- Εξάσκηση ομιλίας
- Εξάσκηση γραφής

Η δυσκολία πρέπει να αντιστοιχεί σε:

${effectiveContext?.grade || effectiveContext?.yearGroup || "επίπεδο μαθητή/μαθήτριας"}

==================================================
ΚΡΊΣΙΜΟΙ ΚΑΝΌΝΕΣ ΑΝΤΙΣΤΟΊΧΙΣΗΣ ΠΕΔΊΩΝ
==================================================

Όταν ο/η μαθητής/μαθήτρια ζητάει λίστα προβλημάτων (π.χ. "δώσε μου 5 ασκήσεις",
"δώσε μου 6 ερωτήσεις εξάσκησης", "δείξε μου μερικές ασκήσεις"):

- Βάλε ΚΆΘΕ πρόβλημα ως ξεχωριστό string στον πίνακα "steps".
- ΜΗΝ βάλεις όλα τα προβλήματα σε ένα μόνο string "exercise".
- ΜΗΝ αρνηθείς ή πεις ότι δεν μπορείς να παρέχεις προβλήματα.
- ΜΗΝ ζητάς διευκρίνιση — δημιούργησε τα προβλήματα αμέσως.
- Κάθε στοιχείο στα "steps" πρέπει να είναι ένα πλήρες, αυτόνομο πρόβλημα.
- Πάντα συμπλήρωσε τον ζητούμενο αριθμό προβλημάτων στα "steps".

Παράδειγμα για "δώσε μου 3 μαθηματικά προβλήματα":

"steps": ["1. Υπολόγισε το 45 + 37.", "2. Πόσο κάνει 8 × 9?", "3. Απλοποίησε το 12/16."],
"quickCheck": "Δοκίμασε το καθένα και θα ελέγξω τις απαντήσεις σου!"

Όταν ο/η μαθητής/μαθήτρια ζητάει εξήγηση ή μάθημα:
- Χρησιμοποίησε "plan" για τον σκελετό.
- Χρησιμοποίησε "steps" για τη βήμα-βήμα εξήγηση.
- Χρησιμοποίησε "exercise" για μια ενιαία ερώτηση εξάσκησης.
- Χρησιμοποίησε "examples" για επεξεργασμένα παραδείγματα.
- Χρησιμοποίησε "recap" για την ανακεφαλαίωση.

==================================================
ΤΡΌΠΟΣ ΥΠΟΔΕΊΞΕΩΝ
==================================================

Αν ο τρόπος μάθησης είναι "hints":

- Μην αποκαλύπτεις ποτέ αμέσως την πλήρη απάντηση.
- Δώσε προοδευτικά πιο ισχυρές υποδείξεις.
- Ενθάρρυνε τον/την μαθητή/μαθήτρια να λύσει ανεξάρτητα.

==================================================
ΤΡΌΠΟΣ ΠΛΉΡΟΥΣ ΛΎΣΗΣ
==================================================

Αν ο τρόπος μάθησης είναι "full_solution":

Πάντα παρέχε:

- εξήγηση
- εργασία
- λογική
- τελική απάντηση
- γρήγορος έλεγχος

==================================================
ΜΑΘΗΜΑΤΙΚΆ
==================================================

Χρησιμοποίησε LaTeX για ΌΛΕΣ τις μαθηματικές εκφράσεις.

Εξισώσεις εμφάνισης:

$$εξίσωση$$

Ενσωματωμένες εξισώσεις:

$εξίσωση$

Παραδείγματα:

$$x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$$

$$2x+5=13$$

$$\\sqrt{16}=4$$

Πάντα:

- εξήγησε τι λύνεται
- δείξε έναν μετασχηματισμό ανά γραμμή
- απέφυγε να παρακάμπτεις βήματα
- ανάδειξε την τελική απάντηση
- συμπεριέλαβε γρήγορη επαλήθευση όποτε είναι δυνατό

==================================================
ΔΙΑΓΡΆΜΜΑΤΑ
==================================================

Όταν τα διαγράμματα θα βελτίωναν την κατανόηση:

Παρέχε διαγράμματα βασισμένα σε κείμενο.

Παραδείγματα:

- γεωμετρία
- γραφήματα
- κυκλώματα
- χάρτες
- χρονολόγια
- διαγράμματα ροής

Για γραφήματα συμπεριέλαβε:

- πίνακα τιμών
- τομές με τους άξονες
- σημείο στροφής
- σχήμα γραφήματος

Στη συνέχεια εξήγησε:

"Από το διάγραμμα βλέπουμε..."

==================================================
ΦΥΣΙΚΈΣ ΕΠΙΣΤΉΜΕΣ
==================================================

Για ερωτήσεις φυσικών επιστημών:

Εξήγησε:

- γιατί
- πώς
- εφαρμογή στην πραγματική ζωή

Απέφυγε να δίνεις μόνο ορισμούς.

==================================================
ΓΛΏΣΣΕΣ
==================================================

Για εκμάθηση γλωσσών:

Συμπεριέλαβε:

- παραδείγματα
- συμβουλές προφοράς (αν χρειάζεται)
- γραμματική εξήγηση
- λεξιλόγιο
- σύντομη άσκηση

==================================================
ΠΡΟΓΡΑΜΜΑΤΙΣΜΌΣ
==================================================

Κατά τη διδασκαλία προγραμματισμού:

Εξήγησε:

- έννοια
- σύνταξη
- κώδικα
- αναμενόμενο αποτέλεσμα
- συνηθισμένα λάθη

Μην παρέχεις ποτέ κώδικα χωρίς εξήγηση εκτός αν ζητηθεί ρητά.

==================================================
YOUTUBE / ΕΞΩΤΕΡΙΚΟΊ ΣΎΝΔΕΣΜΟΙ
==================================================

ΣΗΜΑΝΤΙΚΌ:

Μην εφευρίσκεις ποτέ:

- YouTube URLs
- URLs ιστοτόπων
- συνδέσμους άρθρων
- συνδέσμους βίντεο

Αν η εφαρμογή έχει παράσχει αποτελέσματα αναζήτησης:

Προτείνε ΜΌΝΟ αυτά τα αποτελέσματα.

Αν δεν έχουν παρασχεθεί αποτελέσματα αναζήτησης:

Πες:

"Δεν μπορώ να αναζητήσω απευθείας στο YouTube, αλλά συνιστώ να αναζητήσεις: '<προτεινόμενο ερώτημα αναζήτησης>'."

Μην κατασκευάζεις ποτέ URLs.

==================================================
ΤΡΈΧΟΝ ΠΛΑΊΣΙΟ
==================================================

Μάθημα:
${effectiveContext?.currentSubject || 'Γενικό'}

Κεφάλαιο:
${effectiveContext?.chapter || 'Δεν ορίστηκε'}

Τάξη:
${effectiveContext?.grade || effectiveContext?.yearGroup || 'Δεν ορίστηκε'}

Τρόπος Μάθησης:
${learningMode}

Βάθος Εξήγησης:
${explainDepth}

Τρέχουσα Ροή:
${state.flowStep}

Γνωστά Ελλείποντα Πεδία:
${missingFields.join(', ') || 'κανένα'}

Υποθέσεις:
${assumptionsUsed.join(' | ') || 'κανένα'}

${EDUCATION_LEVELS_FOR_AI}

==================================================
ΜΟΡΦΉ ΑΠΌΚΡΙΣΗΣ
==================================================

Επέστρεψε ΜΌΝΟ έγκυρο JSON.

ΜΗΝ επιστρέφεις markdown.

ΜΗΝ επιστρέφεις code fences.

Επέστρεψε ακριβώς αυτή τη δομή:

{
  "message": "...",
  "structuredContent": {
    "plan": "...",
    "hints": [],
    "steps": [],
    "examples": [],
    "exercise": "...",
    "exerciseAnswers": "...",
    "finalAnswer": "...",
    "quickCheck": "...",
    "commonMistakes": [],
    "recap": "...",
    "visualAid": "..."
  }
}

Κανόνες:

- message είναι ΥΠΟΧΡΕΩΤΙΚΌ.
- structuredContent είναι ΥΠΟΧΡΕΩΤΙΚΌ.
- Όλα τα άλλα πεδία είναι προαιρετικά.
- Συμπλήρωσε όσο περισσότερα πεδία είναι χρήσιμα.
- Χρησιμοποίησε examples όποτε διδάσκεις.
- Συμπεριέλαβε ασκήσεις όποτε διδάσκεις.
- Συμπεριέλαβε recap όποτε είναι δυνατό.
- Συμπεριέλαβε commonMistakes όποτε είναι κατάλληλο.
- Αν ο τρόπος μάθησης είναι "hints", δώσε προτεραιότητα στις υποδείξεις έναντι των απαντήσεων.
- Αν ο τρόπος μάθησης είναι "full_solution", συμπεριέλαβε πλήρη εργασία.
- Σεβάσου το βάθος εξήγησης:
  - short: συμπυκνωμένο και ελάχιστο
  - normal: ισορροπημένη λεπτομέρεια
  - detailed: πλουσιότερη εξήγηση με επιπλέον λογική

${languageInstruction}`;

    // Build messages array
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add history — strip any message that contains mixed script so a previous
    // bad transcription never anchors GPT to respond in the wrong language.
    history.forEach((msg) => {
      if (msg.role === 'USER') {
        messages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'ASSISTANT') {
        messages.push({ role: 'assistant', content: msg.content });
      }
    });

    // Add current message
    messages.push({ role: 'user', content: params.message });

    try {
      let { parsed, tokenCount } = await this.requestStructuredTutorCompletion(messages, {
        // Fast mode: raised to 3000 so that six math problems with
        // working are never silently truncated mid-JSON.
        // Normal mode: 3500 for detailed explanations.
        maxTokens: preferFastResponses ? 3000 : 3500,
        temperature: preferFastResponses ? 0.7 : 0.8,
      });
      let { filtered, quality } = this.applyTutorQualityFilter(parsed, responseLocaleCode);

      if (!fastResponse && quality.lowQuality) {
        const repairInstruction = buildTutorRepairInstruction(responseLanguage);
        const retry = await this.requestStructuredTutorCompletion([
          ...messages,
          { role: 'user', content: repairInstruction },
        ], {
          maxTokens: preferFastResponses ? 3000 : 3500,
          temperature: 0.5,
        });
        tokenCount += retry.tokenCount;
        const retried = this.applyTutorQualityFilter(retry.parsed, responseLocaleCode);
        filtered = retried.filtered;
        quality = retried.quality;
      }

      if (!fastResponse && quality.lowQuality) {
        const lowQualityFallback = buildTutorLowQualityFallback(responseLanguage);
        filtered = {
          message: lowQualityFallback.message,
          structuredContent: {
            plan: lowQualityFallback.plan,
            hints: lowQualityFallback.hints,
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
          lastTransition: mergeSessionLanguageTransition(
            {
              fromStep: state.flowStep,
              toStep: nextFlowStep,
              missingFields,
              assumptionsUsed,
              mode: 'model_response',
              at: new Date().toISOString(),
            },
            responseLanguage,
          ),
        },
      });

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

      const config = await this.youtubeRecommendations.getConfig();
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
              prompt: isGreekLocale
                ? 'Θέλεις 2-3 σύντομα βίντεο πάνω σε αυτό;'
                : 'Want a couple of short videos on this?',
              topicHint: params.message,
            }
          : { shouldSuggest: false },
        resolvedLanguage: responseLanguage,
      };
    } catch (error) {
      console.error('Error in AI chat:', error);
      const fallback = isGreekLocale
        ? 'Έχω πρόβλημα σύνδεσης αυτή τη στιγμή. Δοκιμάστε ξανά σε λίγο.'
        : 'I am having trouble connecting right now. Please try again in a moment.';
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
        resolvedLanguage: responseLanguage,
      };
    }
  }

