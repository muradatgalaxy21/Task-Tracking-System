// Server-only DB-backed fixed-window rate limiter.
//
// A counter row per "<bucket>:<identifier>" tracks how many requests landed in
// the current window. The DB store (not in-memory) is deliberate: serverless
// functions are short-lived and horizontally scaled, so an in-process counter
// would reset on every cold start and never actually limit anything.

import { prisma } from "@/lib/prisma";

export type RateLimitResult = {
  success: boolean; // true when the request is under the limit
  remaining: number; // requests left in the current window
  retryAfter: number; // seconds until the window resets (0 when allowed)
};

// Consume one unit against `bucket:identifier`. Allows up to `limit` requests
// per `windowSeconds`. Fails open (allows the request) if the store errors, so
// a limiter outage never locks users out of authentication.
export async function rateLimit(
  bucket: string,
  identifier: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const key = `${bucket}:${identifier}`;
  const now = new Date();

  try {
    const existing = await prisma.rateLimit.findUnique({ where: { key } });

    // No window yet, or the previous window has elapsed: start a fresh one.
    if (!existing || existing.expires_at <= now) {
      const expires_at = new Date(now.getTime() + windowSeconds * 1000);
      await prisma.rateLimit.upsert({
        where: { key },
        update: { count: 1, expires_at },
        create: { key, count: 1, expires_at },
      });
      return { success: true, remaining: limit - 1, retryAfter: 0 };
    }

    // Window is still open and the limit is already spent: reject.
    if (existing.count >= limit) {
      const retryAfter = Math.ceil((existing.expires_at.getTime() - now.getTime()) / 1000);
      return { success: false, remaining: 0, retryAfter };
    }

    // Otherwise increment the counter within the current window.
    const updated = await prisma.rateLimit.update({
      where: { key },
      data: { count: { increment: 1 } },
    });
    return { success: true, remaining: Math.max(0, limit - updated.count), retryAfter: 0 };
  } catch (err) {
    // Fail open: an infrastructure problem must not block legitimate logins.
    console.error("Rate limiter store error:", err);
    return { success: true, remaining: limit, retryAfter: 0 };
  }
}

// Best-effort client IP from proxy headers (Vercel sets x-forwarded-for).
// Falls back to a constant so the limiter still applies per-route when the
// header is absent, rather than silently disabling itself.
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

// Standard 429 response with a Retry-After header.
export function tooManyRequests(retryAfter: number): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please try again later." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    }
  );
}
