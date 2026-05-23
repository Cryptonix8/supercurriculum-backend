/**
 * Script to import Greek curriculum from DOCX and PDF files
 * 
 * Usage:
 *   ts-node scripts/import-greek-curriculum.ts [directory-path]
 * 
 * Example:
 *   ts-node scripts/import-greek-curriculum.ts overview-of-upper-secondary-education-in-greece-docx_2026-02-19_0937
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { GreekCurriculumParserService } from '../src/curriculum-parser/greek-curriculum-parser.service';
import * as path from 'path';

async function main() {
  const directoryPath = process.argv[2] || 'overview-of-upper-secondary-education-in-greece-docx_2026-02-19_0937';
  
  console.log('🚀 Starting Greek Curriculum Import...');
  console.log(`📁 Directory: ${directoryPath}`);
  
  // Resolve path relative to backend directory
  const fullPath = path.join(process.cwd(), directoryPath);
  console.log(`📂 Full path: ${fullPath}`);
  
  // Create NestJS application context
  const app = await NestFactory.createApplicationContext(AppModule);
  const greekParserService = app.get(GreekCurriculumParserService);
  
  try {
    // Process all files in the directory
    const result = await greekParserService.processGreekCurriculumFiles(
      fullPath,
      false, // Don't generate activities yet
    );
    
    console.log('\n✅ Import Complete!');
    console.log('\n📊 Results:');
    console.log(`   Grade Levels: ${result.results.gradeLevels.created} created, ${result.results.gradeLevels.existing} existing`);
    console.log(`   Subjects: ${result.results.subjects.created} created, ${result.results.subjects.existing} existing`);
    console.log(`   Skills: ${result.results.skills.created} created, ${result.results.skills.existing} existing`);
    console.log(`   Topics: ${result.results.topics.created} created, ${result.results.topics.existing} existing`);
    
    if (result.processed.length > 0) {
      console.log(`\n📄 Processed ${result.processed.length} files:`);
      result.processed.forEach(file => console.log(`   - ${file}`));
    }
    
    if (result.results.errors.length > 0) {
      console.log(`\n⚠️  Errors (${result.results.errors.length}):`);
      result.results.errors.forEach(error => console.log(`   - ${error}`));
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

main();

