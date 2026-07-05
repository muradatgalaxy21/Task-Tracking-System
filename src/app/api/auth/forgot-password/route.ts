import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { sendPasswordResetEmail } from "@/lib/mailer";
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    // Throttle reset requests per IP to prevent email flooding and enumeration probing.
    const rl = await rateLimit("forgot-password", getClientIp(req), 5, 15 * 60);
    if (!rl.success) return tooManyRequests(rl.retryAfter);

    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return new NextResponse("Invalid request", { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Always return success regardless of whether the email exists.
    // This prevents user enumeration (an attacker learns nothing from the response).
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (user) {
      // Remove any existing reset tokens for this address before issuing a new one.
      // This ensures only one active token exists per user at a time.
      await prisma.passwordResetToken.deleteMany({ where: { email: normalizedEmail } });

      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

      await prisma.passwordResetToken.create({
        data: { email: normalizedEmail, token, expires_at: expiresAt },
      });

      const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
      const resetUrl = `${appUrl}/auth/reset-password?token=${token}`;

      await sendPasswordResetEmail(normalizedEmail, resetUrl);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("FORGOT_PASSWORD_ERROR", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
