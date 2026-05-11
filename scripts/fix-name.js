const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fix() {
  const email = 'muradatcorvit23@gmail.com';
  const name = 'Murad';
  
  const user = await prisma.user.update({
    where: { email },
    data: { full_name: name }
  });
  
  console.log(`Updated ${user.email} with name ${user.full_name}`);
  await prisma.$disconnect();
}

fix();
