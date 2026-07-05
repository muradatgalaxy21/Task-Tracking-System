// In-memory cache for a user's global role (User.role).
//
// The NextAuth `session` callback re-fetches this on every request so JWTs
// never carry stale permissions (see AGENTS.md / auth.ts). That is correct
// for security but means a DB round trip on every page load. This cache
// keeps that guarantee within a short TTL instead of on every request.
//
// Cache is per-runtime-instance (module scope on globalThis, like the Prisma
// singleton). On a cold start or a different warm instance the cache starts
// empty and falls back to the DB, so correctness never depends on it. After
// an explicit role change, invalidateRoleCache clears the entry on the
// instance handling that request immediately; other warm instances pick up
// the new role within ROLE_CACHE_TTL_MS.

import { prisma } from "@/lib/prisma";

const ROLE_CACHE_TTL_MS = 30_000;

// passwordChangedAt is cached alongside the role so the session callback can
// reject stale JWTs (issued before a password reset) without a second DB read.
type CacheEntry = { role: string; passwordChangedAt: number | null; expiresAt: number };

export type CachedAuthState = { role: string; passwordChangedAt: number | null };

const globalForRoleCache = global as unknown as {
  roleCache?: Map<string, CacheEntry>;
};

const cache = globalForRoleCache.roleCache ?? new Map<string, CacheEntry>();
globalForRoleCache.roleCache = cache;

// Returns the user's role and last password-change time, using the cached value
// if it has not expired. Returns null if the user no longer exists.
export async function getCachedAuthState(userId: string): Promise<CachedAuthState | null> {
  const entry = cache.get(userId);
  if (entry && entry.expiresAt > Date.now()) {
    return { role: entry.role, passwordChangedAt: entry.passwordChangedAt };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, password_changed_at: true },
  });

  if (!dbUser) {
    cache.delete(userId);
    return null;
  }

  const passwordChangedAt = dbUser.password_changed_at?.getTime() ?? null;
  cache.set(userId, {
    role: dbUser.role,
    passwordChangedAt,
    expiresAt: Date.now() + ROLE_CACHE_TTL_MS,
  });
  return { role: dbUser.role, passwordChangedAt };
}

// Returns the user's current global role, using the cached value if it has
// not expired. Returns null if the user no longer exists.
export async function getCachedRole(userId: string): Promise<string | null> {
  const state = await getCachedAuthState(userId);
  return state?.role ?? null;
}

// Clears the cached role for a user. Call this immediately after any direct
// update to User.role so the change is reflected without waiting for the TTL.
export function invalidateRoleCache(userId: string): void {
  cache.delete(userId);
}
