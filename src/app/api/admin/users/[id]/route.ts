import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";

const VALID_ROLES = ["Owner", "Admin", "Member", "Guest"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

// PATCH /api/admin/users/[id] - Update a user's global role (Owner only)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole("Owner");
  if (result.error) return result.error;

  try {
    const { id } = await params;
    const { role } = await req.json();

    if (!VALID_ROLES.includes(role as ValidRole)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, email: true, role: true },
    });

    return NextResponse.json(user);
  } catch (err) {
    console.error("ADMIN_UPDATE_USER_ERROR", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
