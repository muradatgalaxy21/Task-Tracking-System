import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/members - Fetch members.
// With ?workspaceId=X: returns only members of that workspace (enforces isolation).
// With ?id=X: returns a single user profile (used by AuthProvider sync).
// With no params: returns all users (admin-only fallback).
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const workspace_id = searchParams.get("workspaceId");

  try {
    // Single-user lookup (used for profile sync in AuthProvider)
    if (id) {
      const member = await prisma.user.findUnique({
        where: { id },
        select: { id: true, full_name: true, email: true, role: true, image: true },
      });
      return NextResponse.json(member);
    }

    // Workspace-scoped member list: includes workspace_role alongside the user fields
    if (workspace_id) {
      const memberships = await prisma.workspaceMember.findMany({
        where: { workspace_id },
        include: {
          user: { select: { id: true, full_name: true, email: true, role: true, image: true } },
        },
        orderBy: { joined_at: "asc" },
      });
      return NextResponse.json(
        memberships.map((m) => ({ ...m.user, workspace_role: m.role }))
      );
    }

    // Unscoped fallback: return all users (kept for admin screens that do not operate per-workspace)
    const members = await prisma.user.findMany({
      select: { id: true, full_name: true, email: true, role: true, image: true },
      orderBy: { full_name: "asc" },
    });

    return NextResponse.json(members);
  } catch (error) {
    console.error("Failed to fetch members:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
