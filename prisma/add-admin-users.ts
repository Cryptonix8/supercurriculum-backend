// Script to add admin and teacher users to existing database

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔑 Adding admin and teacher users...');
  console.log('');

  // Check if admin user already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'admin@supercurriculum.org' },
  });

  if (existingAdmin) {
    console.log('⚠️  Admin user already exists - updating password...');
    // Update with correct password hash
    await prisma.user.update({
      where: { email: 'admin@supercurriculum.org' },
      data: {
        password: '$2b$10$DqyGZs4QJeTUeVuMT5gMfuIvjx7SEr4MVvr2.GEIjiU5W8mJTI/5u', // password: Demo1234
      },
    });
    console.log('✅ Updated admin password');
  } else {
    await prisma.user.create({
      data: {
        email: 'admin@supercurriculum.org',
        password: '$2b$10$DqyGZs4QJeTUeVuMT5gMfuIvjx7SEr4MVvr2.GEIjiU5W8mJTI/5u', // password: Demo1234
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        isActive: true,
      },
    });
    console.log('✅ Created admin user');
  }

  // Check if teacher user already exists
  const existingTeacher = await prisma.user.findUnique({
    where: { email: 'teacher@supercurriculum.org' },
  });

  if (existingTeacher) {
    console.log('⚠️  Teacher user already exists - updating password...');
    // Update with correct password hash
    await prisma.user.update({
      where: { email: 'teacher@supercurriculum.org' },
      data: {
        password: '$2b$10$DqyGZs4QJeTUeVuMT5gMfuIvjx7SEr4MVvr2.GEIjiU5W8mJTI/5u', // password: Demo1234
      },
    });
    console.log('✅ Updated teacher password');
  } else {
    await prisma.user.create({
      data: {
        email: 'teacher@supercurriculum.org',
        password: '$2b$10$DqyGZs4QJeTUeVuMT5gMfuIvjx7SEr4MVvr2.GEIjiU5W8mJTI/5u', // password: Demo1234
        firstName: 'Jane',
        lastName: 'Teacher',
        role: 'TEACHER',
        isActive: true,
      },
    });
    console.log('✅ Created teacher user');
  }

  console.log('');
  console.log('='.repeat(50));
  console.log('📧 Admin Panel Credentials:');
  console.log('='.repeat(50));
  console.log('');
  console.log('👨‍💼 Admin Account:');
  console.log('  Email: admin@supercurriculum.org');
  console.log('  Password: Demo1234');
  console.log('');
  console.log('👩‍🏫 Teacher Account:');
  console.log('  Email: teacher@supercurriculum.org');
  console.log('  Password: Demo1234');
  console.log('');
  console.log('='.repeat(50));
  console.log('');
  console.log('✅ Done! You can now sign in to the admin panel.');
}

main()
  .catch((e) => {
    console.error('Error adding admin users:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

