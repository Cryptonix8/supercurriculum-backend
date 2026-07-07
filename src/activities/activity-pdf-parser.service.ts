import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { resolveFromBackendRoot } from '../project-paths';
import OpenAI from 'openai';
import { ActivityType, Band } from '@prisma/client';

export interface ExtractedActivity {
  title: string;
  description: string;
  instructions: string;
  activityType: ActivityType;
  difficulty: Band;
  estimatedMinutes: number;
  subjectName: string;
  skillName: string;
  resources?: {
    links?: Array<{ title: string; url: string }>;
    materials?: string[];
    /** Images (base64 data URLs) for formulas, graphs, diagrams - used when GPT-4 Vision extraction is enabled */
    images?: Array<{ dataUrl?: string; caption?: string; latex?: string }>;
  };
}

@Injectable()
export class ActivityPdfParserService {
  private readonly logger = new Logger(ActivityPdfParserService.name);
  private openai: OpenAI | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  /**
   * Normalize activity type to a valid ActivityType enum value
   * Maps invalid types (like "ANALYSIS") to valid ones
   */
  private normalizeActivityType(activityType: string): ActivityType {
    const upperType = activityType.toUpperCase().trim();
    
    // Direct mapping for valid types
    const validTypes: ActivityType[] = [
      'READING',
      'WRITING',
      'LISTENING',
      'WATCHING',
      'RESEARCHING',
      'STUDENT_LED',
      'CREATIVE',
      'QUICK_QUIZ',
      'SCAFFOLDED_EXERCISE',
      'SUPERCURRICULUM_PROJECT',
      'EXAM_STYLE',
      'RETRIEVAL_PRACTICE',
      'INTERLEAVED_PRACTICE',
    ];

    // Check if it's already valid
    if (validTypes.includes(upperType as ActivityType)) {
      return upperType as ActivityType;
    }

    // Map invalid types to valid ones
    const typeMapping: Record<string, ActivityType> = {
      'ANALYSIS': 'RESEARCHING',
      'ANALYZE': 'RESEARCHING',
      'ANALYZING': 'RESEARCHING',
      'EXERCISE': 'SCAFFOLDED_EXERCISE',
      'EXERCISES': 'SCAFFOLDED_EXERCISE',
      'PRACTICE': 'RETRIEVAL_PRACTICE',
      'QUIZ': 'QUICK_QUIZ',
      'QUIZZES': 'QUICK_QUIZ',
      'PROJECT': 'SUPERCURRICULUM_PROJECT',
      'PROJECTS': 'SUPERCURRICULUM_PROJECT',
      'READ': 'READING',
      'WRITE': 'WRITING',
      'LISTEN': 'LISTENING',
      'WATCH': 'WATCHING',
      'RESEARCH': 'RESEARCHING',
      'STUDENT_LED': 'STUDENT_LED',
      'CREATIVE': 'CREATIVE',
      'EXAM': 'EXAM_STYLE',
      'TEST': 'EXAM_STYLE',
    };

    // Try to find a mapping
    if (typeMapping[upperType]) {
      this.logger.warn(`Mapped invalid activity type "${activityType}" to "${typeMapping[upperType]}"`);
      return typeMapping[upperType];
    }

    // Default fallback
    this.logger.warn(`Unknown activity type "${activityType}", defaulting to "RESEARCHING"`);
    return 'RESEARCHING';
  }

  /**
   * Extract text from a PDF file buffer
   */
  async extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
    try {
      // pdf-parse exports PDFParse as a class
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PDFParse } = eval('require')('pdf-parse');
      const parser = new PDFParse({ data: pdfBuffer });
      await parser.load();
      const result = await parser.getText();
      
      // Combine text from all pages
      const fullText = result.pages
        .map((page: { text: string; num: number }) => page.text)
        .join('\n\n');
      
