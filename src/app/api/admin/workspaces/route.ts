import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// GET /api/admin/workspaces - List all workspaces with member count (Owner only)
export async function GET() {
  const result = await requireRole("Owner");
  if (result.error) return result.error;

  try {
    const workspaces = await prisma.workspace.findMany({
      select: {
        id: true,
        name: true,
        invite_code: true,
        created_at: true,
        _count: { select: { members: true } },
      },
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json(workspaces);
  } catch (err) {
    console.error("ADMIN_GET_WORKSPACES_ERROR", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
