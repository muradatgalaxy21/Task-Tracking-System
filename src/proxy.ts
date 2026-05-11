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
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    // Protect dashboard, onboarding
    "/dashboard/:path*",
    "/onboarding",
    // Exclude login and static files
    "/((?!login|api/auth|api/user|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