      return fullText;
    } catch (error: any) {
      this.logger.error(`Error extracting text from PDF: ${error.message}`);
      throw new BadRequestException(`Failed to parse PDF: ${error.message}`);
    }
  }

  /**
   * Render PDF pages as PNG images using pdf-parse getScreenshot.
   * Used for GPT-4 Vision extraction of problems with formulas, graphs, and diagrams.
   */
  async extractScreenshotsFromPdf(
    pdfBuffer: Buffer,
    options?: { maxPages?: number; scale?: number; first?: number; last?: number },
  ): Promise<Array<{ pageNum: number; dataUrl: string; buffer: Buffer }>> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PDFParse } = eval('require')('pdf-parse');
      const parser = new PDFParse({ data: pdfBuffer });
      await parser.load();

      const maxPages = options?.maxPages ?? 20;
      const scale = options?.scale ?? 1.2;
      const result = await parser.getScreenshot({
        first: options?.first ?? 1,
        last: options?.last ?? maxPages,
        scale,
        imageDataUrl: true,
        imageBuffer: true,
      });
      await parser.destroy();

      const pages: Array<{ pageNum: number; dataUrl: string; buffer: Buffer }> = [];
      for (let i = 0; i < (result.pages?.length ?? 0); i++) {
        const p = result.pages[i] as { num?: number; data?: Buffer; dataUrl?: string };
        if (p?.dataUrl && p?.data) {
          pages.push({
            pageNum: p.num ?? i + 1,
            dataUrl: p.dataUrl,
            buffer: p.data,
          });
        }
      }
      this.logger.log(`Rendered ${pages.length} PDF page(s) as PNG for Vision extraction`);
      return pages;
    } catch (error: any) {
      this.logger.error(`Error rendering PDF to images: ${error.message}`);
      throw new BadRequestException(`Failed to render PDF: ${error.message}`);
    }
  }

  /**
   * Extract activities from PDF using GPT-4 Vision.
   * Captures formulas (LaTeX), graphs, and diagrams for mathematics and other visual subjects.
   */
  async extractActivitiesWithVisionFromPdf(
    pdfBuffer: Buffer,
    yearNumber: number,
    options?: { maxPages?: number; structureText?: string; locale?: string },
  ): Promise<ExtractedActivity[]> {
    if (!this.openai) {
      throw new BadRequestException('OpenAI API key not configured');
    }

    const maxPages = options?.maxPages ?? 10;
    const localeInstruction =
      '\n\nLANGUAGE: Write all extracted activity text (title, instructions, captions) in clear English, even if the PDF uses another language.';

    this.logger.log(`Extracting activities with GPT-5.5 Vision from PDF (max ${maxPages} pages)...`);

    const pages = await this.extractScreenshotsFromPdf(pdfBuffer, {
      maxPages,
      scale: 1.2,
    });

    if (pages.length === 0) {
      this.logger.warn('No pages rendered from PDF');
      return [];
    }

    const allActivities: ExtractedActivity[] = [];
    const pagesPerCall = 2; // Process 2 pages per Vision call to balance quality and cost

    for (let i = 0; i < pages.length; i += pagesPerCall) {
      const batch = pages.slice(i, i + pagesPerCall);
      const pageDataUrls = batch.map((p) => p.dataUrl);

      const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail: 'high' } }> = [
        {
          type: 'text',
          text: `Extract educational activities from these curriculum PDF pages (Year ${yearNumber}). 
${options?.structureText ? `STRUCTURE REFERENCE:\n${options.structureText.substring(0, 2000)}\n\n` : ''}
CRITICAL FOR MATHEMATICS:
- Write ALL formulas, equations, and expressions in LaTeX using $$...$$ (display) or $...$ (inline)
- Examples: $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$ or $y = mx + c$
- For graphs, diagrams, geometric figures: describe them in instructions and set "hasVisualContent": true
- Include the visual context in instructions so students know what to refer to on the page

For each activity with formulas/graphs/diagrams, include:
- "instructions": Full problem text with LaTeX for formulas
- "resources.images": [{"caption": "Diagram/graph from page"}]
${localeInstruction}

Return JSON: { "activities": [ { "title", "description", "instructions", "activityType", "difficulty", "estimatedMinutes", "subjectName", "skillName", "resources": { "links": [], "materials": [], "images": [{"caption": "..."}] } } ] }
ActivityType: READING, WRITING, RESEARCHING, SCAFFOLDED_EXERCISE, QUICK_QUIZ, EXAM_STYLE, RETRIEVAL_PRACTICE, etc.
Difficulty: NEEDS_SUPPORT, DEVELOPING, SECURE
subjectName: e.g. Mathematics, English, Science
Extract ALL problems and activities visible. Return ONLY valid JSON.`,
        },
        ...pageDataUrls.map((dataUrl) => ({
          type: 'image_url' as const,
          image_url: { url: dataUrl, detail: 'high' as const },
        })),
      ];

      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-5.5',
          messages: [
            {
              role: 'system',
              content:
                'You extract educational activities from curriculum PDF images. For mathematics: always use LaTeX for formulas. Include images array for problems with graphs/diagrams. Return valid JSON with "activities" array only.',
            },
            { role: 'user', content },
          ],
          temperature: 0.2,
          max_tokens: 4096,
          response_format: { type: 'json_object' },
        });

        const text = response.choices[0]?.message?.content;
        if (!text) continue;

        const parsed = JSON.parse(text);
        const activities = parsed.activities ?? (Array.isArray(parsed) ? parsed : []);
        if (!Array.isArray(activities)) continue;

        for (const a of activities) {
          const normalized: ExtractedActivity = {
            ...a,
            activityType: this.normalizeActivityType(a.activityType || 'SCAFFOLDED_EXERCISE'),
            resources: {
              ...(a.resources || {}),
              images: [
                ...(a.resources?.images || []),
                ...batch.map((p) => ({
                  dataUrl: p.dataUrl,
                  caption: a.resources?.images?.[0]?.caption || `Curriculum page ${p.pageNum}`,
                })),
              ],
            },
          };
          allActivities.push(normalized);
        }
        this.logger.log(`Vision extracted ${activities.length} activities from pages ${batch.map((p) => p.pageNum).join(',')}`);
      } catch (err: any) {
        this.logger.error(`Vision extraction failed for batch: ${err.message}`);
      }
    }

    this.logger.log(`Total Vision-extracted activities: ${allActivities.length}`);
    return allActivities;
  }

  /**
   * Extract year number from filename (e.g., "year5.pdf" -> 5)
   */
  extractYearFromFilename(filename: string): number | null {
    const match = filename.match(/year[_\s-]?(\d+)/i);
    if (match) {
      return parseInt(match[1], 10);
    }
    return null;
  }

  /**
   * Find curriculum PDF (Primary or Secondary) based on year number
   */
  private async findCurriculumPdf(yearNumber: number): Promise<Buffer | null> {
    try {
      const fs = require('fs');
      const path = require('path');
      const base = this.config.get<string>('DOCS_BASE_PATH') || 'docs';
      const enFolder = this.config.get<string>('DOCS_EN_FOLDER') || this.config.get<string>('DOCS_EN_LOCALE_SUBFOLDER') || 'el-EN';
      const docsDir = path.join(resolveFromBackendRoot(base), enFolder);
      
      // Years 5-6 are Primary, Years 7-13 are Secondary
      const curriculumType = yearNumber <= 6 ? 'primary' : 'secondary';
      
      // Try different filename variations
      const possibleNames = [
        `${curriculumType}.pdf`,
        `${curriculumType.charAt(0).toUpperCase() + curriculumType.slice(1)}.pdf`,
        `British National Curriculum ${curriculumType.charAt(0).toUpperCase() + curriculumType.slice(1)}.pdf`,
        `National Curriculum ${curriculumType.charAt(0).toUpperCase() + curriculumType.slice(1)}.pdf`,
      ];
      
      for (const fileName of possibleNames) {
        const filePath = path.join(docsDir, fileName);
        if (fs.existsSync(filePath)) {
          this.logger.log(`Found curriculum PDF: ${fileName} for Year ${yearNumber}`);
          return fs.readFileSync(filePath);
        }
      }
      
      this.logger.warn(`No curriculum PDF found for Year ${yearNumber}. Tried: ${possibleNames.join(', ')}`);
      return null;
    } catch (error: any) {
      this.logger.error(`Error finding curriculum PDF: ${error.message}`);
      return null;
    }
  }

  /**
   * Use AI to extract activities from PDF text
   * Uses Year PDF for structure and Primary/Secondary curriculum PDF for content
   */
  /**
   * Search web for Years 12-13 content (since curriculum PDFs only cover Years 1-11)
   */
  private async searchWebForYear12And13(yearPdfText: string, yearNumber: number): Promise<string> {
    try {
      // Extract key topics/subjects from Year PDF to search for
      const topics = this.extractTopicsFromYearPdf(yearPdfText);
      
      // Use OpenAI to search and summarize current British National Curriculum content for Years 12-13
      // This acts as a web search proxy - in production, you could integrate with SerpAPI, Google Custom Search, etc.
      const searchPrompt = `You are searching the web for current British National Curriculum content for Year ${yearNumber} (A-Level/Year 12-13).

Based on the Year ${yearNumber} PDF structure provided, search for and provide current curriculum content covering:
${topics.map(t => `- ${t}`).join('\n')}

Provide comprehensive, current information about:
1. Subject content and topics for Year ${yearNumber}
2. Learning objectives and outcomes
3. Key skills and competencies
4. Assessment requirements
5. Current standards and guidelines

Focus on official sources like:
- UK government education websites
- Ofqual and exam board websites
- British National Curriculum official documents
- Educational standards for A-Level/Year 12-13

Return a comprehensive summary of the curriculum content that can be used to generate educational activities.`;

      if (!this.openai) {
        throw new Error('OpenAI not configured');
      }

      const response = await this.openai.chat.completions.create({
        model: 'gpt-5.5',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at finding and summarizing current British National Curriculum content. Use your knowledge of current UK education standards and curriculum requirements.',
          },
          {
            role: 'user',
            content: searchPrompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      });

      const webContent = response.choices[0]?.message?.content || '';
      this.logger.log(`Generated web content for Year ${yearNumber} (${webContent.length} characters)`);
      
      return webContent;
    } catch (error: any) {
      this.logger.error(`Error searching web for Year ${yearNumber}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract key topics/subjects from Year PDF for web search
   */
  private extractTopicsFromYearPdf(yearPdfText: string): string[] {
    // Extract first 2000 characters to identify topics
    const sample = yearPdfText.substring(0, 2000);
    const topics: string[] = [];
    
    // Look for common subject names
    const subjectPatterns = [
      /(?:subject|topic|area)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
      /(English|Maths|Mathematics|Science|History|Geography|Art|Music|PE|Physical Education|Computing|Computer Science|Languages|French|Spanish|German)/gi,
    ];
    
    for (const pattern of subjectPatterns) {
      const matches = sample.matchAll(pattern);
      for (const match of matches) {
        const topic = match[1] || match[0];
        if (topic && !topics.includes(topic)) {
          topics.push(topic);
        }
      }
    }
    
    // If no topics found, return default list
    if (topics.length === 0) {
      return ['English', 'Mathematics', 'Science', 'History', 'Geography', 'Art', 'Music', 'Physical Education'];
    }
    
    return topics.slice(0, 10); // Limit to 10 topics
  }

  async extractActivitiesFromPdf(
    yearPdfText: string, 
    curriculumPdfText: string | null,
    yearNumber: number,
    webContext: string | null = null
  ): Promise<ExtractedActivity[]> {
    if (!this.openai) {
      throw new BadRequestException('OpenAI API key not configured');
    }

      // Split Year PDF into smaller chunks to process more content and extract more activities
      // Smaller chunks = more processing passes = more activities extracted
      const yearChunks = this.splitTextIntoChunks(yearPdfText, 8000); // Reduced from 15000 to process more chunks
      this.logger.log(`Processing Year ${yearNumber} PDF in ${yearChunks.length} chunks for structure`);
      
      // Use Year PDF chunks for processing
      const chunks = yearChunks;

    const allActivities: ExtractedActivity[] = [];

    for (let i = 0; i < chunks.length; i++) {
      this.logger.log(`Processing chunk ${i + 1}/${chunks.length} with AI...`);
      
      // Build prompt with both structure (Year PDF) and content (Curriculum PDF)
      // Use current chunk from Year PDF for structure (not just first chunk)
      let structureContext = '';
      if (yearPdfText && yearPdfText.length > 0) {
        // Use current chunk from Year PDF to show structure for this section
        const currentYearChunk = chunks[i] || chunks[0];
        structureContext = `\n\nSTRUCTURE TEMPLATE (from Year ${yearNumber} PDF chunk ${i + 1}/${chunks.length} - use this format/style):
${currentYearChunk.substring(0, 7000)}`; // Increased from 5000 to 7000 to provide more structure context
      }

      let contentContext = '';
      if (curriculumPdfText && curriculumPdfText.length > 0) {
        const curriculumChunks = this.splitTextIntoChunks(curriculumPdfText, 8000); // Reduced from 10000 to process more chunks
        // Use corresponding curriculum chunk (or cycle through if more year chunks than curriculum chunks)
        const curriculumChunkIndex = i % curriculumChunks.length;
        contentContext = `\n\nCURRICULUM CONTENT (from British National Curriculum ${yearNumber <= 6 ? 'Primary' : 'Secondary'} PDF chunk ${curriculumChunkIndex + 1}/${curriculumChunks.length} - use this material):
${curriculumChunks[curriculumChunkIndex].substring(0, 7000)}`; // Increased from 5000 to 7000 to provide more content per chunk
      }

      // Web context (currently not implemented - placeholder for future web search integration)
      // Determine source type based on year
      const isYear12Or13 = yearNumber >= 12 && yearNumber <= 13;
      const hasWebContext = webContext && webContext.trim().length > 0;
      const hasCurriculumPdf = curriculumPdfText && curriculumPdfText.trim().length > 0;

      let prompt: string;
      
      if (isYear12Or13 && hasWebContext) {
        // Years 12-13: Use web search as PRIMARY SOURCE
        prompt = `You are an expert at creating educational activities based on the British National Curriculum.

SOURCE POLICY (must follow):
1) For Years 12-13, web search content is the PRIMARY source of truth (curriculum PDFs only cover Years 1-11).
2) Use the WEB_CONTEXT provided below as the PRIMARY SOURCE for curriculum content.
3) Use the STRUCTURE/STYLE from the Year PDF template (PRIMARY SOURCE for formatting).
4) Include web sources in resources.links array: [{"title": "Source Title", "url": "https://..."}]
5) Activities must align with current British National Curriculum standards for A-Level/Year 12-13.

