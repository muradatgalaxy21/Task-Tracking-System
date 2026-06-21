import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/settings/accept-policy
// Updates the authenticated user's profile to record that they accepted the privacy policy.
export async function POST() {
  // 1. Authenticate the caller session. If not logged in, reject with 401.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = session.user.id;

    // 2. Perform database update to record that the privacy policy was accepted.
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        accepted_privacy_policy: true,
      },
      select: {
        id: true,
        accepted_privacy_policy: true,
      },
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Failed to record privacy policy acceptance:", error);
    return NextResponse.json(
      { error: "Failed to record privacy policy acceptance inside the database" },
      { status: 500 }
    );
  }
}
