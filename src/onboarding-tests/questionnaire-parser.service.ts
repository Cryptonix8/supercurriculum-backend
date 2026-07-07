import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as mammoth from 'mammoth';
import * as fs from 'fs';
import * as path from 'path';
import { resolveFromBackendRoot } from '../project-paths';

/**
 * Service to parse questionnaire and diagnostic test files
 * Extracts year-specific questions from the provided PDF files
 * Uses OpenAI API for intelligent question and option detection
 */
@Injectable()
export class QuestionnaireParserService {
  private readonly logger = new Logger(QuestionnaireParserService.name);
  private questionnairesCache: Map<string, any> = new Map();
  private diagnosticTestsCache: Map<string, any> = new Map();
  private openai: OpenAI | null = null;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
      this.logger.log('OpenAI API initialized for intelligent PDF parsing');
    } else {
      this.logger.warn('OPENAI_API_KEY not found. Will use pattern-based parsing only.');
    }
  }

  /**
   * Resolve docs directory from config. en-GB -> DOCS_BASE_PATH/DOCS_EN_FOLDER (default el-EN), el-GR -> DOCS_BASE_PATH/DOCS_EL_FOLDER (default el-GR).
   */
  private getDocsDir(locale?: string): string {
    const base = this.config.get<string>('DOCS_BASE_PATH') || 'docs';
    const baseResolved = resolveFromBackendRoot(base);
    if (locale === 'el-GR') {
      const elFolder = this.config.get<string>('DOCS_EL_FOLDER') || 'el-GR';
      return path.join(baseResolved, elFolder);
    }
    const enFolder = this.config.get<string>('DOCS_EN_FOLDER') || this.config.get<string>('DOCS_EN_LOCALE_SUBFOLDER') || 'el-EN';
    return path.join(baseResolved, enFolder);
  }

  /**
   * Find a file case-insensitively in a directory
   */
  private findFileCaseInsensitive(directory: string, fileName: string): string | null {
    if (!fs.existsSync(directory)) {
      return null;
    }
    
    // First try exact match
    const exactPath = path.join(directory, fileName);
    if (fs.existsSync(exactPath)) {
      return exactPath;
    }
    
    // Then try case-insensitive match
    const files = fs.readdirSync(directory);
    const lowerFileName = fileName.toLowerCase();
    const found = files.find(f => f.toLowerCase() === lowerFileName);
    
    return found ? path.join(directory, found) : null;
  }

  /**
   * Extract text from a DOCX file (e.g. Student Questionnaire.docx for el-GR)
   */
  async extractTextFromDocx(filePath: string): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } catch (error: any) {
      this.logger.error(`Error extracting text from DOCX ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract text from a PDF file
   */
  async extractTextFromPdf(filePath: string): Promise<string> {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      
      // Use pdf-parse to extract text (same approach as curriculum parser)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PDFParse } = eval('require')('pdf-parse');
      const parser = new PDFParse({ data: dataBuffer });
      await parser.load();
      const result = await parser.getText();
      
      // Combine text from all pages
      const fullText = result.pages
        .map((page: { text: string; num: number }) => page.text)
        .join('\n\n');
      
      return fullText;
    } catch (error: any) {
      this.logger.error(`Error extracting text from PDF ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get questionnaire questions for a specific year
   *
   * File structure:
   * - en-GB (default): docs/ — Year5.pdf ... Year13.pdf, General Questionnaires.pdf
   * - el-GR (Greek): docs/el-GR/ — year5.pdf ... year13.pdf, General Questionnaires.pdf
   *
   * Tries year-specific PDF first, then falls back to General Questionnaires.pdf
   */
  async getQuestionnaireForYear(yearNumber: number, locale?: string): Promise<any> {
    const effectiveLocale = locale || 'en-GB';
    const cacheKey = `year_${yearNumber}_${effectiveLocale}`;

    if (this.questionnairesCache.has(cacheKey)) {
      return this.questionnairesCache.get(cacheKey);
    }

    try {
      const docsDir = this.getDocsDir(effectiveLocale);

      let content: string | undefined;

      // el-GR: try Student questionnaire.txt first (Greek questionnaire for Part A)
      if (effectiveLocale === 'el-GR') {
        const txtPath = this.findFileCaseInsensitive(docsDir, 'Student questionnaire.txt');
        if (txtPath) {
          try {
            content = fs.readFileSync(txtPath, 'utf-8');
            this.logger.log(`Loaded Greek questionnaire from ${txtPath}`);
            const questionnaire = this.parseQuestionnaireTxtElGR(content, yearNumber);
            if (questionnaire.sections && questionnaire.sections.length > 0) {
              this.questionnairesCache.set(cacheKey, questionnaire);
              return questionnaire;
            }
          } catch (e: any) {
            this.logger.warn(`Failed to read/parse Student questionnaire.txt: ${e?.message}`);
            content = undefined;
          }
        }
      }

      // el-GR: if no TXT or parse failed, try Student Questionnaire.docx (single DOCX with all years)
      if (content === undefined && effectiveLocale === 'el-GR') {
        const docxPath = this.findFileCaseInsensitive(docsDir, 'Student Questionnaire.docx');
        if (docxPath) {
          content = await this.extractTextFromDocx(docxPath);
        }
      }

      if (content === undefined) {
        // Try year-specific PDF (e.g. year7.pdf)
        const yearPdfPath = this.findFileCaseInsensitive(docsDir, `year${yearNumber}.pdf`);
        if (yearPdfPath) {
          content = await this.extractTextFromPdf(yearPdfPath);
        }
      }

      if (content === undefined) {
        const generalPdfPath = this.findFileCaseInsensitive(docsDir, 'General Questionnaires.pdf');
        if (generalPdfPath) {
          content = await this.extractTextFromPdf(generalPdfPath);
        }
      }

      if (content === undefined) {
        this.logger.warn(
          `Questionnaire not found for Year ${yearNumber} (locale: ${effectiveLocale}). Tried ${docsDir} (el-GR: Student questionnaire.txt, Student Questionnaire.docx; year${yearNumber}.pdf, General Questionnaires.pdf). Returning empty.`,
        );
        const emptyQuestionnaire = { year: yearNumber, sections: [] };
        this.questionnairesCache.set(cacheKey, emptyQuestionnaire);
        return emptyQuestionnaire;
      }

      const questionnaire = this.parseQuestionnaire(content, yearNumber, effectiveLocale);

      if (!questionnaire.sections || questionnaire.sections.length === 0) {
        this.logger.warn(`Parsed Year ${yearNumber} questionnaire but got 0 sections (locale: ${effectiveLocale}). Content length: ${content.length}`);
      } else {
        this.logger.log(`Successfully parsed Year ${yearNumber} questionnaire (${effectiveLocale}): ${questionnaire.sections.length} sections`);
      }

      this.questionnairesCache.set(cacheKey, questionnaire);
      return questionnaire;
    } catch (error) {
      this.logger.error(`Error reading questionnaire PDF: ${error.message}`);
      const emptyQuestionnaire = { year: yearNumber, sections: [] };
      this.questionnairesCache.set(cacheKey, emptyQuestionnaire);
      return emptyQuestionnaire;
    }
  }

  /**
   * Get diagnostic test questions for a specific year.
   * en-GB: single Diagnostic tests.pdf. el-GR: same, or from Didaktiko-Paketo-K10/K11/K12-LEARNER folders when no single PDF.
   */
  async getDiagnosticTestForYear(yearNumber: number, locale?: string): Promise<any> {
    const effectiveLocale = locale || 'en-GB';
    const cacheKey = `year_${yearNumber}_${effectiveLocale}`;

    if (this.diagnosticTestsCache.has(cacheKey)) {
      return this.diagnosticTestsCache.get(cacheKey);
    }

    try {
      const docsDir = this.getDocsDir(effectiveLocale);
      let filePath = this.findFileCaseInsensitive(docsDir, 'Diagnostic tests.pdf');

      // el-GR: if no single PDF, collect content from all Didaktiko-Paketo-K{N}-LEARNER subdirectories (K10, K11, K12, or K9 etc.)
      let contentFromPdfs: string | undefined;
      if (!filePath && effectiveLocale === 'el-GR') {
        const kLevel = yearNumber;
        const folderPrefix = `Didaktiko-Paketo-K${kLevel}-LEARNER`;
        if (fs.existsSync(docsDir)) {
          const entries = fs.readdirSync(docsDir, { withFileTypes: true });
          const matchingFolders = entries.filter(
            (e) => e.isDirectory() && e.name.startsWith(folderPrefix),
          );
          const allPdfPaths: string[] = [];
          for (const dir of matchingFolders) {
            const folderPath = path.join(docsDir, dir.name);
            try {
              const files = fs.readdirSync(folderPath);
              const pdfs = files.filter((f) => f.toLowerCase().endsWith('.pdf'));
              for (const pdfName of pdfs) {
                allPdfPaths.push(path.join(folderPath, pdfName));
              }
            } catch (e: any) {
              this.logger.warn(`Could not read folder ${dir.name}: ${e?.message}`);
            }
          }
          if (allPdfPaths.length > 0) {
            this.logger.log(`Found ${allPdfPaths.length} PDF(s) in ${matchingFolders.length} folder(s) for K${kLevel} (year ${yearNumber})`);
            const parts: string[] = [];
            for (const pdfPath of allPdfPaths) {
              try {
                const text = await this.extractTextFromPdf(pdfPath);
                if (text && text.trim().length > 0) {
                  parts.push(text);
                }
              } catch (e: any) {
                this.logger.warn(`Could not extract text from ${path.basename(pdfPath)}: ${e?.message}`);
              }
            }
            if (parts.length > 0) {
              contentFromPdfs = parts.join('\n\n---\n\n');
            }
          }
        }
      }

      if (!filePath && !contentFromPdfs) {
        this.logger.warn(`Diagnostic test PDF not found (locale: ${effectiveLocale}, year: ${yearNumber}). Tried ${docsDir}. Returning empty.`);
        const emptyDiagnosticTest = { year: yearNumber, sections: [], questions: [] };
        this.diagnosticTestsCache.set(cacheKey, emptyDiagnosticTest);
        return emptyDiagnosticTest;
      }

      const content = contentFromPdfs ?? (await this.extractTextFromPdf(filePath!));
      let diagnosticTest = await this.parseDiagnosticTest(content, yearNumber, effectiveLocale);

      // el-GR fallback: if Didaktiko-Paketo PDFs don't have the standard year header, extract questions from full content
      if (effectiveLocale === 'el-GR' && diagnosticTest.questions.length === 0 && content.trim().length > 0) {
        this.logger.log(`No questions from header-based parse for el-GR year ${yearNumber}; trying content-based extraction.`);
        const extracted = this.extractDiagnosticQuestions(content);
        if (extracted.questions.length > 0) {
          diagnosticTest = {
            year: yearNumber,
            sections: extracted.sections.length > 0 ? extracted.sections : [{ title: 'Διαγνωστικά Ερωτήματα', questions: extracted.questions }],
            questions: extracted.questions,
          };
          this.logger.log(`el-GR fallback extracted ${extracted.questions.length} questions from PDF content.`);
        }
      }

      this.diagnosticTestsCache.set(cacheKey, diagnosticTest);
      return diagnosticTest;
    } catch (error) {
      this.logger.error(`Error reading diagnostic test PDF: ${error.message}`);
      const emptyDiagnosticTest = { year: yearNumber, sections: [], questions: [] };
      this.diagnosticTestsCache.set(cacheKey, emptyDiagnosticTest);
      return emptyDiagnosticTest;
    }
  }

  /**
   * Parse questionnaire content and extract questions for a specific year.
   * Supports en-GB (English) and el-GR (Greek) header patterns.
   */
  private parseQuestionnaire(content: string, yearNumber: number, locale?: string): any {
    const effectiveLocale = locale || 'en-GB';
    const headerVariations: string[] =
      effectiveLocale === 'el-GR'
        ? [
            `ΕΤΟΣ ${yearNumber} – ΓΕΝΙΚΟ ΕΡΩΤΗΜΑΤΟΛΟΓΙΟ`,
            `ΕΤΟΣ ${yearNumber} - ΓΕΝΙΚΟ ΕΡΩΤΗΜΑΤΟΛΟΓΙΟ`,
            `Έτος ${yearNumber} – Γενικό Ερωτηματολόγιο`,
            `YEAR ${yearNumber} – GENERAL QUESTIONNAIRE`,
            `YEAR ${yearNumber} - GENERAL QUESTIONNAIRE`,
          ]
        : [
            `YEAR ${yearNumber} – GENERAL QUESTIONNAIRE`,
            `YEAR ${yearNumber} - GENERAL QUESTIONNAIRE`,
            `YEAR ${yearNumber} – GENERAL QUESTIONNAIRE (Supercurriculum)`,
            `YEAR ${yearNumber} - GENERAL QUESTIONNAIRE (Supercurriculum)`,
          ];

    let startIndex = -1;
    let matchedHeader = '';

    for (const header of headerVariations) {
      startIndex = content.indexOf(header);
      if (startIndex !== -1) {
        matchedHeader = header;
        break;
      }
    }

    if (startIndex === -1 && effectiveLocale === 'el-GR') {
      const greekYearRegex = new RegExp(`ΕΤΟΣ\\s+${yearNumber}\\s*[-–]\\s*ΓΕΝΙΚΟ`, 'i');
      const m = content.match(greekYearRegex);
      if (m && m.index !== undefined) {
        startIndex = m.index;
        matchedHeader = m[0];
      }
    }

    if (startIndex === -1) {
      this.logger.warn(`Questionnaire for Year ${yearNumber} (${effectiveLocale}) not found. Tried variations.`);
      return { sections: [] };
    }

    this.logger.log(`Found Year ${yearNumber} questionnaire with header: "${matchedHeader}"`);

    const nextYearVariations: string[] =
      effectiveLocale === 'el-GR'
        ? [
            `ΕΤΟΣ ${yearNumber + 1} –`,
            `ΕΤΟΣ ${yearNumber + 1} -`,
            `Έτος ${yearNumber + 1} –`,
            `YEAR ${yearNumber + 1} –`,
            `YEAR ${yearNumber + 1} -`,
          ]
        : [
            `YEAR ${yearNumber + 1} – GENERAL QUESTIONNAIRE`,
            `YEAR ${yearNumber + 1} - GENERAL QUESTIONNAIRE`,
            `YEAR ${yearNumber + 1} – GENERAL QUESTIONNAIRE (Supercurriculum)`,
            `YEAR ${yearNumber + 1} - GENERAL QUESTIONNAIRE (Supercurriculum)`,
          ];

    let nextYearIndex = -1;
    for (const header of nextYearVariations) {
      nextYearIndex = content.indexOf(header, startIndex + 1);
      if (nextYearIndex !== -1) break;
    }

    const endIndex = nextYearIndex === -1 ? content.length : nextYearIndex;
    const yearContent = content.substring(startIndex, endIndex);
    const sections = this.extractQuestionnaireSections(yearContent);

    this.logger.log(`Extracted ${sections.length} sections with ${sections.reduce((sum, s) => sum + (s.questions?.length || 0), 0)} total questions for Year ${yearNumber}`);

    return { year: yearNumber, sections };
  }

  /**
   * Extract sections from questionnaire content
   */
  private extractQuestionnaireSections(content: string): any[] {
    const sections: any[] = [];
    const lines = content.split('\n');
    
    // Create a default section if questions appear before any section header
    let currentSection: any = {
      title: 'General Questions',
      description: '',
      questions: [],
    };
    let currentQuestion: any = null;
    let collectingOptions = false;
    let questionCounter = 0;
    let hasAnySection = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';
      
      if (!line) {
        // Empty line might indicate end of options
        if (collectingOptions && currentQuestion && currentQuestion.options.length > 0) {
          collectingOptions = false;
        }
        continue;
      }
      
      // Check if this is a section header (all caps, 2+ words, not a question, not a year header)
      // Also allow mixed case like "About You" or "How You Learn"
      const isAllCaps = line.match(/^[A-Z][A-Z\s&]+$/);
      const isTitleCase = line.match(/^[A-Z][a-z\s&]+$/);
      const isSectionHeader = (isAllCaps || isTitleCase) && 
                              line.length > 5 && 
                              !line.includes('?') &&
                              !line.includes('YEAR') &&
                              !line.includes('QUESTIONNAIRE') &&
                              !line.includes('Supercurriculum');
      
      if (isSectionHeader) {
        hasAnySection = true;
        // Save previous section if exists
        if (currentSection) {
          if (currentQuestion) {
            currentSection.questions.push(currentQuestion);
            currentQuestion = null;
          }
          // Only add section if it has questions or if it's not the default section
          if (currentSection.questions.length > 0 || currentSection.title !== 'General Questions') {
            sections.push(currentSection);
          }
        }
        
        // Start new section
        currentSection = {
          title: line,
          description: '',
          questions: [],
        };
        collectingOptions = false;
        continue;
      }
      
      // Check if this is a question (contains ?)
      if (line.includes('?')) {
        // Save previous question if exists
        if (currentQuestion && currentSection) {
          currentSection.questions.push(currentQuestion);
        }
        
        questionCounter++;
        
        // Determine question type from question text
        const lowerQuestion = line.toLowerCase();
        let questionType = 'multiple_choice'; // Default
        if (lowerQuestion.includes('short text') || lowerQuestion === 'short text.') {
          questionType = 'text';
        } else if (
          lowerQuestion.includes('choose up to') || 
          lowerQuestion.includes('choose more than one') ||
          lowerQuestion.includes('you can choose more than one') ||
          lowerQuestion.includes('select') ||
          lowerQuestion.includes('(choose all that apply)') ||
          lowerQuestion.includes('select all that apply')
        ) {
          questionType = 'multiple_select';
        }
        
        // Start new question
        currentQuestion = {
          id: `q_${questionCounter}`,
          question: line,
          type: questionType,
          options: [],
        };
        collectingOptions = questionType !== 'text'; // Don't collect options for text questions
        continue;
      }
      
      // If we're collecting options for a question
      if (collectingOptions && currentQuestion) {
        // Check if this is a special instruction line (should be skipped)
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('short text') || lowerLine === 'short text.') {
          currentQuestion.type = 'text';
          collectingOptions = false; // Text questions don't have options
          continue;
        }
        
        // Skip instruction lines that might appear after the question
        if (lowerLine.includes('choose up to') || 
            lowerLine.includes('select') ||
            lowerLine.includes('choose all that apply') ||
            lowerLine === 'short text' ||
            lowerLine === 'short text.') {
          // This is just an instruction, not an option - continue to collect options
          continue;
        }
        
        // Check if next line is empty or a new question/section (end of options)
        const isNextLineEmpty = !nextLine || nextLine.trim() === '';
        const isNextLineQuestion = nextLine.includes('?');
        const isNextLineSectionHeader = (nextLine.match(/^[A-Z][A-Z\s&]+$/) && nextLine.length > 5 && !nextLine.includes('?')) ||
                                       (nextLine.match(/^[A-Z][a-z\s&]+$/) && nextLine.length > 5 && !nextLine.includes('?') && !nextLine.includes('Section'));
        const isEndOfOptions = isNextLineEmpty || isNextLineQuestion || isNextLineSectionHeader;
        
        // Add as option if it looks like one (not too long, not another question, not a section header)
        // Options are typically short lines that come after a question
        const isLikelyOption = line.length < 150 && 
            !line.includes('?') && 
            !line.match(/^[A-Z][A-Z\s&]+$/) && // Not all caps section header
            !(line.match(/^[A-Z][a-z\s&]+$/) && line.length > 5 && !line.includes('?')) && // Not title case section header
            !line.includes('Section') && 
            !line.includes('YEAR') && 
            !line.includes('QUESTIONNAIRE') &&
            !line.includes('Supercurriculum');
        
        if (isLikelyOption && !isEndOfOptions) {
          const optionValue = line.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 50);
          
          currentQuestion.options.push({
            value: optionValue || `option_${currentQuestion.options.length + 1}`,
            label: line,
          });
        } else if (isEndOfOptions) {
          // We've reached the end of options for this question
          if (currentQuestion.options.length > 0) {
            collectingOptions = false;
          } else if (isNextLineEmpty && i < lines.length - 1) {
            // If we have no options yet and next line is empty, might be end of question
            // But continue collecting in case options come after empty line
            // Only stop if we see a clear section header or question
            if (i < lines.length - 2) {
              const lineAfterNext = lines[i + 2]?.trim() || '';
              if (lineAfterNext.includes('?') || 
                  (lineAfterNext.match(/^[A-Z][A-Z\s&]+$/) && lineAfterNext.length > 5) ||
                  (lineAfterNext.match(/^[A-Z][a-z\s&]+$/) && lineAfterNext.length > 5 && !lineAfterNext.includes('?'))) {
                collectingOptions = false;
              }
            }
          }
        }
      }
    }
    
    // Don't forget the last question and section
    if (currentQuestion && currentSection) {
      currentSection.questions.push(currentQuestion);
    }
    if (currentSection) {
      // Only add section if it has questions or if it's not the default section
      if (currentSection.questions.length > 0 || currentSection.title !== 'General Questions' || !hasAnySection) {
        sections.push(currentSection);
      }
    }
    
    this.logger.log(`Extracted ${sections.length} sections: ${sections.map(s => `${s.title} (${s.questions.length} questions)`).join(', ')}`);

    // Log question types and option counts for debugging
    sections.forEach(section => {
      section.questions.forEach((q: any) => {
        this.logger.debug(`Question: "${q.question.substring(0, 50)}..." | Type: ${q.type} | Options: ${q.options?.length || 0}`);
      });
    });

    return sections;
  }

  /**
   * Parse Greek Student questionnaire.txt format (el-GR).
   * Format: section titles (no ☐), questions (line ending with ? or ;), options (lines with ☐, split by ☐).
   */
  private parseQuestionnaireTxtElGR(content: string, yearNumber: number): { year: number; sections: any[] } {
    const sections: any[] = [];
    const lines = content.split(/\r?\n/).map((l) => l.trim());
    let currentSection: any = null;
    let currentQuestion: any = null;
    let questionCounter = 0;
    const checkboxChar = '☐';

    const slug = (label: string, index: number): string => {
      const s = label
        .replace(/\s+/g, '_')
        .replace(/[^\p{L}\p{N}_]/gu, '')
        .substring(0, 40);
      return s || `opt_${index}`;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      // Stop at developer notes
      if (line.includes('(Για τον developer)') || line.startsWith('Default mode:')) break;

      const hasCheckbox = line.includes(checkboxChar);
      const isQuestion = /[?;]$/.test(line) || (/[:]$/.test(line) && line.length < 150);

      // Section title: no ☐, no ? or ; at end, not a question line
      if (!hasCheckbox && !isQuestion && line.length > 1) {
        // Could be section or continuation of option text - treat as section if we don't have a current question collecting options, or if line looks like a title (short, no leading option-like text)
        const looksLikeSection = line.length < 80 && !line.startsWith('☐');
        if (looksLikeSection) {
          if (currentSection && currentQuestion) {
            currentSection.questions.push(currentQuestion);
            currentQuestion = null;
          }
          if (currentSection && currentSection.questions.length > 0) {
            sections.push(currentSection);
          }
          currentSection = {
            title: line,
            description: '',
            questions: [],
          };
          continue;
        }
      }

      // Question: ends with ? or ;
      if (isQuestion && !hasCheckbox) {
        if (currentSection && currentQuestion) {
          currentSection.questions.push(currentQuestion);
        }
        questionCounter++;
        currentQuestion = {
          id: `q_${questionCounter}`,
          question: line,
          type: line.includes('έως 3') || line.includes('Έως 3') || line.includes('όλες') ? 'multiple_select' : 'multiple_choice',
          options: [],
        };
        continue;
      }

      // Options: line contains ☐
      if (hasCheckbox && currentQuestion && currentSection) {
        const parts = line.split(checkboxChar).map((p) => p.trim()).filter((p) => p.length > 0);
        parts.forEach((label, idx) => {
          currentQuestion.options.push({
            value: slug(label, currentQuestion.options.length + idx),
            label,
          });
        });
      }
    }

    if (currentSection && currentQuestion) {
      currentSection.questions.push(currentQuestion);
    }
    if (currentSection && (currentSection.questions.length > 0 || sections.length === 0)) {
      sections.push(currentSection);
    }

    this.logger.log(
      `Parsed el-GR Student questionnaire.txt: ${sections.length} sections, ${sections.reduce((sum, s) => sum + (s.questions?.length || 0), 0)} questions`,
    );
    return { year: yearNumber, sections };
  }

  /**
   * Parse diagnostic test content and extract questions for a specific year.
   * Supports en-GB (English) and el-GR (Greek) header patterns.
   */
  private async parseDiagnosticTest(content: string, yearNumber: number, locale?: string): Promise<any> {
    const effectiveLocale = locale || 'en-GB';
    const headerPatterns: string[] =
      effectiveLocale === 'el-GR'
        ? [
            `ΕΤΟΣ ${yearNumber} – ΔΙΑΓΝΩΣΤΙΚΟ ΤΕΣΤ`,
            `ΕΤΟΣ ${yearNumber} - ΔΙΑΓΝΩΣΤΙΚΟ ΤΕΣΤ`,
            `Έτος ${yearNumber} – Διαγνωστικό Τεστ`,
            `ΕΤΟΣ ${yearNumber} – ΠΡΟΓΡΑΜΜΑ ΔΙΑΓΝΩΣΤΙΚΟΥ ΕΛΕΓΧΟΥ`,
            `YEAR ${yearNumber} – FULL PRIOR KNOWLEDGE DIAGNOSTIC TEST`,
            `YEAR ${yearNumber} - FULL PRIOR KNOWLEDGE DIAGNOSTIC TEST`,
          ]
        : [
            `YEAR ${yearNumber} – FULL PRIOR KNOWLEDGE DIAGNOSTIC TEST`,
            `YEAR ${yearNumber} - FULL PRIOR KNOWLEDGE DIAGNOSTIC TEST`,
            `YEAR ${yearNumber} – PRIOR KNOWLEDGE DIAGNOSTIC TEST`,
            `YEAR ${yearNumber} - PRIOR KNOWLEDGE DIAGNOSTIC TEST`,
            `YEAR ${yearNumber} – FULL PRIOR KNOWLEDGE DIAGNOSTIC TEST (Supercurriculum)`,
            `YEAR ${yearNumber} - FULL PRIOR KNOWLEDGE DIAGNOSTIC TEST (Supercurriculum)`,
            `YEAR ${yearNumber} – PRIOR KNOWLEDGE DIAGNOSTIC TEST (Supercurriculum)`,
            `YEAR ${yearNumber} - PRIOR KNOWLEDGE DIAGNOSTIC TEST (Supercurriculum)`,
          ];

    const regexPattern =
      effectiveLocale === 'el-GR'
        ? new RegExp(`ΕΤΟΣ\\s+${yearNumber}\\s*[-–]\\s*(ΔΙΑΓΝΩΣΤΙΚΟ|ΠΡΟΓΡΑΜΜΑ)`, 'i')
        : new RegExp(`YEAR\\s+${yearNumber}\\s*[-–]\\s*(FULL\\s+)?PRIOR\\s+KNOWLEDGE\\s+DIAGNOSTIC\\s+TEST`, 'i');

    let startIndex = -1;
    let matchedHeader = '';

    for (const header of headerPatterns) {
      startIndex = content.indexOf(header);
      if (startIndex !== -1) {
        matchedHeader = header;
        break;
      }
    }

    if (startIndex === -1) {
      const regexMatch = content.match(regexPattern);
      if (regexMatch) {
        startIndex = regexMatch.index ?? -1;
        matchedHeader = regexMatch[0];
        this.logger.log(`Found Year ${yearNumber} header using regex: "${matchedHeader}"`);
      }
    }

    if (startIndex === -1) {
      this.logger.warn(`Diagnostic test for Year ${yearNumber} (${effectiveLocale}) not found. Tried patterns.`);
      this.logger.debug(`Content preview (first 1000 chars): ${content.substring(0, 1000)}`);
      const anyYearMatch = content.match(effectiveLocale === 'el-GR' ? /ΕΤΟΣ\s+\d+\s*[-–]/i : /YEAR\s+\d+\s*[-–]\s*[A-Z\s]+DIAGNOSTIC\s+TEST/i);
      if (anyYearMatch) this.logger.debug(`Found similar header in content: "${anyYearMatch[0]}"`);
      return { sections: [], questions: [] };
    }

    this.logger.log(`Found Year ${yearNumber} diagnostic test with header: "${matchedHeader}"`);

    const nextYearPatterns: string[] =
      effectiveLocale === 'el-GR'
        ? [`ΕΤΟΣ ${yearNumber + 1} –`, `ΕΤΟΣ ${yearNumber + 1} -`, `Έτος ${yearNumber + 1} –`, `YEAR ${yearNumber + 1} –`, `YEAR ${yearNumber + 1} -`]
        : [
            `YEAR ${yearNumber + 1} – FULL PRIOR KNOWLEDGE DIAGNOSTIC TEST`,
            `YEAR ${yearNumber + 1} - FULL PRIOR KNOWLEDGE DIAGNOSTIC TEST`,
            `YEAR ${yearNumber + 1} – PRIOR KNOWLEDGE DIAGNOSTIC TEST`,
            `YEAR ${yearNumber + 1} - PRIOR KNOWLEDGE DIAGNOSTIC TEST`,
            `YEAR ${yearNumber + 1} – FULL PRIOR KNOWLEDGE DIAGNOSTIC TEST (Supercurriculum)`,
            `YEAR ${yearNumber + 1} - FULL PRIOR KNOWLEDGE DIAGNOSTIC TEST (Supercurriculum)`,
            `YEAR ${yearNumber + 1} – PRIOR KNOWLEDGE DIAGNOSTIC TEST (Supercurriculum)`,
            `YEAR ${yearNumber + 1} - PRIOR KNOWLEDGE DIAGNOSTIC TEST (Supercurriculum)`,
          ];

    const nextYearRegex =
      effectiveLocale === 'el-GR'
        ? new RegExp(`ΕΤΟΣ\\s+${yearNumber + 1}\\s*[-–]`, 'i')
        : new RegExp(`YEAR\\s+${yearNumber + 1}\\s*[-–]\\s*(FULL\\s+)?PRIOR\\s+KNOWLEDGE\\s+DIAGNOSTIC\\s+TEST`, 'i');

    let nextYearIndex = -1;
    for (const header of nextYearPatterns) {
      nextYearIndex = content.indexOf(header, startIndex + 1);
      if (nextYearIndex !== -1) break;
    }
    
    // If no exact match, try case-insensitive regex
    if (nextYearIndex === -1) {
      const regexMatch = content.substring(startIndex + 1).match(nextYearRegex);
      if (regexMatch) {
        nextYearIndex = startIndex + 1 + (regexMatch.index || 0);
      }
    }
    
    const endIndex = nextYearIndex === -1 ? content.length : nextYearIndex;
    
    const yearContent = content.substring(startIndex, endIndex);
    
    this.logger.log(`Extracting diagnostic questions from ${yearContent.length} characters of content for Year ${yearNumber}`);
    
    // Count question marks in the content to see how many questions should be there
    const questionMarkCount = (yearContent.match(/\?/g) || []).length;
    this.logger.log(`Found ${questionMarkCount} question marks in Year ${yearNumber} content`);
    
    // Try AI-powered parsing first, fallback to pattern-based if not available
    const { sections, questions } = this.openai 
      ? await this.extractDiagnosticQuestionsWithAI(yearContent)
      : this.extractDiagnosticQuestions(yearContent);
    
    this.logger.log(`Extracted ${questions.length} questions from ${sections.length} sections for Year ${yearNumber}`);
    
    if (questionMarkCount > questions.length) {
      this.logger.warn(`Mismatch: Found ${questionMarkCount} question marks but only extracted ${questions.length} questions for Year ${yearNumber}`);
      // Log sample of content to help debug
      const lines = yearContent.split('\n');
      const questionLines = lines.filter(l => l.includes('?'));
      this.logger.debug(`Sample question lines (first 10): ${questionLines.slice(0, 10).join(' | ')}`);
    }
    
    return {
      year: yearNumber,
      sections,
      questions, // Flat array of all questions
    };
  }

  /**
   * Extract questions from diagnostic test content
   */
  private extractDiagnosticQuestions(content: string): { sections: any[], questions: any[] } {
    const sections: any[] = [];
    const allQuestions: any[] = [];
    
    const lines = content.split('\n');
    
    // Create a default section if questions appear before any section header
    let currentSection: any = {
      title: 'Diagnostic Questions',
      questions: [],
    };
    let currentQuestion: any = null;
    let questionNumber = 0;
    let collectingOptions = false;
    let hasAnySection = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';
      
      if (!line) {
        // Empty line doesn't necessarily mean end of options - continue collecting
        // Only stop if we have multiple empty lines or clear indicators
        continue;
      }
      
      // Check if this is a section header (starts with "Section")
      if (line.match(/^Section \d+[–-]/)) {
        hasAnySection = true;
        // Save previous section if exists
        if (currentSection) {
          if (currentQuestion) {
            currentSection.questions.push(currentQuestion);
            allQuestions.push(currentQuestion);
            currentQuestion = null;
          }
          // Only add section if it has questions or if it's not the default section
          if (currentSection.questions.length > 0 || currentSection.title !== 'Diagnostic Questions') {
            sections.push(currentSection);
          }
        }
        
        // Start new section
        const sectionMatch = line.match(/^Section \d+[–-]\s*(.+)$/);
        currentSection = {
          title: sectionMatch ? sectionMatch[1] : line,
          questions: [],
        };
        collectingOptions = false;
        continue;
      }
      
      // Check if this is a question (contains ?)
      if (line.includes('?')) {
        // Save previous question if exists (ALWAYS save if it has content, even without options)
        if (currentQuestion && currentSection) {
          // Save if question has content - don't require options
          if (currentQuestion.question && currentQuestion.question.trim().length > 0) {
            currentSection.questions.push(currentQuestion);
            allQuestions.push(currentQuestion);
            this.logger.debug(`Saved question ${questionNumber}: "${currentQuestion.question.substring(0, 60)}..." with ${currentQuestion.options.length} options`);
          }
        }
        
        questionNumber++;
        // Start new question
        currentQuestion = {
          id: `diagnostic_q_${questionNumber}`,
          question: line,
          type: 'multiple_choice',
          options: [],
          correctAnswer: null, // Will be determined
        };
        collectingOptions = true;
        continue;
      }
      
      // Handle question continuation (question text might span multiple lines)
      // Only if we haven't started collecting options yet
      if (currentQuestion && collectingOptions && currentQuestion.options.length === 0) {
        // If we're still collecting and haven't found options yet, this might be question continuation
        // Don't append if it looks like an option (a), b), α), β), etc.) or is too short
        const optionLike = /^[a-zA-Z][\.\)]\s/.test(line) || /^[αβγδεΑΒΓΔΕ][\.\)]\s/.test(line);
        if (!optionLike && line.length > 20 && !line.match(/^\d+[\.\)]\s/)) {
          // Might be continuation of question text
          currentQuestion.question += ' ' + line;
          continue;
        }
      }
      
      // Also check for numbered questions (e.g., "1.", "2.", "Q1:", etc.)
      const numberedQuestionMatch = line.match(/^(\d+)[\.\):]?\s+(.+)$/);
      if (numberedQuestionMatch && !line.includes('Section') && line.length > 10) {
        const questionText = numberedQuestionMatch[2];
        if (questionText.includes('?') || questionText.length > 20) {
          // This might be a question without a question mark, or a continuation
          // Only treat as new question if previous question is complete
          if (currentQuestion && currentQuestion.options.length >= 2) {
            if (currentQuestion && currentSection) {
              currentSection.questions.push(currentQuestion);
              allQuestions.push(currentQuestion);
            }
            questionNumber++;
            currentQuestion = {
              id: `diagnostic_q_${questionNumber}`,
              question: questionText,
              type: 'multiple_choice',
              options: [],
              correctAnswer: null,
            };
            collectingOptions = true;
            continue;
          }
        }
      }
      
      // If we're collecting options for a question
      if (collectingOptions && currentQuestion) {
        // Check if next line is empty, a new question, or a new section (end of options)
        const isEndOfOptions = !nextLine || 
                               nextLine.includes('?') || 
                               nextLine.match(/^Section \d+/) ||
                               nextLine.match(/^YEAR \d+/) ||
                               nextLine.includes('ΕΤΟΣ');
        
        // Add as option if it looks like one
        // Options are typically short lines that aren't questions or section headers
        // Also check for option patterns like "a)", "b)", "A.", "B.", "α)", "β)", "Α.", "Β." (Greek), etc.
        const isOptionPattern = /^[a-zA-Z][\.\)]\s/.test(line);
        const isGreekOptionPattern = /^[αβγδεΑΒΓΔΕ][\.\)]\s/.test(line);
        const isNumberedOption = isOptionPattern || /^[a-zA-Z]\.\s/.test(line) || isGreekOptionPattern;
        
        // More lenient option detection - accept lines that look like options
        const isLikelyOption = (
          (line.length < 250 && 
           !line.includes('?') && 
           !line.match(/^Section \d+/) &&
           !line.includes('YEAR') &&
           !line.includes('ΕΤΟΣ') &&
           !line.match(/^Outcome Use/) &&
           !line.match(/^\d+[\.\)]\s/) && // Not a numbered list item that's a question
           !isEndOfOptions) ||
          isOptionPattern ||
          isGreekOptionPattern ||
          isNumberedOption
        );
        
        if (isLikelyOption) {
          const optionIndex = currentQuestion.options.length;
          const optionValue = `option_${String.fromCharCode(97 + optionIndex)}`; // a, b, c, d
          
          // Clean up option label (remove leading a), b), α), Β., etc. if present)
          let optionLabel = line.replace(/^[a-zA-ZαβγδεΑΒΓΔΕ][\.\)]\s*/, '').trim();
          if (!optionLabel) optionLabel = line; // Fallback to original if cleaning removed everything
          
          currentQuestion.options.push({
            value: optionValue,
            label: optionLabel,
          });
          
          // In diagnostic tests, the first option after the question is often the correct answer
          // But we'll mark it as the first option for now
          if (optionIndex === 0 && currentQuestion.options.length === 1) {
            currentQuestion.correctAnswer = optionValue;
          }
        } else if (isEndOfOptions) {
          // We've reached what looks like the end of options
          // Only stop collecting if we see a clear next question/section indicator
          if (nextLine.includes('?') || nextLine.match(/^Section \d+/) || nextLine.match(/^YEAR \d+/)) {
            // Clear indicator of next question/section - stop collecting
            collectingOptions = false;
          }
          // Otherwise continue collecting - might be empty line between options or more options coming
          // Don't stop just because we have 2+ options - continue to collect all options
        }
      }
    }
    
    // Don't forget the last question and section
    if (currentQuestion && currentSection) {
      // Only save if question has content
      if (currentQuestion.question && currentQuestion.question.trim().length > 0) {
        currentSection.questions.push(currentQuestion);
        allQuestions.push(currentQuestion);
      }
    }
    if (currentSection) {
      // Only add section if it has questions or if it's not the default section
      if (currentSection.questions.length > 0 || currentSection.title !== 'Diagnostic Questions' || !hasAnySection) {
        sections.push(currentSection);
      }
    }
    
    this.logger.log(`Diagnostic test extraction complete: ${allQuestions.length} total questions from ${sections.length} sections`);
    
    // Log details for debugging
    if (allQuestions.length < 10) {
      this.logger.warn(`Only ${allQuestions.length} questions extracted - this seems low. Content length: ${content.length}`);
      // Count question marks in content to see how many questions might be there
      const questionMarkCount = (content.match(/\?/g) || []).length;
      this.logger.warn(`Found ${questionMarkCount} question marks in content, but only extracted ${allQuestions.length} questions`);
      this.logger.debug(`First 2000 chars of content: ${content.substring(0, 2000)}`);
    }
    
    return { sections, questions: allQuestions };
  }

  /**
   * Extract questions from diagnostic test content using AI
   * This provides more accurate parsing of questions and options
   */
  private async extractDiagnosticQuestionsWithAI(content: string): Promise<{ sections: any[], questions: any[] }> {
    if (!this.openai) {
      this.logger.warn('OpenAI not available, falling back to pattern-based parsing');
      return this.extractDiagnosticQuestions(content);
    }

    try {
      // Split content into chunks if too large (max ~8000 tokens per chunk)
      const maxChunkSize = 20000; // characters per chunk
      const chunks = this.splitTextIntoChunks(content, maxChunkSize);
      
      const allSections: any[] = [];
      const allQuestions: any[] = [];

      for (let i = 0; i < chunks.length; i++) {
        this.logger.log(`Processing chunk ${i + 1}/${chunks.length} with AI...`);
        
        const prompt = `You are an expert at parsing educational diagnostic test questions from PDF text. Extract all questions, their options, and organize them by sections.

PDF Content (Chunk ${i + 1}/${chunks.length}):
${chunks[i]}

Extract and return a JSON object with this exact structure:
{
  "sections": [
    {
      "title": "Section name (e.g., 'ENGLISH', 'MATHEMATICS', 'READING & UNDERSTANDING')",
      "questions": [
        {
          "id": "diagnostic_q_1",
          "question": "Full question text including the question number and any continuation text",
          "type": "multiple_choice",
          "options": [
            {
              "value": "option_a",
              "label": "First option text"
            },
            {
              "value": "option_b",
              "label": "Second option text"
            }
          ],
          "correctAnswer": "option_a"
        }
      ]
    }
  ]
}

IMPORTANT RULES:
1. Extract ALL questions from the content - don't skip any
2. Each question should have ALL its options (typically 2-4 options)
3. Question text should include the full question including any continuation lines
4. Options should be cleaned (remove leading a), b), c), d) or A., B., C., D. markers)
5. Section titles should be extracted from headers like "SECTION 1 — ENGLISH" or "SECTION 2 – READING & UNDERSTANDING"
6. If no section header exists, use "Diagnostic Questions" as the section title
7. Question IDs should be sequential: diagnostic_q_1, diagnostic_q_2, etc.
8. For correctAnswer, use the first option value if not explicitly stated
9. Preserve the exact wording of questions and options
10. Handle multi-line questions correctly - combine continuation lines into the question text`;

        const response = await this.openai.chat.completions.create({
          model: 'gpt-5.5',
          messages: [
            {
              role: 'system',
              content: 'You are an expert at parsing educational diagnostic test questions. Extract questions, options, and sections accurately in valid JSON format.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1, // Low temperature for consistent parsing
          max_tokens: 8000,
        });

        const parsed = JSON.parse(response.choices[0].message.content || '{}');
        
        if (parsed.sections && Array.isArray(parsed.sections)) {
          // Merge sections and questions
          for (const section of parsed.sections) {
            allSections.push(section);
            if (section.questions && Array.isArray(section.questions)) {
              allQuestions.push(...section.questions);
            }
          }
        }
      }

      this.logger.log(`AI extracted ${allQuestions.length} questions from ${allSections.length} sections`);
      
      return {
        sections: allSections,
        questions: allQuestions,
      };
    } catch (error: any) {
      this.logger.error(`Error in AI parsing: ${error.message}. Falling back to pattern-based parsing.`);
      return this.extractDiagnosticQuestions(content);
    }
  }

  /**
   * Split text into chunks for AI processing
   */
  private splitTextIntoChunks(text: string, maxChunkSize: number): string[] {
    if (text.length <= maxChunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    let currentChunk = '';
    const lines = text.split('\n');

    for (const line of lines) {
      // If adding this line would exceed max size, save current chunk and start new one
      if (currentChunk.length + line.length > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = line + '\n';
      } else {
        currentChunk += line + '\n';
      }
    }

    // Add the last chunk
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Clear caches (useful for testing or reloading)
   */
  clearCache() {
    this.questionnairesCache.clear();
    this.diagnosticTestsCache.clear();
  }
}
