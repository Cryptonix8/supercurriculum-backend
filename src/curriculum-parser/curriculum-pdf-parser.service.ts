import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { KeyStage } from '@prisma/client';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { AutoExerciseGeneratorService } from '../activity-generation/auto-exercise-generator.service';
import { getCurriculumBulkPdfsDir } from '../project-paths';

export interface ExtractedCurriculum {
  keyStages: {
    name: string;
    years: string[];
    description?: string;
  }[];
  subjects: {
    name: string;
    keyStage: string;
    years: string[];
    description?: string;
    aims?: string[];
    skills: {
      name: string;
      description?: string;
    }[];
    topics: {
      name: string;
      year?: string;
      coreContent?: string;
      learningObjectives?: string[];
      keySkills?: string[];
    }[];
  }[];
}

export interface ImportResult {
  yearGroups: { created: number; existing: number };
  subjects: { created: number; existing: number };
  skills: { created: number; existing: number };
  topics: { created: number; existing: number };
  activities?: { generated: number; skipped: number; errors: string[] };
  supercurriculumActivities?: { generated: number; skipped: number; errors: string[] };
  errors: string[];
}

@Injectable()
export class CurriculumPdfParserService {
  private readonly logger = new Logger(CurriculumPdfParserService.name);
  private openai: OpenAI | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private autoExerciseGenerator: AutoExerciseGeneratorService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  /**
   * Extract text from a PDF file
   */
  async extractTextFromPdf(filePath: string): Promise<string> {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      
      // pdf-parse exports PDFParse as a class
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
    } catch (error) {
      this.logger.error(`Error extracting text from PDF: ${error.message}`);
      throw new BadRequestException(`Failed to parse PDF: ${error.message}`);
    }
  }

  /**
   * Analyze PDF text and extract curriculum structure using AI
   */
  async analyzeCurriculumPdf(pdfText: string, documentType: 'primary' | 'secondary' | 'full'): Promise<ExtractedCurriculum> {
    if (!this.openai) {
      throw new BadRequestException('OpenAI API key not configured');
    }

    // Split long documents into chunks for processing
    const chunks = this.splitTextIntoChunks(pdfText, 15000);
    this.logger.log(`Processing PDF in ${chunks.length} chunks`);

    let allExtracted: ExtractedCurriculum = {
      keyStages: [],
      subjects: [],
    };

    for (let i = 0; i < chunks.length; i++) {
      this.logger.log(`Processing chunk ${i + 1}/${chunks.length}`);
      
      const prompt = `You are an expert in the UK National Curriculum. Analyze this curriculum document and extract the structure.

Document Type: ${documentType === 'primary' ? 'Primary School (KS1-KS2)' : documentType === 'secondary' ? 'Secondary School (KS3-KS4)' : 'Full Curriculum'}

Document Text (Part ${i + 1}/${chunks.length}):
${chunks[i]}

Extract and return a JSON object with this structure:
{
  "keyStages": [
    {
      "name": "Key Stage 3",
      "years": ["Year 7", "Year 8", "Year 9"],
      "description": "Brief description of the key stage"
    }
  ],
  "subjects": [
    {
      "name": "English",
      "keyStage": "KS3",
      "years": ["Year 7", "Year 8", "Year 9"],
      "description": "Subject description",
      "aims": ["aim 1", "aim 2"],
      "skills": [
        {
          "name": "Reading",
          "description": "Description of the reading skill"
        }
      ],
      "topics": [
        {
          "name": "Specific unit or topic title (e.g. Fractions, World War II)",
          "unitRef": "Unit or chapter code when present (e.g. Unit 3, 3.2, Chapter 5)",
          "year": "Year 7",
          "coreContent": "Core content description",
          "learningObjectives": ["objective 1", "objective 2"],
          "keySkills": ["skill 1", "skill 2"]
        }
      ]
    }
  ]
}

IMPORTANT:
- Extract ALL subjects mentioned in the document (e.g., Mathematics, English, Science, Art, Music, PE, Computing, etc.)
- Extract ONLY years 5-13 (Year 5, Year 6, Year 7, Year 8, Year 9, Year 10, Year 11, Year 12, Year 13) - DO NOT extract Year 1, Year 2, Year 3, or Year 4
- For each subject, identify which years it applies to (years array) - only include years 5-13
- For each subject, identify key skills/strands
- Extract topics as specific units/chapters (not vague subject labels); include unitRef when the document names a unit or chapter number
- Include year-specific content where available
- Use standard UK year naming (Year 5, Year 6, Year 7, Year 8, Year 9, Year 10, Year 11, Year 12, Year 13) and key stage naming (KS2, KS3, KS4, KS5)
- Be comprehensive - extract every subject and year mentioned (years 5-13 only), even if only briefly`;

      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-5.5',
          messages: [
            {
              role: 'system',
              content: 'You are an expert UK National Curriculum analyst. Extract curriculum structures in valid JSON format. Be comprehensive and accurate.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_tokens: 4000,
        });

        const parsed = JSON.parse(response.choices[0].message.content || '{}');
        
        // Merge with previous results
        allExtracted = this.mergeExtractedData(allExtracted, parsed);
      } catch (error) {
        this.logger.error(`Error processing chunk ${i + 1}: ${error.message}`);
      }
    }

    return allExtracted;
  }

  /**
   * Split text into chunks for AI processing
   */
  private splitTextIntoChunks(text: string, maxChunkSize: number): string[] {
    const chunks: string[] = [];
    let currentChunk = '';
    
    const paragraphs = text.split('\n\n');
    
    for (const paragraph of paragraphs) {
      if ((currentChunk + paragraph).length > maxChunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        currentChunk = paragraph;
      } else {
        currentChunk += '\n\n' + paragraph;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }

  /**
   * Merge extracted data from multiple chunks
   */
  private mergeExtractedData(existing: ExtractedCurriculum, newData: ExtractedCurriculum): ExtractedCurriculum {
    // Merge key stages
    if (newData.keyStages) {
      for (const ks of newData.keyStages) {
        const existingKs = existing.keyStages.find(k => k.name === ks.name);
        if (!existingKs) {
          existing.keyStages.push(ks);
        }
      }
    }

    // Merge subjects
    if (newData.subjects) {
      for (const subject of newData.subjects) {
        const existingSubject = existing.subjects.find(
          s => s.name.toLowerCase() === subject.name.toLowerCase() && s.keyStage === subject.keyStage
        );
        
        if (existingSubject) {
          // Merge skills
          if (subject.skills) {
            for (const skill of subject.skills) {
              if (!existingSubject.skills.find(s => s.name.toLowerCase() === skill.name.toLowerCase())) {
                existingSubject.skills.push(skill);
              }
            }
          }
          // Merge topics
          if (subject.topics) {
            for (const topic of subject.topics) {
              if (!existingSubject.topics.find(t => t.name.toLowerCase() === topic.name.toLowerCase())) {
                existingSubject.topics.push(topic);
              }
            }
          }
        } else {
          existing.subjects.push(subject);
        }
      }
    }

    return existing;
  }

  /**
   * Import extracted curriculum into database
   * @param extracted - The extracted curriculum data
   * @param generateActivities - Whether to generate AI activities after import (default: false for backward compatibility)
   */
  async importExtractedCurriculum(
    extracted: ExtractedCurriculum,
    generateActivities: boolean = false,
  ): Promise<ImportResult> {
    const result: ImportResult = {
      yearGroups: { created: 0, existing: 0 },
      subjects: { created: 0, existing: 0 },
      skills: { created: 0, existing: 0 },
      topics: { created: 0, existing: 0 },
      errors: [],
    };

    // Track created subjects for activity generation
    const createdSubjectIds: string[] = [];
    // Track created topics for supercurriculum activity generation
    const createdTopicIds: string[] = [];

    // Create a map for year groups
    const yearGroupMap = new Map<string, string>();
    
    // First, create year groups (only Years 5-13)
    const allYears = new Set<string>();
    extracted.keyStages.forEach(ks => ks.years?.forEach(y => allYears.add(y)));
    extracted.subjects.forEach(s => s.years?.forEach(y => allYears.add(y)));

    // Filter to only Years 5-13
    const validYears = Array.from(allYears).filter(yearName => {
      const yearNum = this.getYearOrderIndex(yearName);
      return yearNum >= 5 && yearNum <= 13;
    });

    for (const yearName of validYears) {
      try {
        const normalizedName = this.normalizeYearName(yearName);
        
        // Check if exists (default to English locale for backward compatibility)
        let yearGroup = await this.prisma.yearGroup.findFirst({
          where: {
            OR: [
              { name: normalizedName, locale: 'en-GB' },
              { displayName: yearName, locale: 'en-GB' },
            ],
          },
        });

        if (yearGroup) {
          result.yearGroups.existing++;
          yearGroupMap.set(yearName, yearGroup.id);
        } else {
          // Create new year group (keyStage is stored at topic level, not year group level)
          yearGroup = await this.prisma.yearGroup.create({
            data: {
              name: normalizedName,
              displayName: yearName,
              orderIndex: this.getYearOrderIndex(yearName),
              isActive: true,
              locale: 'en-GB',
            },
          });
          result.yearGroups.created++;
          yearGroupMap.set(yearName, yearGroup.id);
          this.logger.log(`Created year group: ${yearName}`);
        }
      } catch (error) {
        result.errors.push(`Year "${yearName}": ${error.message}`);
      }
    }

    // Create subjects and skills for each year group
    for (const subject of extracted.subjects) {
      const yearsToProcess = subject.years?.length ? subject.years : this.getYearsForKeyStage(subject.keyStage);
      
      // Filter to only Years 5-13
      const validYearsToProcess = yearsToProcess.filter(yearName => {
        const yearNum = this.getYearOrderIndex(yearName);
        return yearNum >= 5 && yearNum <= 13;
      });
      
      for (const yearName of validYearsToProcess) {
        const yearGroupId = yearGroupMap.get(yearName);
        if (!yearGroupId) {
          result.errors.push(`Subject "${subject.name}": Year group "${yearName}" not found`);
          continue;
        }

        try {
          const subjectName = this.normalizeSubjectName(subject.name);
          
          // Check if subject exists for this year
          let dbSubject = await this.prisma.subject.findFirst({
            where: {
              yearGroupId,
              name: subjectName,
              locale: 'en-GB',
            },
          });

          if (dbSubject) {
            result.subjects.existing++;
            // Track for activity generation even if existing (might have new skills)
            if (!createdSubjectIds.includes(dbSubject.id)) {
              createdSubjectIds.push(dbSubject.id);
            }
          } else {
            dbSubject = await this.prisma.subject.create({
              data: {
                yearGroupId,
                name: subjectName,
                displayName: subject.name,
                description: subject.description,
                whyMatters: subject.aims?.join(' '),
                orderIndex: this.getSubjectOrderIndex(subject.name),
                isActive: true,
                locale: 'en-GB',
              },
            });
            result.subjects.created++;
            createdSubjectIds.push(dbSubject.id);
            this.logger.log(`Created subject: ${subject.name} for ${yearName}`);
          }

          // Create skills for this subject
          if (subject.skills) {
            for (let i = 0; i < subject.skills.length; i++) {
              const skill = subject.skills[i];
              const skillName = this.normalizeSkillName(skill.name);
              
              const existingSkill = await this.prisma.skill.findFirst({
                where: {
                  subjectId: dbSubject.id,
                  name: skillName,
                },
              });

              if (existingSkill) {
                result.skills.existing++;
              } else {
                await this.prisma.skill.create({
                  data: {
                    subjectId: dbSubject.id,
                    name: skillName,
                    displayName: skill.name,
                    description: skill.description,
                    orderIndex: i + 1,
                  },
                });
                result.skills.created++;
              }
            }
          }

          // Create topics for this subject
          if (subject.topics) {
            for (const topic of subject.topics) {
              // Skip if topic is for a different year
              if (topic.year && topic.year !== yearName) continue;

              const existingTopic = await this.prisma.curriculumTopic.findFirst({
                where: {
                  yearGroupId,
                  subjectId: dbSubject.id,
                  topicName: topic.name,
                },
              });

              if (existingTopic) {
                result.topics.existing++;
                // Also track existing topics for activity generation if they don't have activities
                createdTopicIds.push(existingTopic.id);
              } else {
                const unitRef =
                  (topic as any).unitRef ||
                  (topic as any).unit ||
                  (topic as any).chapter ||
                  (topic as any).code ||
                  null;
                const newTopic = await this.prisma.curriculumTopic.create({
                  data: {
                    yearGroupId,
                    subjectId: dbSubject.id,
                    topicName: topic.name,
                    nationalCurriculumRef: unitRef ? String(unitRef) : undefined,
                    keyStage: this.parseKeyStage(subject.keyStage),
                    coreContent: topic.coreContent,
                    learningObjectives: topic.learningObjectives || [],
                    keySkills: topic.keySkills || [],
                  },
                });
                result.topics.created++;
                createdTopicIds.push(newTopic.id);
              }
            }
          }
        } catch (error) {
          result.errors.push(`Subject "${subject.name}" for "${yearName}": ${error.message}`);
        }
      }
    }

    // Generate activities for imported subjects if requested
    if (generateActivities && createdSubjectIds.length > 0) {
      this.logger.log(`Generating activities for ${createdSubjectIds.length} subjects...`);
      try {
        const activityResult = await this.autoExerciseGenerator.generateActivitiesForSubjects(
          createdSubjectIds,
          { difficulties: undefined }, // Use default difficulties
        );
        result.activities = activityResult;
        this.logger.log(`Activity generation complete: ${activityResult.generated} generated, ${activityResult.skipped} skipped`);
      } catch (error) {
        this.logger.error(`Error generating activities: ${error.message}`);
        result.errors.push(`Activity generation failed: ${error.message}`);
      }
    }

    // Generate SupercurriculumActivity entries for topics (enrichment activities for weekly plans)
    if (generateActivities && createdTopicIds.length > 0) {
      this.logger.log(`Generating supercurriculum activities for ${createdTopicIds.length} topics...`);
      try {
        const scActivityResult = await this.autoExerciseGenerator.generateSupercurriculumActivitiesForTopics(
          createdTopicIds,
        );
        result.supercurriculumActivities = scActivityResult;
        this.logger.log(`Supercurriculum activity generation complete: ${scActivityResult.generated} generated, ${scActivityResult.skipped} skipped`);
      } catch (error) {
        this.logger.error(`Error generating supercurriculum activities: ${error.message}`);
        result.errors.push(`Supercurriculum activity generation failed: ${error.message}`);
      }
    }

    return result;
  }

  /**
   * Helper functions
   */
  private normalizeYearName(yearName: string): string {
    return yearName.toLowerCase().replace(/\s+/g, '_');
  }

  private normalizeSubjectName(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  }

  private normalizeSkillName(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  }

  /**
   * Parse string to KeyStage enum
   */
  private parseKeyStage(keyStageStr?: string): KeyStage {
    if (!keyStageStr) return KeyStage.KS3;
    
    const normalized = keyStageStr.toUpperCase().replace(/\s+/g, '');
    
    switch (normalized) {
      case 'KS2':
      case 'KEYSTAGE2':
        return KeyStage.KS2;
      case 'KS3':
      case 'KEYSTAGE3':
        return KeyStage.KS3;
      case 'KS4':
      case 'KEYSTAGE4':
        return KeyStage.KS4;
      case 'KS5':
      case 'KEYSTAGE5':
        return KeyStage.KS5;
      default:
        return KeyStage.KS3;
    }
  }

  private getKeyStageForYear(yearName: string, keyStages: ExtractedCurriculum['keyStages']): string {
    for (const ks of keyStages) {
      if (ks.years?.includes(yearName)) {
        return ks.name;
      }
    }
    
    // Default based on year number
    const match = yearName.match(/\d+/);
    if (match) {
      const yearNum = parseInt(match[0]);
      if (yearNum <= 2) return 'KS1';
      if (yearNum <= 6) return 'KS2';
      if (yearNum <= 9) return 'KS3';
      return 'KS4';
    }
    return 'KS3';
  }

  private getYearsForKeyStage(keyStage: string): string[] {
    switch (keyStage?.toUpperCase()) {
      case 'KS1': return ['Year 1', 'Year 2'];
      case 'KS2': return ['Year 3', 'Year 4', 'Year 5', 'Year 6'];
      case 'KS3': return ['Year 7', 'Year 8', 'Year 9'];
      case 'KS4': return ['Year 10', 'Year 11'];
      default: return ['Year 7', 'Year 8', 'Year 9'];
    }
  }

  private getYearOrderIndex(yearName: string): number {
    const match = yearName.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  }

  private getSubjectOrderIndex(subjectName: string): number {
    const order: Record<string, number> = {
      'english': 1,
      'mathematics': 2,
      'maths': 2,
      'science': 3,
      'history': 4,
      'geography': 5,
      'art': 6,
      'art and design': 6,
      'music': 7,
      'physical education': 8,
      'pe': 8,
      'computing': 9,
      'languages': 10,
      'citizenship': 11,
      'design and technology': 12,
    };
    
    const lower = subjectName.toLowerCase();
    for (const [key, value] of Object.entries(order)) {
      if (lower.includes(key)) return value;
    }
    return 99;
  }

  /**
   * When scanning docs/el-EN (mixed PDFs), skip files meant for activities/onboarding only.
   */
  private filterBulkCurriculumPdfFilenames(fileNames: string[]): string[] {
    return fileNames.filter((f) => {
      const lower = f.toLowerCase();
      if (/^year[_\s-]?\d+\.pdf$/i.test(f)) return false;
      if (lower.includes('diagnostic')) return false;
      if (lower.includes('questionnaire')) return false;
      return true;
    });
  }

  /**
   * Process curriculum PDFs from getCurriculumBulkPdfsDir() (docs locale folder or legacy ../pdfs).
   * @param generateActivities - Whether to generate AI activities after import (default: true)
   */
  async processExistingPdfs(generateActivities: boolean = true): Promise<{ processed: string[]; results: ImportResult }> {
    const pdfDir = getCurriculumBulkPdfsDir();
    const processed: string[] = [];
    
    let combinedResult: ImportResult = {
      yearGroups: { created: 0, existing: 0 },
      subjects: { created: 0, existing: 0 },
      skills: { created: 0, existing: 0 },
      topics: { created: 0, existing: 0 },
      activities: { generated: 0, skipped: 0, errors: [] },
      supercurriculumActivities: { generated: 0, skipped: 0, errors: [] },
      errors: [],
    };

    if (!fs.existsSync(pdfDir)) {
      this.logger.warn(`PDF directory not found: ${pdfDir}. Put primary.pdf and secondary.pdf under docs (see DOCS_BASE_PATH / DOCS_EN_FOLDER) or set CURRICULUM_BULK_PDFS_PATH.`);
      return { processed, results: combinedResult };
    }

    const allPdfs = fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'));
    const files = this.filterBulkCurriculumPdfFilenames(allPdfs);
    if (files.length === 0 && allPdfs.length > 0) {
      this.logger.warn(
        `No curriculum structure PDFs to import in ${pdfDir} (skipped year/diagnostic/questionnaire PDFs). Add primary.pdf / secondary.pdf here.`,
      );
      return { processed, results: combinedResult };
    }
    
    for (const file of files) {
      this.logger.log(`Processing: ${file}`);
      try {
        const filePath = path.join(pdfDir, file);
        const text = await this.extractTextFromPdf(filePath);
        
        // Determine document type based on filename
        const documentType = file.toLowerCase().includes('primary') ? 'primary' 
          : file.toLowerCase().includes('secondary') ? 'secondary' 
          : 'full';
        
        const extracted = await this.analyzeCurriculumPdf(text, documentType);
        const result = await this.importExtractedCurriculum(extracted, generateActivities);
        
        // Combine results
        combinedResult.yearGroups.created += result.yearGroups.created;
        combinedResult.yearGroups.existing += result.yearGroups.existing;
        combinedResult.subjects.created += result.subjects.created;
        combinedResult.subjects.existing += result.subjects.existing;
        combinedResult.skills.created += result.skills.created;
        combinedResult.skills.existing += result.skills.existing;
        combinedResult.topics.created += result.topics.created;
        combinedResult.topics.existing += result.topics.existing;
        combinedResult.errors.push(...result.errors);
        
        // Combine activity results
        if (result.activities) {
          combinedResult.activities!.generated += result.activities.generated;
          combinedResult.activities!.skipped += result.activities.skipped;
          combinedResult.activities!.errors.push(...result.activities.errors);
        }
        if (result.supercurriculumActivities) {
          combinedResult.supercurriculumActivities!.generated += result.supercurriculumActivities.generated;
          combinedResult.supercurriculumActivities!.skipped += result.supercurriculumActivities.skipped;
          combinedResult.supercurriculumActivities!.errors.push(...result.supercurriculumActivities.errors);
        }
        
        processed.push(file);
      } catch (error) {
        this.logger.error(`Error processing ${file}: ${error.message}`);
        combinedResult.errors.push(`${file}: ${error.message}`);
      }
    }

    return { processed, results: combinedResult };
  }
}

