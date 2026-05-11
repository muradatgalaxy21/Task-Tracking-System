import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/workspaces - Fetch all workspaces for the current user
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workspaces = await prisma.workspace.findMany({
      where: {
        members: {
          some: {
            user_id: session.user.id,
          },
        },
      },
      include: {
        pages: true,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    return NextResponse.json(workspaces);
  } catch (error) {
    console.error("Failed to fetch workspaces:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/workspaces - Create a new workspace
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, description } = await req.json();

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const workspace = await prisma.workspace.create({
      data: {
        name,
        description: description || "",
        created_by: session.user.id,
        members: {
          create: {
            user_id: session.user.id,
            role: "Admin",
          },
        },
      },
    });

    return NextResponse.json(workspace);
  } catch (error) {
    console.error("Failed to create workspace:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
