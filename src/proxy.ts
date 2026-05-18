// -------------------------------------------------------------------
// NextAuth Protection Proxy (Next.js 16+ convention)
// Redirects unauthenticated users away from protected routes.
// -------------------------------------------------------------------

import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// In Next.js 16, the middleware function must be exported as 'proxy'
export const proxy = withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const isAuth = !!token;
    const isOnboardingPage = req.nextUrl.pathname.startsWith('/onboarding');
    const hasName = !!token?.full_name;

    // Force onboarding if authenticated but no name set
    if (isAuth && !hasName && !isOnboardingPage) {
      const url = new URL('/onboarding', req.url);
      return NextResponse.redirect(url);
    }

    // Prevent access to onboarding if already onboarded
    if (isAuth && hasName && isOnboardingPage) {
      const url = new URL('/dashboard', req.url);
      return NextResponse.redirect(url);
    }

    // Prevent browser from caching protected pages so back-button after logout
    // never shows a stale dashboard UI.
    const res = NextResponse.next();
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.headers.set("Pragma", "no-cache");
    return res;
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  // Only intercept routes that require authentication.
  // Login, signup, and all API/auth routes are intentionally excluded
  // so unauthenticated users can always reach the login page.
  matcher: ["/dashboard/:path*", "/admin/:path*", "/onboarding"],
};
