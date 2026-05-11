const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany();
  console.log('--- Users in Database ---');
  users.forEach(u => {
    console.log(`ID: ${u.id} | Email: ${u.email} | Name: ${u.full_name} | Role: ${u.role}`);
  });
  await prisma.$disconnect();
}

check();
