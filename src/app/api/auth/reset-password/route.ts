import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";

// Checks whether a reset token is still valid without consuming it.
// The reset password page calls this on mount so it can show an expired-link
// message before the user fills out the form.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ valid: false, error: "Missing token" }, { status: 400 });
  }

  const record = await prisma.passwordResetToken.findUnique({ where: { token } });

  if (!record || record.expires_at < new Date()) {
    return NextResponse.json({ valid: false, error: "Token is invalid or has expired" });
  }

  return NextResponse.json({ valid: true });
}

// Validates the token and applies the new password.
// The token is deleted immediately after a successful update so it cannot be reused.
export async function POST(req: Request) {
  try {
    // Throttle reset submissions per IP to prevent token brute-forcing.
    const rl = await rateLimit("reset-password", getClientIp(req), 10, 15 * 60);
    if (!rl.success) return tooManyRequests(rl.retryAfter);

    const { token, password } = await req.json();

    if (!token || !password) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    if (password.length < 8) {
      return new NextResponse("Password must be at least 8 characters", { status: 400 });
    }

    const record = await prisma.passwordResetToken.findUnique({ where: { token } });

    if (!record || record.expires_at < new Date()) {
      return new NextResponse("Token is invalid or has expired", { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // Update the password and delete the token atomically.
    // This guarantees the token cannot be reused even if the client retries.
    // Stamping password_changed_at invalidates every JWT issued before now.
    await prisma.$transaction([
      prisma.user.update({
        where: { email: record.email },
        data: { password: hashedPassword, password_changed_at: new Date() },
      }),
      prisma.passwordResetToken.delete({ where: { token } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("RESET_PASSWORD_ERROR", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
