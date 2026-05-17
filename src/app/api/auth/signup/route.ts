import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

export async function POST(req: Request) {
  try {
    const { email, password, workspaceName, inviteCode } = await req.json();

    if (!email || !password) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    if (password.length < 8) {
      return new NextResponse("Password must be at least 8 characters", { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return new NextResponse("Email already exists", { status: 400 });
    }

    // Validate the invite code before creating the user to avoid partial state
    let targetWorkspace = null;
    if (inviteCode) {
      targetWorkspace = await prisma.workspace.findUnique({
        where: { invite_code: inviteCode.trim() },
      });
      if (!targetWorkspace) {
        return new NextResponse("Invalid invite code", { status: 400 });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { email, password: hashedPassword },
    });

    // New workspace: user becomes the Owner
    if (workspaceName && !inviteCode) {
      await prisma.workspace.create({
        data: {
          name: workspaceName.trim(),
          created_by: user.id,
          invite_code: randomUUID(),
          members: {
            create: { user_id: user.id, role: "Owner" },
          },
        },
      });
    }

    // Joining an existing workspace: user enters as a Member
    if (targetWorkspace) {
      await prisma.workspaceMember.create({
        data: {
          workspace_id: targetWorkspace.id,
          user_id: user.id,
          role: "Member",
        },
      });
    }

    return NextResponse.json({ id: user.id, email: user.email });
  } catch (error) {
    console.error("SIGNUP_ERROR", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
