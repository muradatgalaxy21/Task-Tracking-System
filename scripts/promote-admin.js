const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function promote() {
  const email = process.argv[2];
  if (!email) {
    console.error('Please provide an email address: node scripts/promote-admin.js user@example.com');
    process.exit(1);
  }

  try {
    const user = await prisma.user.update({
      where: { email },
      data: { role: 'Admin' },
    });
    console.log(`Success! User ${user.email} has been promoted to Admin.`);
  } catch (error) {
    console.error('Error promoting user:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

promote();
