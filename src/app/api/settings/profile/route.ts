import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasMinimumRole } from "@/lib/rbac-utils";
import { sendProfileVerificationEmail, sendEmailChangeVerificationEmail } from "@/lib/email";
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
// Admin/Owner accounts require email verification before the name change is applied.
// Member/Guest accounts are updated immediately.
// Email changes always require verification regardless of role.
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { full_name, image, task_deadline_order, email } = await req.json();

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
    // 1. Check if the task_deadline_order value is passed in the request body.
    // 2. Validate against a list of allowed values ("latest", "oldest", "overdue", "near", "3h", "6h", "12h", "asc", "desc").
    // 3. Update the database record immediately using Prisma.
    if (task_deadline_order !== undefined) {
      const allowedOrders = ["latest", "oldest", "overdue", "near", "3h", "6h", "12h", "asc", "desc"];
      if (allowedOrders.includes(task_deadline_order)) {
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

    // ---- Email change flow ----
    // 1. Validate the new email is different from current.
    // 2. Check that no other account already uses the new email.
    // 3. Create an EmailChangeToken and send a verification link to the new address.
    if (email !== undefined && email.trim() && email.trim().toLowerCase() !== (dbUser.email ?? "").toLowerCase()) {
      const normalizedEmail = email.trim().toLowerCase();

      // Basic email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        return NextResponse.json({ error: "Invalid email format." }, { status: 400 });
      }

      // Check for uniqueness — another user must not already have this email
      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });

      if (existingUser && existingUser.id !== session.user.id) {
        return NextResponse.json(
          { error: "This email is already associated with another account." },
          { status: 409 }
        );
      }

      // Delete any previous pending email change tokens for this user
      await prisma.emailChangeToken.deleteMany({
        where: { user_id: session.user.id },
      });

      // Create a new token with 30-minute expiry
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      await prisma.emailChangeToken.create({
        data: {
          user_id: session.user.id,
          token,
          new_email: normalizedEmail,
          expires_at: expiresAt,
        },
      });

      const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
      const verifyUrl = `${appUrl}/api/auth/verify-email-change?token=${token}`;

      // Send verification email to the NEW email address
      await sendEmailChangeVerificationEmail({
        toEmail: dbUser.email!,
        toName: dbUser.full_name || "there",
        newEmail: normalizedEmail,
        verifyUrl,
      });

      return NextResponse.json({
        emailChangeVerification: true,
        user: dbUser,
      });
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
