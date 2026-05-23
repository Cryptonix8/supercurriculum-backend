import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createAdmin() {
  console.log('🔧 Creating Admin User...\n');

  const email = process.argv[2] || 'admin@school.com';
  const password = process.argv[3] || 'Admin123!';
  const firstName = process.argv[4] || 'Admin';
  const lastName = process.argv[5] || 'User';

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      console.log(`❌ User with email ${email} already exists!`);
      console.log(`   User ID: ${existingUser.id}`);
      console.log(`   Role: ${existingUser.role}`);
      
      // If user exists but is not admin, update to admin
      if (existingUser.role !== 'ADMIN') {
        console.log('\n🔄 Updating user role to ADMIN...');
        const updated = await prisma.user.update({
          where: { id: existingUser.id },
          data: { role: 'ADMIN', isActive: true },
        });
        console.log(`✅ User role updated to ADMIN!`);
        console.log(`\n📧 Email: ${updated.email}`);
        console.log(`👤 Name: ${updated.firstName} ${updated.lastName}`);
        console.log(`🔑 Role: ${updated.role}`);
      } else {
        console.log('\n✅ User is already an ADMIN!');
      }
      
      process.exit(0);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin user
    const admin = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        role: 'ADMIN',
        isActive: true,
      },
    });

    console.log('✅ Admin user created successfully!\n');
    console.log('📧 Email:', email);
    console.log('🔑 Password:', password);
    console.log('👤 Name:', `${firstName} ${lastName}`);
    console.log('🆔 User ID:', admin.id);
    console.log('\n⚠️  Make sure to change the password after first login!\n');
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();