You will receive:
1. STRUCTURE TEMPLATE: Shows the format, style, and presentation approach for activities (from Year ${yearNumber} PDF - PRIMARY SOURCE for structure)
2. WEB CONTENT: Current British National Curriculum material for Year ${yearNumber} (from web search - PRIMARY SOURCE for content)

Your task: Create activities that:
- Follow the STRUCTURE/STYLE from the Year PDF template (PRIMARY SOURCE for structure)
- Use the CONTENT/MATERIAL from the web search results (PRIMARY SOURCE for content)
- Align with current British National Curriculum standards for Year ${yearNumber}

${structureContext}

WEB_CONTEXT (PRIMARY SOURCE for Years 12-13 - curriculum PDFs only cover Years 1-11):
${webContext}`;
      } else if (!isYear12Or13 && hasCurriculumPdf) {
        // Years 5-11: Use curriculum PDFs as PRIMARY SOURCE
        prompt = `You are an expert at creating educational activities based on the British National Curriculum.

SOURCE POLICY (must follow):
1) Use the provided PDFs as the PRIMARY source of truth.
2) If the PDFs are missing details or appear outdated for the topic, you MAY use the internet as a SECONDARY source to enrich/verify/update.
3) WEB USAGE RULE: You may only use web information if a WEB_CONTEXT section is provided below. If WEB_CONTEXT is empty or missing, do not use the internet and do not include any web links.
4) When you use the internet (only if WEB_CONTEXT provided), you MUST:
   - keep it consistent with the PDFs (do not contradict unless PDFs are outdated),
   - include the web source in resources.links (title + URL),
   - briefly mark which parts came from the web.
