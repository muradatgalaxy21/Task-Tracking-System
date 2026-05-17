// Run with: npm run admin:seed
// Creates (or resets) the system admin account with Owner role.

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const ADMIN_EMAIL = "admin@aiandbeyond.site";
const ADMIN_PASSCODE = "48726391";

async function main() {
  console.log("Setting up admin account...\n");

  const hashed = await bcrypt.hash(ADMIN_PASSCODE, 10);

  const existing = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
  });

  if (existing) {
    // Reset password and ensure Owner role
    await prisma.user.update({
      where: { email: ADMIN_EMAIL },
      data: { password: hashed, role: "Owner", full_name: "System Admin" },
    });
    console.log("Admin account already existed — password reset and role set to Owner.\n");
  } else {
    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        password: hashed,
        full_name: "System Admin",
        role: "Owner",
      },
    });
    console.log("Admin account created.\n");
  }

  console.log("-------------------------------");
  console.log("  Email:    " + ADMIN_EMAIL);
  console.log("  Passcode: " + ADMIN_PASSCODE);
  console.log("  Role:     Owner");
  console.log("  Panel:    /admin");
  console.log("-------------------------------\n");
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
