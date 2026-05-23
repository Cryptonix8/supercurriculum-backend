import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import { UpdateTutorVideoConfigDto } from './dto/tutor-video-config.dto';

type RecommendParams = {
  topic: string;
  subject?: string;
  yearGroup?: string;
  locale?: string;
  maxResults?: number;
  previousVideoIds?: string[];
};

@Injectable()
export class YouTubeRecommendationService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async getConfig() {
    const dbConfig = await (this.prisma as any).tutorVideoConfig.findUnique({
      where: { id: 'default' },
    });

    return {
      id: 'default',
      allowlistChannels: this.asStringArray(dbConfig?.allowlistChannels),
      blocklistChannels: this.asStringArray(dbConfig?.blocklistChannels),
      blocklistKeywords: this.asStringArray(dbConfig?.blocklistKeywords),
      preferredKeywords: this.asStringArray(dbConfig?.preferredKeywords, [
        'explained',
        'example',
        'lesson',
        'practice',
        'step by step',
        'tutorial',
      ]),
      minDurationSec: dbConfig?.minDurationSec ?? 180,
      maxDurationSec: dbConfig?.maxDurationSec ?? 900,
      maxResults: dbConfig?.maxResults ?? 5,
      autoSuggestEnabled: dbConfig?.autoSuggestEnabled ?? true,
      requireGreek: dbConfig?.requireGreek ?? false,
      createdAt: dbConfig?.createdAt,
      updatedAt: dbConfig?.updatedAt,
    };
  }

  async updateConfig(dto: UpdateTutorVideoConfigDto) {
    const current = await this.getConfig();
    const payload = {
      allowlistChannels: dto.allowlistChannels ?? current.allowlistChannels,
      blocklistChannels: dto.blocklistChannels ?? current.blocklistChannels,
      blocklistKeywords: dto.blocklistKeywords ?? current.blocklistKeywords,
      preferredKeywords: dto.preferredKeywords ?? current.preferredKeywords,
      minDurationSec: dto.minDurationSec ?? current.minDurationSec,
      maxDurationSec: dto.maxDurationSec ?? current.maxDurationSec,
      maxResults: dto.maxResults ?? current.maxResults,
      autoSuggestEnabled: dto.autoSuggestEnabled ?? current.autoSuggestEnabled,
      requireGreek: dto.requireGreek ?? current.requireGreek,
    };

    if (payload.minDurationSec > payload.maxDurationSec) {
      throw new Error('minDurationSec cannot be greater than maxDurationSec');
    }

    const updated = await (this.prisma as any).tutorVideoConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        ...payload,
      },
      update: payload,
    });

    return {
      ...updated,
      allowlistChannels: this.asStringArray(updated.allowlistChannels),
      blocklistChannels: this.asStringArray(updated.blocklistChannels),
      blocklistKeywords: this.asStringArray(updated.blocklistKeywords),
      preferredKeywords: this.asStringArray(updated.preferredKeywords),
    };
  }

  shouldAutoSuggestVideos(message: string) {
    const hintWords = [
      'show me',
      'steps',
      'step by step',
      'experiment',
      'diagram',
      'graph',
      'geometry',
      'visual',
      'explain',
      'video',
    ];

    const normalized = (message || '').toLowerCase();
    return hintWords.some((word) => normalized.includes(word));
  }

  async recommend(params: RecommendParams) {
    const apiKey = this.config.get<string>('YOUTUBE_API_KEY');
    if (!apiKey) {
      return {
        query: params.topic,
        results: [],
        quality: {
          weak: true,
          reason: 'Video suggestions are temporarily unavailable (YouTube API key not configured).',
        },
      };
    }

    const cfg = await this.getConfig();
    const intentContextTokens = this.extractIntentContextTokens(
      params.topic,
      params.subject,
      params.locale,
    );
    const coreTokens = this.extractCoreTokens(
      [params.subject, params.topic].filter(Boolean).join(' '),
    );
    const clarificationQuestion = this.getClarificationQuestion(
      params.topic,
      params.subject,
      coreTokens,
      intentContextTokens,
    );
    const previousVideoSet = new Set((params.previousVideoIds || []).map((id) => id.trim()));
    const query = this.buildQuery({
      topic: params.topic,
      subject: params.subject,
      yearGroup: params.yearGroup,
      locale: params.locale,
      preferredKeywords: cfg.preferredKeywords,
      intentContextTokens,
    });

    const queries = this.buildSearchQueries({
      topic: params.topic,
      subject: params.subject,
      query,
      intentContextTokens,
      requireGreek: cfg.requireGreek,
    });

    const uniqueMap = new Map<
      string,
      {
        videoId: string;
        title: string;
        description: string;
        channelName: string;
        channelId: string;
        thumbnailUrl: string;
      }
    >();

    for (const searchItem of queries) {
      if (uniqueMap.size >= 30) break;
      const response = await this.ytSearch({
        apiKey,
        query: searchItem.q,
        relevanceLanguage: searchItem.relevanceLanguage,
      });

      for (const item of response) {
        if (!item.videoId) continue;
        if (cfg.blocklistChannels.includes(item.channelId.toLowerCase())) continue;
        if (this.hasBlockedKeyword(item.title, cfg.blocklistKeywords)) continue;

        if (!uniqueMap.has(item.videoId)) {
          uniqueMap.set(item.videoId, item);
        }
      }
    }

    // If the first pass is weak, broaden query coverage while preserving intent.
    if (uniqueMap.size < 3) {
      const fallbackQueries = [
        { q: `${params.topic} explained`, relevanceLanguage: 'en' as string | undefined },
        { q: `${params.topic} GCSE tutorial`, relevanceLanguage: 'en' as string | undefined },
        { q: params.topic, relevanceLanguage: undefined as string | undefined },
      ];

      for (const searchItem of fallbackQueries) {
        if (uniqueMap.size >= 15) break;
        const response = await this.ytSearch({
          apiKey,
          query: searchItem.q,
          relevanceLanguage: searchItem.relevanceLanguage,
        });

        for (const item of response) {
          if (!item.videoId) continue;
          if (cfg.blocklistChannels.includes(item.channelId.toLowerCase())) continue;
          if (this.hasBlockedKeyword(item.title, cfg.blocklistKeywords)) continue;
          if (!uniqueMap.has(item.videoId)) {
            uniqueMap.set(item.videoId, item);
          }
        }
      }
    }

    const candidates = Array.from(uniqueMap.values());
    if (candidates.length === 0) {
      return {
        query,
        results: [],
        quality: {
          weak: true,
          reason: clarificationQuestion
            ? clarificationQuestion
            : 'No suitable videos found. Try a more specific topic (subject + chapter).',
          needsClarification: Boolean(clarificationQuestion),
        },
      };
    }

    const videoIds = candidates.slice(0, 20).map((v) => v.videoId);
    const details = await this.ytVideoDetails(apiKey, videoIds);
    const detailMap = new Map<
      string,
      { videoId: string; channelId: string; durationSeconds: number }
    >(details.map((d) => [d.videoId, d]));

    const minMatchCount = this.getMinMatchCount(coreTokens.length);

    const scored = candidates
      .map((candidate) => {
        const detail = detailMap.get(candidate.videoId);
        const durationSeconds = detail?.durationSeconds ?? 0;
        const channelId = (detail?.channelId || candidate.channelId || '').toLowerCase();
        const searchableText = `${candidate.title} ${candidate.description}`.toLowerCase();
        const matchCount = this.countMatchingTokens(searchableText, coreTokens);
        const intentContextMatchCount = this.countMatchingTokens(
          searchableText,
          intentContextTokens,
        );
        const hasEducationalSignal = this.hasEducationalSignal(searchableText);
        const isPreviouslyShown = previousVideoSet.has(candidate.videoId);

        return {
          ...candidate,
          durationSeconds,
          durationLabel: this.formatDuration(durationSeconds),
          matchCount,
          intentContextMatchCount,
          hasEducationalSignal,
          isPreviouslyShown,
          score: this.score({
            title: candidate.title,
            description: candidate.description,
            channelId,
            durationSeconds,
            matchCount,
            intentContextMatchCount,
            hasEducationalSignal,
            isPreviouslyShown,
            requireGreek: cfg.requireGreek,
            allowlistChannels: cfg.allowlistChannels,
            preferredKeywords: cfg.preferredKeywords,
          }),
        };
      })
      .filter((item) => item.durationSeconds >= 60)
      .filter((item) => item.durationSeconds <= 3600);

    const strictRanked = scored
      .filter((item) => item.matchCount >= minMatchCount)
      .filter((item) =>
        intentContextTokens.length === 0 ? true : item.intentContextMatchCount > 0,
      )
      .filter((item) => item.hasEducationalSignal || item.matchCount >= 2)
      .sort((a, b) => b.score - a.score);

    // Relaxed pass: keep education/context relevance, but avoid returning empty/weak too often.
    const relaxedRanked = scored
      .filter((item) => (coreTokens.length > 0 ? item.matchCount >= 1 : true))
      .filter((item) => item.hasEducationalSignal || item.intentContextMatchCount > 0)
      .sort((a, b) => b.score - a.score);

    const ranked = strictRanked.length >= 3 ? strictRanked : relaxedRanked;

    const preferredDurationPool = ranked.filter(
      (item) =>
        item.durationSeconds >= cfg.minDurationSec &&
        item.durationSeconds <= cfg.maxDurationSec,
    );

    const pool = preferredDurationPool.length >= 3 ? preferredDurationPool : ranked;
    const unseenPool = pool.filter((item) => !item.isPreviouslyShown);
    const finalPool =
      unseenPool.length >= 3 ? unseenPool : [...unseenPool, ...pool.filter((item) => item.isPreviouslyShown)];
    const maxResults = Math.min(params.maxResults ?? cfg.maxResults, 5);
    const results = finalPool.slice(0, maxResults).map((item) => ({
      videoId: item.videoId,
      title: item.title,
      channelName: item.channelName,
      durationSeconds: item.durationSeconds,
      durationLabel: item.durationLabel,
      thumbnailUrl: item.thumbnailUrl,
      url: `https://www.youtube.com/watch?v=${item.videoId}`,
      embedUrl: `https://www.youtube.com/embed/${item.videoId}`,
    }));

    const weak = results.length < 3;
    return {
      query,
      results,
      quality: weak
        ? {
            weak: true,
            reason: clarificationQuestion
              ? clarificationQuestion
              : 'Results are limited. Add year group and a more specific chapter or topic.',
            needsClarification: Boolean(clarificationQuestion),
          }
        : { weak: false },
    };
  }

  async saveFeedback(params: {
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
    return (this.prisma as any).tutorVideoFeedback.create({
      data: {
        userId: params.userId,
        sessionId: params.sessionId,
        videoId: params.videoId,
        query: params.query,
        clicked: params.clicked ?? false,
        helpful: params.helpful,
        reported: params.reported ?? false,
        reason: params.reason,
        metadata: params.metadata || {},
      },
    });
  }

  private asStringArray(value: unknown, fallback: string[] = []) {
    if (!value) return fallback;
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry).trim()).filter(Boolean);
    }
    return fallback;
  }

  private buildQuery(params: {
    topic: string;
    subject?: string;
    yearGroup?: string;
    locale?: string;
    preferredKeywords: string[];
    intentContextTokens?: string[];
  }) {
    const language = 'explained';
    const extras = params.preferredKeywords.slice(0, 2).join(' ');
    const context = (params.intentContextTokens || []).slice(0, 2).join(' ');
    return [params.subject, params.topic, params.yearGroup, language, extras, context]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async ytSearch(params: {
    apiKey: string;
    query: string;
    relevanceLanguage?: string;
  }) {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        type: 'video',
        maxResults: 25,
        q: params.query,
        safeSearch: 'strict',
        regionCode: 'GB',
        relevanceLanguage: params.relevanceLanguage,
        key: params.apiKey,
      },
    });

    return (response.data.items || []).map((item: any) => ({
      videoId: item.id?.videoId as string,
      title: item.snippet?.title || '',
      description: item.snippet?.description || '',
      channelName: item.snippet?.channelTitle || '',
      channelId: item.snippet?.channelId || '',
      thumbnailUrl:
        item.snippet?.thumbnails?.high?.url ||
        item.snippet?.thumbnails?.medium?.url ||
        item.snippet?.thumbnails?.default?.url ||
        '',
    }));
  }

  private async ytVideoDetails(
    apiKey: string,
    videoIds: string[],
  ): Promise<Array<{ videoId: string; channelId: string; durationSeconds: number }>> {
    if (videoIds.length === 0) return [];

    const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        part: 'contentDetails,snippet',
        id: videoIds.join(','),
        key: apiKey,
      },
    });

    return (response.data.items || []).map((item: any) => ({
      videoId: item.id as string,
      channelId: item.snippet?.channelId || '',
      durationSeconds: this.isoDurationToSeconds(item.contentDetails?.duration),
    }));
  }

  private isoDurationToSeconds(isoDuration?: string) {
    if (!isoDuration) return 0;
    const match = isoDuration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!match) return 0;
    const hours = match[1] ? parseInt(match[1], 10) : 0;
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const seconds = match[3] ? parseInt(match[3], 10) : 0;
    return hours * 3600 + minutes * 60 + seconds;
  }

  private formatDuration(totalSeconds: number) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  private hasBlockedKeyword(title: string, blocklistKeywords: string[]) {
    const text = title.toLowerCase();
    const defaults = ['#shorts', 'shorts'];
    const allKeywords = [...defaults, ...blocklistKeywords.map((k) => k.toLowerCase())];
    return allKeywords.some((keyword) => keyword && text.includes(keyword));
  }

  private score(params: {
    title: string;
    description: string;
    channelId: string;
    durationSeconds: number;
    matchCount: number;
    intentContextMatchCount: number;
    hasEducationalSignal: boolean;
    isPreviouslyShown: boolean;
    requireGreek: boolean;
    allowlistChannels: string[];
    preferredKeywords: string[];
  }) {
    let score = 0;
    const lowerTitle = params.title.toLowerCase();
    const lowerDesc = params.description.toLowerCase();

    score += params.matchCount * 6;
    if (params.matchCount === 0) score -= 30;
    score += params.intentContextMatchCount * 8;

    if (params.hasEducationalSignal) score += 4;
    else score -= 8;

    if (params.isPreviouslyShown) score -= 6;

    if (params.durationSeconds >= 180 && params.durationSeconds <= 900) score += 5;
    else if (params.durationSeconds >= 120 && params.durationSeconds <= 1200) score += 1;
    else score -= 4;

    if (params.allowlistChannels.map((c) => c.toLowerCase()).includes(params.channelId)) {
      score += 10;
    }

    for (const keyword of params.preferredKeywords) {
      const k = keyword.toLowerCase();
      if (lowerTitle.includes(k) || lowerDesc.includes(k)) score += 1;
    }

    return score;
  }

  private extractCoreTokens(text: string) {
    const stopwords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'to',
      'for',
      'of',
      'in',
      'on',
      'how',
      'what',
      'why',
      'is',
      'are',
      'i',
      'me',
      'my',
      'you',
      'with',
      'explain',
      'explained',
      'example',
      'examples',
      'exercise',
      'exercises',
      'step',
      'steps',
      'by',
      'μου',
      'με',
      'σε',
      'το',
      'τη',
      'την',
      'των',
      'και',
      'να',
      'τι',
      'πως',
      'πώς',
      'για',
      'είναι',
      'δείξε',
      'βήμα',
      'μαθημα',
      'μάθημα',
      'εξηγηση',
      'εξήγηση',
      'παραδειγμα',
      'παράδειγμα',
      'ασκησεις',
      'ασκήσεις',
      'λυση',
      'λύση',
    ]);

    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
      .filter((token) => !stopwords.has(token));
  }

  private countMatchingTokens(text: string, tokens: string[]) {
    if (!tokens.length) return 0;
    const normalizedText = this.normalizeText(text);
    let count = 0;
    for (const token of tokens) {
      const normalizedToken = this.normalizeText(token);
      if (!normalizedToken) continue;
      if (normalizedText.includes(normalizedToken)) {
        count += 1;
        continue;
      }
      // Lightweight fuzzy fallback for singular/plural/tonos variants.
      const tokenRoot = normalizedToken.length >= 5 ? normalizedToken.slice(0, 5) : normalizedToken;
      if (tokenRoot && normalizedText.includes(tokenRoot)) count += 1;
    }
    return count;
  }

  private getMinMatchCount(totalTokens: number) {
    if (totalTokens >= 5) return 2;
    if (totalTokens >= 2) return 1;
    return 0;
  }

  private hasEducationalSignal(text: string) {
    const educationalSignals = [
      'lesson',
      'tutorial',
      'explained',
      'practice',
      'exam',
      'gcse',
      'ks3',
      'ks2',
      'math',
      'maths',
      'english',
      'science',
      'physics',
      'chemistry',
      'biology',
      'history',
      'geography',
      'education',
      'teacher',
      'school',
      'curriculum',
    ];
    return educationalSignals.some((signal) => text.includes(signal));
  }

  private extractIntentContextTokens(topic: string, subject?: string, _locale?: string) {
    const text = this.normalizeText(`${topic || ''} ${subject || ''}`);
    const tokens: string[] = [];

    const languageIntent = [
      'conjunction',
      'verb',
      'noun',
      'adjective',
      'pronoun',
      'article',
      'grammar',
      'spelling',
      'syntax',
    ];

    const mathIntent = [
      'fraction',
      'equation',
      'geometry',
      'derivative',
      'limit',
      'histogram',
      'frequency table',
    ];

    if (languageIntent.some((k) => text.includes(this.normalizeText(k)))) {
      tokens.push('grammar', 'language', 'parts of speech', 'english');
    }

    if (mathIntent.some((k) => text.includes(this.normalizeText(k)))) {
      tokens.push('maths', 'exercises', 'step by step');
    }

    if (tokens.length === 0) {
      tokens.push('school lesson');
    }

    return tokens;
  }

  private normalizeText(value: string) {
    return (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private buildSearchQueries(params: {
    topic: string;
    subject?: string;
    query: string;
    intentContextTokens: string[];
    requireGreek: boolean;
  }) {
    const concept = this.extractCoreTokens(params.topic).slice(0, 2).join(' ');
    const hasGrammarIntent = params.intentContextTokens.some((t) =>
      this.normalizeText(t).includes('grammar'),
    );

    const queries = [
      { q: params.query, relevanceLanguage: 'en' as string | undefined },
      { q: params.query, relevanceLanguage: undefined as string | undefined },
      {
        q: [params.subject, params.topic].filter(Boolean).join(' '),
        relevanceLanguage: 'en' as string | undefined,
      },
    ];

    if (hasGrammarIntent && concept) {
      queries.push(
        { q: `${concept} grammar lesson`, relevanceLanguage: 'en' as string | undefined },
        { q: `${concept} parts of speech English`, relevanceLanguage: 'en' as string | undefined },
        { q: `${concept} English language`, relevanceLanguage: 'en' as string | undefined },
      );
    }

    return queries;
  }

  private getClarificationQuestion(
    topic: string,
    subject: string | undefined,
    coreTokens: string[],
    intentContextTokens: string[],
  ) {
    if (subject) return null;

    const normalized = this.normalizeText(topic);
    const ambiguousTermPrompts: Array<{ terms: string[]; question: string }> = [
      {
        terms: ['connector', 'conjunction'],
        question:
          'Do you mean a grammar conjunction/linking word, or a web link/URL?',
      },
      {
        terms: ['limit', 'limits'],
        question:
          'Do you mean limits in calculus/maths, or “limits” in a general sense? Which subject?',
      },
      {
        terms: ['table', 'tables'],
        question:
          'Do you mean data/statistics tables, or spreadsheets?',
      },
      {
        terms: ['function', 'functions'],
        question:
          'Do you mean a mathematical function (definition, graph, operations)? Which topic?',
      },
    ];

    for (const item of ambiguousTermPrompts) {
      if (item.terms.some((term) => normalized.includes(term))) {
        return item.question;
      }
    }

    // Generic clarification for short/underspecified prompts.
    if (coreTokens.length <= 1 && intentContextTokens.length === 0) {
      return 'Please tell me subject and topic so I can suggest relevant videos.';
    }

    return null;
  }
}