5) If the PDFs already contain enough information, do NOT use the internet.
6) Never use "general knowledge" if neither PDFs nor web support it—state "insufficient info".

You will receive:
1. STRUCTURE TEMPLATE: Shows the format, style, and presentation approach for activities (from Year ${yearNumber} PDF - PRIMARY SOURCE)
2. CURRICULUM CONTENT: The actual British National Curriculum material to use (from Primary/Secondary curriculum PDF - PRIMARY SOURCE)

Your task: Create activities that:
- Follow the STRUCTURE/STYLE from the Year PDF template (PRIMARY SOURCE)
- Use the CONTENT/MATERIAL from the British National Curriculum PDF (PRIMARY SOURCE)
- If PDFs are incomplete or outdated, use internet as SECONDARY source (with citations)
- Align with the curriculum standards and learning objectives from the PDFs

${structureContext}
${contentContext}

${hasWebContext ? `\n\nWEB_CONTEXT (secondary source - only use if PDFs are incomplete/outdated):\n${webContext}` : '\n\nWEB_CONTEXT: (not provided - do not use internet sources)'}`;
      } else {
        // Error case
        throw new BadRequestException(
          `Invalid configuration: Year ${yearNumber} requires ${isYear12Or13 ? 'web context' : 'curriculum PDF'} but it is missing.`
        );
      }

      // Append common instructions to the prompt
      prompt += `

