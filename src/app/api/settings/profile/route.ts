import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasMinimumRole } from "@/lib/rbac-utils";
import { sendProfileVerificationEmail } from "@/lib/email";
import { revalidateMembers } from "@/lib/cache";
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
    select: { id: true, full_name: true, email: true, role: true, image: true, task_deadline_order: true, accepted_privacy_policy: true },
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
    const { full_name, image, task_deadline_order } = await req.json();

    // 1. Update image immediately if provided (bypasses email verification)
    if (image !== undefined) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { image: image ? image.trim() : null },
      });
      // Bust cached member lists so the new avatar shows in member/partner views
      revalidateMembers();
    }

    // 1.1. Update task_deadline_order immediately if provided (bypasses email verification)
    if (task_deadline_order !== undefined) {
      if (task_deadline_order === "asc" || task_deadline_order === "desc") {
        await prisma.user.update({
          where: { id: session.user.id },
          data: { task_deadline_order },
        });
      }
    }

    // Fetch user to check current role and compare name
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, email: true, full_name: true, image: true },
    });

    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // If no name is provided, or the name hasn't changed, return success immediately
    if (full_name === undefined || full_name.trim() === (dbUser.full_name ?? "")) {
      return NextResponse.json({ success: true, user: dbUser });
    }

    if (!full_name.trim()) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }

    // Admin and Owner accounts must verify the name change via email
    if (hasMinimumRole(dbUser.role, "Admin")) {
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

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

      return NextResponse.json({ needsVerification: true, user: dbUser });
    }

    // Member/Guest: apply directly
    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: { full_name: full_name.trim() },
      select: { id: true, full_name: true, email: true, role: true, image: true, task_deadline_order: true, accepted_privacy_policy: true },
    });

    // Bust cached member lists so the new name shows in member/partner views
    revalidateMembers();

    return NextResponse.json({ success: true, user: updated });
  } catch (err) {
    console.error("PATCH_PROFILE_ERROR", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
