import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// PATCH /api/user/update
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { full_name, dob } = body;

    if (!full_name || typeof full_name !== "string" || full_name.trim().length === 0) {
      return NextResponse.json({ error: "Full name is required" }, { status: 400 });
    }

    const dataToUpdate: any = { full_name: full_name.trim() };
    if (dob) {
      dataToUpdate.dob = new Date(dob);
    }

    console.log(`Updating user ${session.user.id} with name: ${full_name}`);
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: dataToUpdate,
    });
    console.log(`Update successful: ${updatedUser.full_name}`);

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Failed to update user:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