CRITICAL: Extract COMPREHENSIVE activities for weekly planning. A full year needs HUNDREDS of activities across all subjects and topics.

Extract and return a JSON array of activities. Each activity should have:
{
  "title": "Clear, engaging activity title",
  "description": "Brief description of what the activity involves",
  "instructions": "Step-by-step instructions for completing the activity",
  "activityType": "One of: READING, WRITING, LISTENING, WATCHING, RESEARCHING, STUDENT_LED, CREATIVE, QUICK_QUIZ, SCAFFOLDED_EXERCISE, SUPERCURRICULUM_PROJECT, EXAM_STYLE, RETRIEVAL_PRACTICE, INTERLEAVED_PRACTICE",
  "difficulty": "One of: NEEDS_SUPPORT, DEVELOPING, SECURE",
  "estimatedMinutes": 15-60 (estimate based on activity complexity),
  "subjectName": "Subject name (e.g., English, Maths, Science, History, Geography, Art, Music, PE, Computing)",
  "skillName": "Skill name (e.g., reading, writing, listening, speaking, problem-solving, analysis, creativity, research)",
  "resources": {
    "links": [{"title": "Source Title", "url": "https://..."}],
    "materials": []
  }
}

CRITICAL EXTRACTION RULES:
1. Extract ACTIVITIES FOR EVERY TOPIC, SUBJECT, AND SKILL mentioned in the content
2. For each subject, create multiple activities covering different aspects (reading, writing, problem-solving, etc.)
3. For each topic, create at least 3-5 different activities (various types: exercises, projects, quizzes, etc.)
4. Extract activities for ALL subjects mentioned: English, Maths, Science, History, Geography, Art, Music, PE, Computing, Languages, etc.
5. Create activities at different difficulty levels (NEEDS_SUPPORT, DEVELOPING, SECURE) for the same topic
6. Extract BOTH curriculum activities AND supercurriculum activities (extended learning)
7. Include activities for different learning styles (reading, writing, creative, hands-on, etc.)
8. Extract activities for different time durations (15 min quick tasks, 30 min exercises, 45-60 min projects)
9. Use the PRIMARY SOURCE as specified above (PDFs for Years 5-11, Web for Years 12-13)
10. Use the STRUCTURE/STYLE from the Year PDF template (how activities are formatted and presented)
11. Each activity should be distinct and complete
12. Subject names should match subjects mentioned in the content
13. Skill names should be specific and match skills from the content
14. Instructions should be clear and actionable, following the style from the Year PDF
15. Return ONLY valid JSON array, no other text

