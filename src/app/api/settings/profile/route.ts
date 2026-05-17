import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasMinimumRole } from "@/lib/rbac-utils";
import { sendProfileVerificationEmail } from "@/lib/email";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

// GET /api/settings/profile - Return the current user's profile data
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, full_name: true, email: true, role: true, image: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(user);
}

// PATCH /api/settings/profile - Update the current user's profile.
// Admin/Owner accounts require email verification before the change is applied.
// Member/Guest accounts are updated immediately.
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { full_name } = await req.json();

    if (!full_name?.trim()) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, email: true, full_name: true },
    });

    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Admin and Owner accounts must verify the change via email before it is applied
    if (hasMinimumRole(dbUser.role, "Admin")) {
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      // Replace any existing pending token for this user
      await prisma.profileVerificationToken.deleteMany({
        where: { user_id: session.user.id },
      });

      await prisma.profileVerificationToken.create({
        data: {
          user_id: session.user.id,
          token,
          payload: JSON.stringify({ full_name: full_name.trim() }),
          expires_at: expiresAt,
        },
      });

      const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
      const verifyUrl = `${appUrl}/api/auth/verify-profile-update?token=${token}`;

      await sendProfileVerificationEmail({
        toEmail: dbUser.email!,
        toName: dbUser.full_name || "there",
        verifyUrl,
      });

      return NextResponse.json({ needsVerification: true });
    }

    // Member/Guest: apply directly
    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: { full_name: full_name.trim() },
      select: { id: true, full_name: true, email: true, role: true },
    });

    return NextResponse.json({ success: true, user: updated });
  } catch (err) {
    console.error("PATCH_PROFILE_ERROR", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
