import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// GET /api/admin/attendance - All attendance records with user and workspace info (Owner only).
// Supports ?workspaceId=X to filter records to users in that workspace, and ?date=YYYY-MM-DD.
export async function GET(req: Request) {
  const result = await requireRole("Owner");
  if (result.error) return result.error;

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  const date = searchParams.get("date");

  try {
    const records = await prisma.dailyAttendance.findMany({
      where: {
        AND: [
          date ? { date: new Date(date) } : {},
          // Restrict to users who are members of the given workspace when filter is set
          workspaceId
            ? { user: { memberships: { some: { workspace_id: workspaceId } } } }
            : {},
        ],
      },
      orderBy: { date: "desc" },
      include: {
        user: {
          select: {
            full_name: true,
            email: true,
            memberships: {
              select: {
                workspace: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    return NextResponse.json(records);
  } catch (err) {
    console.error("ADMIN_GET_ATTENDANCE_ERROR", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
