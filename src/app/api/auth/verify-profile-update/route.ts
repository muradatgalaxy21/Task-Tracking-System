import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidateMembers } from "@/lib/cache";

export const dynamic = "force-dynamic";

// GET /api/auth/verify-profile-update?token=XXX
// Validates the single-use token emailed to Admin/Owner users when they change their profile.
// On success: applies the queued update, deletes the token, and redirects to the settings page.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const settingsUrl = `${appUrl}/dashboard/settings`;

  if (!token) {
    return NextResponse.redirect(`${settingsUrl}?verify=invalid`);
  }

  try {
    const record = await prisma.profileVerificationToken.findUnique({ where: { token } });

    if (!record || record.expires_at < new Date()) {
      if (record) {
        await prisma.profileVerificationToken.delete({ where: { token } });
      }
      return NextResponse.redirect(`${settingsUrl}?verify=expired`);
    }

    let payload: Record<string, string>;
    try {
      payload = JSON.parse(record.payload);
    } catch {
      await prisma.profileVerificationToken.delete({ where: { token } });
      return NextResponse.redirect(`${settingsUrl}?verify=invalid`);
    }

    // Apply the update and consume the token atomically
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.user_id },
        data: { full_name: payload.full_name },
      }),
      prisma.profileVerificationToken.delete({ where: { token } }),
    ]);

    // Bust cached member lists so the verified name change shows in member/partner views
    revalidateMembers();

    return NextResponse.redirect(`${settingsUrl}?verify=success`);
  } catch (err) {
    console.error("VERIFY_PROFILE_UPDATE_ERROR", err);
    return NextResponse.redirect(`${settingsUrl}?verify=error`);
  }
}
