import { auth } from "./auth";
import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/auth/helpers";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAdminApi = pathname.startsWith("/api/admin");
  const isAdminRoute = pathname.startsWith("/admin");
  const isLoginPage = pathname === "/admin/login";
  const isAccessDenied = pathname === "/admin/access-denied";
  const isAuthApi = pathname.startsWith("/api/auth");

  // Never block auth API routes
  if (isAuthApi) return NextResponse.next();

  // CRITICAL (review concern HIGH): /api/admin/* routes ALWAYS pass through to
  // route handlers. The proxy must NOT redirect API requests -- route handlers
  // are the authoritative gate returning JSON 401/403 via requireAdmin().
  if (isAdminApi) return NextResponse.next();

  // Admin page routes need session check
  if (isAdminRoute) {
    if (!req.auth) {
      // Unauthenticated -> login page (D-07), except login/access-denied pass through
      if (isLoginPage || isAccessDenied) return NextResponse.next();
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }

    const isAdmin = isAdminEmail(req.auth.user?.email);

    // Authenticated admin on login page -> redirect to admin dashboard (D-03)
    if (isLoginPage && isAdmin) {
      return NextResponse.redirect(new URL("/admin", req.url));
    }

    // Authenticated non-admin on login page -> redirect to access denied
    // (review concern MEDIUM: non-admin login-page bypass fix from OpenCode)
    if (isLoginPage && !isAdmin) {
      return NextResponse.redirect(new URL("/admin/access-denied", req.url));
    }

    // Authenticated non-admin on any other admin route -> access denied (D-06)
    if (!isAdmin && !isAccessDenied) {
      return NextResponse.redirect(new URL("/admin/access-denied", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
