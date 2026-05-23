/**
 * Reset Database and Initialize from PDFs
 * 
 * This script:
 * 1. Clears all curriculum-related data (topics, activities, supercurriculum activities)
 * 2. Keeps year groups, subjects, skills, and users
 * 3. Processes all PDFs to generate topics and activities
 * 
 * Usage: npm run reset-from-pdfs
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Resetting curriculum data and initializing from PDFs...\n');

  try {
    // Step 1: Delete curriculum-related data
    console.log('🗑️  Clearing existing curriculum data...');
    
    const deletedSupercurriculum = await prisma.supercurriculumActivity.deleteMany({});
    console.log(`  ✓ Deleted ${deletedSupercurriculum.count} supercurriculum activities`);

    const deletedTopics = await prisma.curriculumTopic.deleteMany({});
    console.log(`  ✓ Deleted ${deletedTopics.count} curriculum topics`);

    const deletedActivities = await prisma.activity.deleteMany({});
    console.log(`  ✓ Deleted ${deletedActivities.count} activities`);

    const deletedStandards = await prisma.curriculumStandard.deleteMany({});
    console.log(`  ✓ Deleted ${deletedStandards.count} curriculum standards`);

    console.log('\n✅ Database cleared. Ready for PDF processing.\n');
    console.log('📄 The auto-init service will process PDFs on next backend startup.');
    console.log('   Or you can trigger it via the API endpoint:\n');
    console.log('   POST /api/curriculum-parser/process-existing');
    console.log('   Body: { "generateActivities": true }\n');

  } catch (error) {
    console.error('❌ Error resetting database:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('❌ Script failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