TARGET: Extract 20-50+ activities from this chunk alone. Be comprehensive and thorough.

Return a JSON object with this structure:
{
  "activities": [
    // ... array of activities (aim for 20-50+ per chunk)
  ]
}`;

      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-5.5',
          messages: [
            {
              role: 'system',
              content: 'You are an expert at extracting comprehensive educational activities from curriculum documents. Extract MANY activities (20-50+ per chunk) covering all subjects, topics, and skills. Always return valid JSON with an "activities" array.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 8000, // Increased from default to allow more activities in response
          response_format: { type: 'json_object' },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          this.logger.warn(`No content returned from AI for chunk ${i + 1}`);
          continue;
        }

        // Parse JSON response
        let parsed: any;
        try {
          parsed = JSON.parse(content);
          // Handle both {activities: [...]} and [...] formats
          const activities = parsed.activities || (Array.isArray(parsed) ? parsed : []);
          if (Array.isArray(activities)) {
            // Normalize activity types before adding to allActivities
            const normalizedActivities = activities.map((activity: any) => ({
              ...activity,
              activityType: this.normalizeActivityType(activity.activityType || 'RESEARCHING'),
            }));
            allActivities.push(...normalizedActivities);
          } else {
            this.logger.warn(`Activities is not an array in chunk ${i + 1}`);
          }
        } catch (parseError) {
          this.logger.error(`Failed to parse AI response for chunk ${i + 1}: ${parseError.message}`);
          this.logger.debug(`AI response: ${content.substring(0, 500)}`);
        }
      } catch (error: any) {
        this.logger.error(`Error processing chunk ${i + 1} with AI: ${error.message}`);
      }
    }

    this.logger.log(`Extracted ${allActivities.length} activities from Year ${yearNumber} PDF`);
    return allActivities;
  }

  /**
   * Split text into chunks for processing
   */
  private splitTextIntoChunks(text: string, maxChunkSize: number): string[] {
    const chunks: string[] = [];
    let currentChunk = '';

    const lines = text.split('\n');

    for (const line of lines) {
      if (currentChunk.length + line.length > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = line + '\n';
      } else {
        currentChunk += line + '\n';
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Generate activities from PDF and save to database.
   * @param options.useVision - When true, use GPT-4 Vision on curriculum PDF for math formulas, graphs, diagrams
   * @param options.locale - e.g. 'el-GR' for Greek curriculum
   */
  async generateActivitiesFromPdf(
    pdfBuffer: Buffer,
    filename: string,
    options?: { useVision?: boolean; locale?: string },
  ): Promise<{ generated: number; skipped: number; errors: string[] }> {
    const errors: string[] = [];
    let generated = 0;
    let skipped = 0;

    try {
      // Extract year from filename
      const yearNumber = this.extractYearFromFilename(filename);
      if (!yearNumber || yearNumber < 5 || yearNumber > 13) {
        throw new BadRequestException(
          `Invalid year number. Filename should be in format "year5.pdf" through "year13.pdf". Got: ${filename}`
        );
      }

      // Get or create year group (ensure it exists and is active)
      const yearName = `year_${yearNumber}`;
      const yearDisplayName = `Year ${yearNumber}`;
      
      let yearGroup = await this.prisma.yearGroup.findFirst({
        where: {
          OR: [
            { name: yearName },
            { displayName: yearDisplayName },
          ],
        },
      });

      if (!yearGroup) {
        // Create the year group if it doesn't exist
        this.logger.log(`Year group for ${yearDisplayName} not found, creating it...`);
        yearGroup = await this.prisma.yearGroup.create({
          data: {
            name: yearName,
            displayName: yearDisplayName,
            orderIndex: yearNumber,
            isActive: true,
          },
        });
        this.logger.log(`Created year group: ${yearDisplayName}`);
      } else if (!yearGroup.isActive) {
        // Reactivate if it exists but is inactive
        this.logger.log(`Reactivating year group: ${yearDisplayName}`);
        yearGroup = await this.prisma.yearGroup.update({
          where: { id: yearGroup.id },
          data: { isActive: true },
        });
      }

      // Extract text from Year PDF (structure template)
      this.logger.log(`Extracting text from Year PDF: ${filename}`);
      const yearPdfText = await this.extractTextFromPdf(pdfBuffer);

      if (!yearPdfText || yearPdfText.trim().length < 100) {
        throw new BadRequestException('Year PDF appears to be empty or could not extract text');
      }

      // For Years 5-11: Use curriculum PDFs (PRIMARY SOURCE)
      // For Years 12-13: Use web search (PRIMARY SOURCE) since curriculum PDFs only cover Years 1-11
      let curriculumPdfText: string | null = null;
      let webContext: string | null = null;

      let visionExtractedActivities: ExtractedActivity[] | null = null;

      if (yearNumber >= 5 && yearNumber <= 11) {
        // Years 5-11: Use curriculum PDFs
        this.logger.log(`Looking for curriculum PDF (Primary/Secondary) for Year ${yearNumber}...`);
        const curriculumPdfBuffer = await this.findCurriculumPdf(yearNumber);
        
        if (curriculumPdfBuffer) {
          if (options?.useVision) {
            // Use GPT-4 Vision for math formulas, graphs, diagrams
            this.logger.log(`Using GPT-5.5 Vision for curriculum extraction (formulas, graphs, diagrams)`);
            const visionActivities = await this.extractActivitiesWithVisionFromPdf(curriculumPdfBuffer, yearNumber, {
              maxPages: 10,
              structureText: yearPdfText,
              locale: options?.locale,
            });
            if (visionActivities.length > 0) {
              this.logger.log(`Vision extracted ${visionActivities.length} activities; saving to database`);
              visionExtractedActivities = visionActivities;
            } else {
              this.logger.warn(`Vision returned no activities; falling back to text extraction`);
            }
          }
          if (!visionExtractedActivities) {
            curriculumPdfText = await this.extractTextFromPdf(curriculumPdfBuffer);
            this.logger.log(`Found and extracted curriculum PDF content (${curriculumPdfText.length} characters)`);
          }
        } else {
          // Fail fast: curriculum PDF is required for Years 5-11
          throw new BadRequestException(
            `Curriculum PDF (${yearNumber <= 6 ? 'primary' : 'secondary'}.pdf) not found in docs folder. ` +
            `Curriculum PDF is required as PRIMARY SOURCE for Years 5-11. Please ensure the curriculum PDF exists before generating activities.`
          );
        }
      } else if (yearNumber >= 12 && yearNumber <= 13) {
        // Years 12-13: Use web search instead of curriculum PDFs
        this.logger.log(`Year ${yearNumber} detected - using web search as PRIMARY SOURCE (curriculum PDFs only cover Years 1-11)`);
        webContext = await this.searchWebForYear12And13(yearPdfText, yearNumber);
        if (!webContext) {
          throw new BadRequestException(
            `Failed to retrieve web content for Year ${yearNumber}. Web search is required as PRIMARY SOURCE for Years 12-13.`
          );
        }
        this.logger.log(`Retrieved web content for Year ${yearNumber} (${webContext.length} characters)`);
      }

      // Extract activities: use Vision result if available, else text-based AI extraction
      let extractedActivities: ExtractedActivity[];
      if (visionExtractedActivities && visionExtractedActivities.length > 0) {
        extractedActivities = visionExtractedActivities;
      } else {
        this.logger.log(`Extracting activities using AI (text)...`);
        extractedActivities = await this.extractActivitiesFromPdf(yearPdfText, curriculumPdfText, yearNumber, webContext);
      }

      if (extractedActivities.length === 0) {
        this.logger.warn('No activities extracted from PDF');
        return { generated: 0, skipped: 0, errors: ['No activities could be extracted from PDF'] };
      }

      // Process each activity
      for (const activityData of extractedActivities) {
        try {
          // Normalise identifiers so lookups & creates use the same values
          const normalizedSubjectName = activityData.subjectName
            .toLowerCase()
            .replace(/\s+/g, '_');
          const normalizedSkillName = activityData.skillName
            .toLowerCase()
            .replace(/\s+/g, '_');

          // Find or create subject for this year group
          let subject = await this.prisma.subject.findFirst({
            where: {
              yearGroupId: yearGroup.id,
              // Use the same normalized name that we persist to avoid unique constraint violations
              name: normalizedSubjectName,
            },
          });

          if (!subject) {
            // Get max order index for this year group
            const maxOrder = await this.prisma.subject.findFirst({
              where: { yearGroupId: yearGroup.id },
              orderBy: { orderIndex: 'desc' },
            });

            // Create subject if it doesn't exist
            subject = await this.prisma.subject.create({
              data: {
                yearGroupId: yearGroup.id,
                name: normalizedSubjectName,
                displayName: activityData.subjectName,
                description: `Subject for Year ${yearNumber}`,
                orderIndex: (maxOrder?.orderIndex || 0) + 1,
                isActive: true,
              },
            });
            this.logger.log(`Created new subject: ${subject.displayName} for Year ${yearNumber}`);
          }

          // Find or create skill
          let skill = await this.prisma.skill.findFirst({
            where: {
              subjectId: subject.id,
              // Use the same normalized name that we persist to avoid unique constraint violations
              name: normalizedSkillName,
            },
          });

          if (!skill) {
            // Get max order index for this subject
            const maxOrder = await this.prisma.skill.findFirst({
              where: { subjectId: subject.id },
              orderBy: { orderIndex: 'desc' },
            });

            skill = await this.prisma.skill.create({
              data: {
                subjectId: subject.id,
                name: normalizedSkillName,
                displayName: activityData.skillName,
                description: `Skill for ${subject.displayName}`,
                orderIndex: (maxOrder?.orderIndex || 0) + 1,
              },
            });
            this.logger.log(`Created new skill: ${skill.displayName} for ${subject.displayName}`);
          }

          // Check if activity already exists (by title and subject/skill)
          // For automated updates: Update existing activities if PDFs are re-uploaded
          const existing = await this.prisma.activity.findFirst({
            where: {
              subjectId: subject.id,
              skillId: skill.id,
              title: activityData.title,
            },
          });

          // Normalize activity type to ensure it's valid
          const normalizedActivityType = this.normalizeActivityType(
            activityData.activityType as string
          );

          if (existing) {
            // Update existing activity with new content from PDF (automated update support)
            await this.prisma.activity.update({
              where: { id: existing.id },
              data: {
                description: activityData.description,
                instructions: activityData.instructions,
                activityType: normalizedActivityType,
                difficulty: activityData.difficulty,
                estimatedMinutes: activityData.estimatedMinutes || 20,
                resources: activityData.resources || {},
                isActive: true,
              },
            });
            skipped++; // Count as skipped but updated
            this.logger.log(`Updated existing activity: ${activityData.title}`);
            continue;
          }

          // Create new activity
          await this.prisma.activity.create({
            data: {
              subjectId: subject.id,
              skillId: skill.id,
              title: activityData.title,
              description: activityData.description,
              instructions: activityData.instructions,
              activityType: normalizedActivityType,
              difficulty: activityData.difficulty,
              estimatedMinutes: activityData.estimatedMinutes || 20,
              resources: activityData.resources || {},
              isActive: true,
            },
          });

          generated++;
        } catch (error: any) {
          const errorMsg = `Error creating activity "${activityData.title}": ${error.message}`;
          this.logger.error(errorMsg);
          errors.push(errorMsg);
          skipped++;
        }
      }

      this.logger.log(
        `Activity generation complete: ${generated} created, ${skipped} skipped, ${errors.length} errors`
      );

      return { generated, skipped, errors };
    } catch (error: any) {
      this.logger.error(`Error generating activities from PDF: ${error.message}`);
      throw new BadRequestException(`Failed to generate activities: ${error.message}`);
    }
  }

}
