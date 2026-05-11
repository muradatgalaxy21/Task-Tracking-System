import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return new NextResponse("Email is required", { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true }
    });

    return NextResponse.json({ exists: !!user });
  } catch (error) {
    console.error("CHECK_EMAIL_ERROR", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
