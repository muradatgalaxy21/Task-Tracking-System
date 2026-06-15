import { resend, buildFrom, isEmailConfigured } from "@/lib/resend";

// Sends a password reset email.
// If Resend is not configured, the link is printed to the server console (dev fallback).
// Errors are logged and swallowed — the caller has already issued the reset token, so a
// delivery failure should not turn into a 500 for the user.
export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  if (!isEmailConfigured()) {
    console.log(`[PASSWORD RESET] Token link for ${email}: ${resetUrl}`);
    return;
  }

  try {
    const { error } = await resend.emails.send({
      from: buildFrom("AI & Beyond"),
      to: email,
      subject: "Reset your password - AI and Beyond",
      html: `
      <p>You requested a password reset for your AI and Beyond account.</p>
      <p>Click the link below to set a new password. This link expires in 15 minutes and can only be used once.</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>If you did not request this, you can safely ignore this email. Your password will not change.</p>
    `,
    });
    if (error) {
      console.error("sendPasswordResetEmail failed:", error);
    }
  } catch (err) {
    console.error("sendPasswordResetEmail failed:", err);
  }
}
