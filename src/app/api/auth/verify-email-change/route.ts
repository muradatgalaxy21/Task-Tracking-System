import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidateMembers } from "@/lib/cache";

export const dynamic = "force-dynamic";

// GET /api/auth/verify-email-change?token=XXX
// Validates the single-use token emailed to the user's new address.
// On success: applies the email update, deletes the token, and redirects to settings.
export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const settingsUrl = `${appUrl}/dashboard/settings`;

  // 1. Validate that a token parameter was provided in the URL.
  if (!token) {
    return NextResponse.redirect(`${settingsUrl}?verify=invalid`);
  }

  try {
    // 2. Look up the email change token in the database.
    const record = await prisma.emailChangeToken.findUnique({ where: { token } });

    // 3. Check if the token exists and has not expired.
    if (!record || record.expires_at < new Date()) {
      if (record) {
        await prisma.emailChangeToken.delete({ where: { token } });
      }
      return NextResponse.redirect(`${settingsUrl}?verify=expired`);
    }

    // 4. Verify the new email is not already taken by another account.
    const existingUser = await prisma.user.findUnique({
      where: { email: record.new_email },
      select: { id: true },
    });

    if (existingUser && existingUser.id !== record.user_id) {
      // 5. If email is now taken, delete the token and redirect with error.
      await prisma.emailChangeToken.delete({ where: { token } });
      return NextResponse.redirect(`${settingsUrl}?verify=email-taken`);
    }

    // 6. Apply the email change and consume the token atomically.
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.user_id },
        data: { email: record.new_email },
      }),
      prisma.emailChangeToken.delete({ where: { token } }),
    ]);

    // 7. Bust cached member lists so the updated email shows immediately.
    revalidateMembers();

    return NextResponse.redirect(`${settingsUrl}?verify=email-success`);
  } catch (err) {
    console.error("VERIFY_EMAIL_CHANGE_ERROR", err);
    return NextResponse.redirect(`${settingsUrl}?verify=error`);
  }
}
