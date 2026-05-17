import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// GET /api/admin/users - List all users with their workspace memberships (Owner only)
export async function GET() {
  const result = await requireRole("Owner");
  if (result.error) return result.error;

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        full_name: true,
        role: true,
        memberships: {
          select: {
            role: true,
            workspace: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { email: "asc" },
    });

    return NextResponse.json(users);
  } catch (err) {
    console.error("ADMIN_GET_USERS_ERROR", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
