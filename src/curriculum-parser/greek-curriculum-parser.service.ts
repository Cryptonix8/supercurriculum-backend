import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { KeyStage } from '@prisma/client';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as mammoth from 'mammoth';

export interface GreekExtractedCurriculum {
  version: string;
  locale: string;
  gradeLevels: {
    code: string;
    displayName: string;
    englishEquivalent: string;
    orderIndex: number;
    educationLevel: 'PRIMARY' | 'LOWER_SECONDARY' | 'UPPER_SECONDARY';
  }[];
  subjects: {
    code: string;
    displayName: string;
    englishEquivalent?: string;
    description?: string;
    gradeLevels: string[];
    skills: {
      code: string;
      displayName: string;
      description?: string;
    }[];
    topics: {
      code: string;
      displayName: string;
      gradeLevel: string;
      coreContent?: string;
      learningObjectives?: string[];
      keySkills?: string[];
      nationalCurriculumRef?: string;
    }[];
  }[];
}

export interface GreekImportResult {
  gradeLevels: { created: number; existing: number };
  subjects: { created: number; existing: number };
  skills: { created: number; existing: number };
  topics: { created: number; existing: number };
  errors: string[];
}

@Injectable()
export class GreekCurriculumParserService {
  private readonly logger = new Logger(GreekCurriculumParserService.name);
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
   * Extract text from a DOCX file
   */
  async extractTextFromDocx(filePath: string): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } catch (error) {
      this.logger.error(`Error extracting text from DOCX: ${error.message}`);
      throw new BadRequestException(`Failed to parse DOCX: ${error.message}`);
    }
  }

  /**
   * Extract text from a PDF file (reuse existing PDF parsing logic)
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
   * Analyze Greek curriculum document and extract structure using AI
   */
  async analyzeGreekCurriculum(
    documentText: string,
    documentType: 'overview' | 'subject' | 'grade' = 'overview',
  ): Promise<GreekExtractedCurriculum> {
    if (!this.openai) {
      throw new BadRequestException('OpenAI API key not configured');
    }

    // Split long documents into chunks for processing
    const chunks = this.splitTextIntoChunks(documentText, 15000);
    this.logger.log(`Processing Greek curriculum document in ${chunks.length} chunks`);

    let allExtracted: Partial<GreekExtractedCurriculum> = {
      version: 'gr_v1',
      locale: 'el-GR',
      gradeLevels: [],
      subjects: [],
    };

    for (let i = 0; i < chunks.length; i++) {
      this.logger.log(`Processing chunk ${i + 1}/${chunks.length}`);
      
      const prompt = `You are an expert in the Greek National Curriculum (Ελληνικό Εθνικό Πρόγραμμα Σπουδών). 
Analyze this Greek curriculum document and extract the structure.

Document Type: ${documentType}
Document Text (Part ${i + 1}/${chunks.length}):
${chunks[i]}

Extract and return a JSON object with this EXACT structure:
{
  "version": "gr_v1",
  "locale": "el-GR",
  "gradeLevels": [
    {
      "code": "dimotiko_1",
      "displayName": "Δημοτικό - 1η Τάξη",
      "englishEquivalent": "Primary Year 1",
      "orderIndex": 1,
      "educationLevel": "PRIMARY"
    },
    {
      "code": "gymnasio_1",
      "displayName": "Γυμνάσιο - Α' Τάξη",
      "englishEquivalent": "Lower Secondary Year 1",
      "orderIndex": 7,
      "educationLevel": "LOWER_SECONDARY"
    },
    {
      "code": "lykeio_1",
      "displayName": "Λύκειο - Α' Τάξη",
      "englishEquivalent": "Upper Secondary Year 1",
      "orderIndex": 10,
      "educationLevel": "UPPER_SECONDARY"
    }
  ],
  "subjects": [
    {
      "code": "mathimatika",
      "displayName": "Μαθηματικά",
      "englishEquivalent": "Mathematics",
      "description": "Subject description in Greek",
      "gradeLevels": ["dimotiko_1", "gymnasio_1", "lykeio_1"],
      "skills": [
        {
          "code": "arithmitiki",
          "displayName": "Αριθμητική",
          "description": "Description in Greek"
        }
      ],
      "topics": [
        {
          "code": "prosthesi",
          "displayName": "Πρόσθεση",
          "gradeLevel": "dimotiko_1",
          "coreContent": "Core content in Greek",
          "learningObjectives": ["objective 1", "objective 2"],
          "keySkills": ["skill 1", "skill 2"],
          "nationalCurriculumRef": "Reference if available"
        }
      ]
    }
  ]
}

IMPORTANT RULES:
- Extract ALL subjects mentioned (e.g., Μαθηματικά, Ελληνική Γλώσσα, Φυσική, Χημεία, Βιολογία, Ιστορία, etc.)
- Use Greek grade level codes:
  * Δημοτικό: dimotiko_1 through dimotiko_6 (orderIndex 1-6)
  * Γυμνάσιο: gymnasio_1 through gymnasio_3 (orderIndex 7-9)
  * Λύκειο: lykeio_1 through lykeio_3 (orderIndex 10-12)
- For subjects, use lowercase Greek names with underscores (e.g., "mathimatika", "glossa", "fysiki")
- For skills, use descriptive Greek names (e.g., "anagnosi", "grafi", "arithmitiki")
- Extract topics with their Greek names and learning objectives
- Include English equivalents where possible for mapping
- Preserve all Greek characters (UTF-8)
- Be comprehensive - extract every subject and grade level mentioned`;

      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'You are an expert Greek National Curriculum analyst. Extract curriculum structures in valid JSON format. Preserve all Greek characters (UTF-8). Be comprehensive and accurate.',
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
        allExtracted = this.mergeGreekExtractedData(allExtracted, parsed);
      } catch (error) {
        this.logger.error(`Error processing chunk ${i + 1}: ${error.message}`);
      }
    }

    return allExtracted as GreekExtractedCurriculum;
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
  private mergeGreekExtractedData(
    existing: Partial<GreekExtractedCurriculum>,
    newData: Partial<GreekExtractedCurriculum>,
  ): Partial<GreekExtractedCurriculum> {
    // Merge grade levels
    if (newData.gradeLevels) {
      for (const grade of newData.gradeLevels) {
        const existingGrade = existing.gradeLevels?.find(g => g.code === grade.code);
        if (!existingGrade) {
          existing.gradeLevels = existing.gradeLevels || [];
          existing.gradeLevels.push(grade);
        }
      }
    }

    // Merge subjects
    if (newData.subjects) {
      for (const subject of newData.subjects) {
        const existingSubject = existing.subjects?.find(
          s => s.code === subject.code
        );
        
        if (existingSubject) {
          // Merge skills
          if (subject.skills) {
            for (const skill of subject.skills) {
              if (!existingSubject.skills.find(s => s.code === skill.code)) {
                existingSubject.skills.push(skill);
              }
            }
          }
          // Merge topics
          if (subject.topics) {
            for (const topic of subject.topics) {
              if (!existingSubject.topics.find(t => t.code === topic.code && t.gradeLevel === topic.gradeLevel)) {
                existingSubject.topics.push(topic);
              }
            }
          }
          // Merge grade levels
          if (subject.gradeLevels) {
            for (const gradeLevel of subject.gradeLevels) {
              if (!existingSubject.gradeLevels.includes(gradeLevel)) {
                existingSubject.gradeLevels.push(gradeLevel);
              }
            }
          }
        } else {
          existing.subjects = existing.subjects || [];
          existing.subjects.push(subject);
        }
      }
    }

    return existing;
  }

  /**
   * Import Greek curriculum into database
   */
  async importGreekCurriculum(
    extracted: GreekExtractedCurriculum,
    generateActivities: boolean = false,
  ): Promise<GreekImportResult> {
    const result: GreekImportResult = {
      gradeLevels: { created: 0, existing: 0 },
      subjects: { created: 0, existing: 0 },
      skills: { created: 0, existing: 0 },
      topics: { created: 0, existing: 0 },
      errors: [],
    };

    // Create a map for grade levels
    const gradeLevelMap = new Map<string, string>();

    // Create grade levels
    for (const gradeLevel of extracted.gradeLevels) {
      try {
        // Check if exists
        let dbGradeLevel = await this.prisma.yearGroup.findFirst({
          where: {
            OR: [
              { name: gradeLevel.code },
              { displayName: gradeLevel.displayName },
            ],
            locale: 'el-GR',
          },
        });

        if (dbGradeLevel) {
          result.gradeLevels.existing++;
          gradeLevelMap.set(gradeLevel.code, dbGradeLevel.id);
        } else {
          // Create new grade level
          dbGradeLevel = await this.prisma.yearGroup.create({
            data: {
              name: gradeLevel.code,
              displayName: gradeLevel.displayName,
              orderIndex: gradeLevel.orderIndex,
              isActive: true,
              locale: 'el-GR',
              curriculumVersion: extracted.version,
            },
          });
          result.gradeLevels.created++;
          gradeLevelMap.set(gradeLevel.code, dbGradeLevel.id);
          this.logger.log(`Created grade level: ${gradeLevel.displayName}`);
        }
      } catch (error) {
        result.errors.push(`Grade level "${gradeLevel.displayName}": ${error.message}`);
      }
    }

    // Create subjects, skills, and topics
    for (const subject of extracted.subjects) {
      for (const gradeLevelCode of subject.gradeLevels) {
        const gradeLevelId = gradeLevelMap.get(gradeLevelCode);
        if (!gradeLevelId) {
          result.errors.push(`Subject "${subject.displayName}": Grade level "${gradeLevelCode}" not found`);
          continue;
        }

        try {
          const subjectCode = this.normalizeSubjectCode(subject.code);
          
          // Check if subject exists for this grade
          let dbSubject = await this.prisma.subject.findFirst({
            where: {
              yearGroupId: gradeLevelId,
              name: subjectCode,
              locale: 'el-GR',
            },
          });

          if (dbSubject) {
            result.subjects.existing++;
          } else {
            dbSubject = await this.prisma.subject.create({
              data: {
                yearGroupId: gradeLevelId,
                name: subjectCode,
                displayName: subject.displayName,
                description: subject.description,
                whyMatters: subject.description, // Can be updated later
                orderIndex: this.getSubjectOrderIndex(subject.displayName),
                isActive: true,
                locale: 'el-GR',
                curriculumVersion: extracted.version,
              },
            });
            result.subjects.created++;
            this.logger.log(`Created subject: ${subject.displayName} for ${gradeLevelCode}`);
          }

          // Create skills
          if (subject.skills) {
            for (let i = 0; i < subject.skills.length; i++) {
              const skill = subject.skills[i];
              const skillCode = this.normalizeSkillCode(skill.code);
              
              const existingSkill = await this.prisma.skill.findFirst({
                where: {
                  subjectId: dbSubject.id,
                  name: skillCode,
                },
              });

              if (existingSkill) {
                result.skills.existing++;
              } else {
                await this.prisma.skill.create({
                  data: {
                    subjectId: dbSubject.id,
                    name: skillCode,
                    displayName: skill.displayName,
                    description: skill.description,
                    orderIndex: i + 1,
                  },
                });
                result.skills.created++;
              }
            }
          }

          // Create topics
          if (subject.topics) {
            for (const topic of subject.topics) {
              // Skip if topic is for a different grade level
              if (topic.gradeLevel !== gradeLevelCode) continue;

              const existingTopic = await this.prisma.curriculumTopic.findFirst({
                where: {
                  yearGroupId: gradeLevelId,
                  subjectId: dbSubject.id,
                  topicName: topic.displayName,
                  locale: 'el-GR',
                },
              });

              if (existingTopic) {
                result.topics.existing++;
              } else {
                await this.prisma.curriculumTopic.create({
                  data: {
                    yearGroupId: gradeLevelId,
                    subjectId: dbSubject.id,
                    topicName: topic.displayName,
                    keyStage: this.mapEducationLevelToKeyStage(
                      extracted.gradeLevels.find(g => g.code === gradeLevelCode)?.educationLevel || 'LOWER_SECONDARY'
                    ),
                    coreContent: topic.coreContent,
                    learningObjectives: topic.learningObjectives || [],
                    keySkills: topic.keySkills || [],
                    nationalCurriculumRef: topic.nationalCurriculumRef,
                    locale: 'el-GR',
                    curriculumVersion: extracted.version,
                  },
                });
                result.topics.created++;
              }
            }
          }
        } catch (error) {
          result.errors.push(`Subject "${subject.displayName}" for "${gradeLevelCode}": ${error.message}`);
        }
      }
    }

    return result;
  }

  /**
   * Process all Greek curriculum files from the provided directory
   */
  async processGreekCurriculumFiles(
    directoryPath: string,
    generateActivities: boolean = false,
  ): Promise<{ processed: string[]; results: GreekImportResult }> {
    const processed: string[] = [];
    let combinedResult: GreekImportResult = {
      gradeLevels: { created: 0, existing: 0 },
      subjects: { created: 0, existing: 0 },
      skills: { created: 0, existing: 0 },
      topics: { created: 0, existing: 0 },
      errors: [],
    };

    if (!fs.existsSync(directoryPath)) {
      this.logger.warn(`Directory not found: ${directoryPath}`);
      return { processed, results: combinedResult };
    }

    // First, process the overview DOCX file
    const overviewDocx = path.join(directoryPath, 'Overview of Upper Secondary Education in Greece.docx');
    if (fs.existsSync(overviewDocx)) {
      this.logger.log(`Processing overview DOCX: ${overviewDocx}`);
      try {
        const text = await this.extractTextFromDocx(overviewDocx);
        const extracted = await this.analyzeGreekCurriculum(text, 'overview');
        const result = await this.importGreekCurriculum(extracted, generateActivities);
        
        // Combine results
        this.combineResults(combinedResult, result);
        processed.push('Overview of Upper Secondary Education in Greece.docx');
      } catch (error) {
        this.logger.error(`Error processing overview DOCX: ${error.message}`);
        combinedResult.errors.push(`Overview DOCX: ${error.message}`);
      }
    }

    // Process PDF files in subdirectories (organized by grade level)
    const subdirs = fs.readdirSync(directoryPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const subdir of subdirs) {
      const subdirPath = path.join(directoryPath, subdir);
      const pdfFiles = fs.readdirSync(subdirPath).filter(f => f.endsWith('.pdf'));
      
      for (const pdfFile of pdfFiles) {
        this.logger.log(`Processing: ${subdir}/${pdfFile}`);
        try {
          const filePath = path.join(subdirPath, pdfFile);
          const text = await this.extractTextFromPdf(filePath);
          
          // Determine document type based on filename
          const documentType = pdfFile.toLowerCase().includes('overview') ? 'overview' : 'subject';
          
          const extracted = await this.analyzeGreekCurriculum(text, documentType);
          const result = await this.importGreekCurriculum(extracted, generateActivities);
          
          // Combine results
          this.combineResults(combinedResult, result);
          processed.push(`${subdir}/${pdfFile}`);
        } catch (error) {
          this.logger.error(`Error processing ${subdir}/${pdfFile}: ${error.message}`);
          combinedResult.errors.push(`${subdir}/${pdfFile}: ${error.message}`);
        }
      }
    }

    return { processed, results: combinedResult };
  }

  /**
   * Helper methods
   */
  private normalizeSubjectCode(code: string): string {
    return code.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  }

  private normalizeSkillCode(code: string): string {
    return code.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  }

  private mapEducationLevelToKeyStage(educationLevel: string): KeyStage {
    switch (educationLevel) {
      case 'PRIMARY':
        return KeyStage.KS2; // Δημοτικό maps to KS2
      case 'LOWER_SECONDARY':
        return KeyStage.KS3; // Γυμνάσιο maps to KS3
      case 'UPPER_SECONDARY':
        return KeyStage.KS4; // Λύκειο maps to KS4
      default:
        return KeyStage.KS3;
    }
  }

  private getSubjectOrderIndex(subjectName: string): number {
    const order: Record<string, number> = {
      'μαθηματικά': 1,
      'mathimatika': 1,
      'ελληνική γλώσσα': 2,
      'glossa': 2,
      'φυσική': 3,
      'fysiki': 3,
      'χημεία': 4,
      'chimeia': 4,
      'βιολογία': 5,
      'biologia': 5,
      'ιστορία': 6,
      'istoria': 6,
      'αγγλικά': 7,
      'agglika': 7,
    };
    
    const lower = subjectName.toLowerCase();
    for (const [key, value] of Object.entries(order)) {
      if (lower.includes(key)) return value;
    }
    return 99;
  }

  private combineResults(target: GreekImportResult, source: GreekImportResult): void {
    target.gradeLevels.created += source.gradeLevels.created;
    target.gradeLevels.existing += source.gradeLevels.existing;
    target.subjects.created += source.subjects.created;
    target.subjects.existing += source.subjects.existing;
    target.skills.created += source.skills.created;
    target.skills.existing += source.skills.existing;
    target.topics.created += source.topics.created;
    target.topics.existing += source.topics.existing;
    target.errors.push(...source.errors);
  }
}

