# Phase 8: Authentication - Research

**Researched:** 2026-04-12
**Domain:** OAuth authentication with Auth.js v5, Next.js 16 App Router, Google provider
**Confidence:** MEDIUM (Auth.js v5 still in beta, Next.js 16 proxy.ts is new -- known compatibility issues documented)

## Summary

Phase 8 adds Google OAuth authentication to protect the admin panel. The stack is Auth.js v5 (next-auth@beta, currently 5.0.0-beta.30) with the Google provider, using JWT sessions (no database session table). Next.js 16 has renamed `middleware.ts` to `proxy.ts` and the exported function from `middleware` to `proxy` -- this is a breaking change that Auth.js v5 supports but requires specific export patterns.

The architecture follows a three-layer protection model: (1) `proxy.ts` for optimistic cookie-based redirects on `/admin` routes, (2) `auth()` calls in Server Components and Route Handlers for authoritative session verification, and (3) per-route admin email checks comparing `session.user.email` against the `ADMIN_EMAIL` env var. Auth.js v5 handles OAuth flow, JWT signing, and session cookies automatically -- the project only needs configuration, not custom crypto.

**Primary recommendation:** Use `next-auth@beta` (5.0.0-beta.30) with Google provider, JWT strategy, and a single `auth.ts` config file. Use `proxy.ts` for route-level redirect protection. Use `auth()` in each admin page/route for authoritative checks. Avoid `signIn()` server action due to known Next.js 16 bug -- use direct form POST to Auth.js sign-in endpoint instead.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Branded login page at `/admin/login` -- store name/logo, "Sign in with Google" button, and "Only authorized admins can access this" message. Matches storefront visual style (same Geist font, color palette).
- **D-02:** Login page includes a small "Back to store" link below the sign-in button for anyone who stumbles on the URL.
- **D-03:** After successful Google sign-in, admin redirects to `/admin` (the admin dashboard placeholder).
- **D-04:** Single `ADMIN_EMAIL` environment variable holds the authorized admin email. Only this Google account gets admin access. Change requires redeploy.
- **D-05:** Auth check compares the authenticated Google email against `ADMIN_EMAIL` -- simple string equality.
- **D-06:** Non-admin Google accounts see an "Access Denied" page showing their email address, with "Sign out" and "Back to store" links. Clear message that the area is restricted to the store admin.
- **D-07:** Unauthenticated visitors to `/admin` see the branded login page (no 404 obfuscation -- friend store, no need to hide).
- **D-08:** Admin API routes (`/api/admin/*`) return JSON errors: 401 `{ error: "Unauthorized" }` for no session, 403 `{ error: "Forbidden" }` for non-admin accounts.
- **D-09:** Basic admin layout with a header: store name, "Admin" badge, and sign-out button. Content area renders child routes (placeholder for now, Phase 9+ fills in).
- **D-10:** No sidebar navigation in Phase 8 -- just header + content area. Sidebar or nav links added as admin features are built in later phases.
- **D-11:** Small "Admin" text link added to the public storefront footer -- gives the admin a way to navigate to `/admin` from the store.
- **D-12:** The `/admin` page shows a welcome message with the admin's name (from Google profile) and "Inventory management coming soon." Clean placeholder until Phase 9.
- **D-13:** Admin sessions last 30 days before requiring re-login. Persistent cookie survives browser restarts.
- **D-14:** Session stored as JWT (no database session table needed -- single admin user, simplicity wins).
- **D-15:** OAuth failures (network error, callback error) redirect back to the login page with a simple "Sign-in failed. Try again." message. No dedicated error page.
- **D-16:** App name on Google OAuth consent screen: "Viki MTG Store".

### Claude's Discretion
- Auth.js v5 configuration details and Next.js 16 integration approach (proxy.ts, middleware, route handlers)
- Route protection mechanism (middleware vs layout-level auth checks vs per-page)
- JWT signing strategy and secret management
- Whether to use Auth.js `authorized` callback vs custom middleware for admin check
- Admin layout component structure and Tailwind styling details

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | Admin panel protected by Google OAuth (Auth.js v5) | Auth.js v5 Google provider config, proxy.ts route protection, auth() server-side checks |
| AUTH-02 | Only the seller's Google account has admin access | JWT callback adds email to session, `authorized` callback or layout-level check compares against ADMIN_EMAIL env var |
| AUTH-03 | Admin API routes reject unauthenticated requests | auth() in Route Handlers returns session or null; 401/403 JSON responses per D-08 |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next-auth (Auth.js v5) | 5.0.0-beta.30 | OAuth flow, JWT sessions, session management | Official Auth.js integration for Next.js; handles OAuth complexity, CSRF, cookie management [VERIFIED: npm registry] |
| @auth/core | 0.41.0 (transitive) | Core auth logic used by next-auth | Internal dependency, installed automatically [VERIFIED: npm registry] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| next (existing) | 16.2.2 | Framework, proxy.ts support | Already installed [VERIFIED: package.json] |
| server-only (existing) | 0.0.1 | Guard server-only code from client bundles | Already installed [VERIFIED: package.json] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Auth.js v5 (beta) | Custom OAuth + jose (JWT) | Full control but must hand-roll CSRF, cookie management, OAuth state, callback handling -- high complexity for low value |
| Auth.js v5 (beta) | better-auth | Newer library with good DX, but Auth.js is the locked decision from requirements (AUTH-01 specifies Auth.js v5) |
| Auth.js v5 (beta) | Auth.js v4 (stable) | v4 is stable but does not support Next.js 16 proxy.ts, App Router patterns, or modern auth() API |

**Installation:**
```bash
npm install next-auth@beta
```

**Version verification:** `next-auth@beta` resolves to `5.0.0-beta.30` [VERIFIED: npm registry 2026-04-12]. Peer dependencies include `next@^14.0.0-0 || ^15.0.0 || ^16.0.0` -- compatible with project's Next.js 16.2.2. [VERIFIED: npm view next-auth@beta peerDependencies]

## Architecture Patterns

### Recommended Project Structure
```
src/
├── auth.ts                          # Auth.js v5 config (NextAuth + Google provider)
├── proxy.ts                         # Route protection (replaces middleware.ts)
├── app/
│   ├── layout.tsx                   # Root layout (unchanged)
│   ├── page.tsx                     # Storefront home (add footer "Admin" link)
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...nextauth]/
│   │   │       └── route.ts         # Auth.js route handler (GET + POST)
│   │   ├── admin/                   # Future admin API routes (Phase 9+)
│   │   │   └── (example)/route.ts   # Each checks auth() + admin email
│   │   └── checkout/route.ts        # Existing (unchanged)
│   └── admin/
│       ├── layout.tsx               # Admin layout (header + auth guard)
│       ├── page.tsx                 # Admin dashboard placeholder
│       ├── login/
│       │   └── page.tsx             # Branded login page
│       └── access-denied/
│           └── page.tsx             # Access denied page (non-admin users)
├── lib/
│   └── auth/
│       └── admin-check.ts           # Helper: verify admin session for API routes
```

### Pattern 1: Auth.js v5 Configuration (auth.ts)

**What:** Single file at `src/auth.ts` that exports `handlers`, `auth`, `signIn`, `signOut`. [CITED: authjs.dev/reference/nextjs]

**When to use:** Always -- this is the centralized auth configuration.

**Example:**
```typescript
// Source: authjs.dev/reference/nextjs + authjs.dev/getting-started/migrating-to-v5
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days (D-13)
  },
  pages: {
    signIn: "/admin/login",   // Custom login page (D-01)
    error: "/admin/login",     // OAuth errors redirect to login (D-15)
  },
  callbacks: {
    async jwt({ token, profile }) {
      // Persist Google email and name in JWT
      if (profile) {
        token.email = profile.email;
        token.name = profile.name;
        token.picture = profile.picture;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose email in session for admin check
      if (session.user) {
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
      }
      return session;
    },
  },
});
```

### Pattern 2: proxy.ts for Route Protection

**What:** Next.js 16 renamed `middleware.ts` to `proxy.ts` and the exported function from `middleware` to `proxy`. Auth.js v5 integrates via `export { auth as proxy }`. [VERIFIED: Next.js 16 docs at node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md]

**Critical detail:** The `proxy.ts` file must be at project root or `src/` root (same level as `app/` directory). The exported function must be named `proxy` or be the default export. [VERIFIED: proxy.md docs]

**When to use:** For optimistic route-level redirects. Should NOT do database queries or expensive operations.

**Example:**
```typescript
// Source: GitHub discussion nextauthjs/next-auth#13315 + Next.js 16 proxy.md
import { auth } from "./auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAdminRoute = pathname.startsWith("/admin");
  const isLoginPage = pathname === "/admin/login";
  const isAccessDenied = pathname === "/admin/access-denied";
  const isAuthApi = pathname.startsWith("/api/auth");

  // Never block auth API routes
  if (isAuthApi) return NextResponse.next();

  // Admin routes need session check
  if (isAdminRoute) {
    if (!req.auth) {
      // Unauthenticated -> login page (D-07)
      if (isLoginPage || isAccessDenied) return NextResponse.next();
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }

    // Authenticated admin on login page -> redirect to admin (D-03)
    const isAdmin = req.auth.user?.email === process.env.ADMIN_EMAIL;
    if (isLoginPage && isAdmin) {
      return NextResponse.redirect(new URL("/admin", req.url));
    }

    // Authenticated non-admin -> access denied (D-06)
    if (!isAdmin && !isAccessDenied && !isLoginPage) {
      return NextResponse.redirect(new URL("/admin/access-denied", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
  ],
};
```

### Pattern 3: Auth Route Handler

**What:** Re-export Auth.js handlers at `/api/auth/[...nextauth]/route.ts`. [CITED: authjs.dev/reference/nextjs]

**Example:**
```typescript
// Source: authjs.dev/reference/nextjs
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

### Pattern 4: Server Component Auth Check

**What:** Call `auth()` directly in Server Components to get session data. [CITED: authjs.dev/reference/nextjs]

**When to use:** In admin pages and admin layout to verify session and admin status authoritatively.

**Example:**
```typescript
// Source: authjs.dev/reference/nextjs
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");

  const isAdmin = session.user.email === process.env.ADMIN_EMAIL;
  if (!isAdmin) redirect("/admin/access-denied");

  return <h1>Welcome, {session.user.name?.split(" ")[0]}</h1>;
}
```

### Pattern 5: API Route Auth Guard

**What:** Check session in Route Handlers, return JSON errors per D-08. [CITED: Next.js 16 auth guide]

**Example:**
```typescript
// Source: Next.js 16 auth guide + CONTEXT.md D-08
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.email !== process.env.ADMIN_EMAIL) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  // Proceed with admin logic
}
```

### Pattern 6: Sign-In via Form POST (Not Server Action)

**What:** Known bug in next-auth 5.0.0-beta.30: the `signIn()` server action fails with "Configuration" error on Next.js 16 due to header detection issues. Workaround: use direct form POST to the Auth.js sign-in endpoint. [CITED: github.com/nextauthjs/next-auth/issues/13388]

**Critical:** Do NOT use `signIn("google")` as a server action. Use the traditional CSRF-token form POST pattern instead.

**Example:**
```typescript
// Client component for sign-in button
"use client";

import { useState, useEffect } from "react";

export function GoogleSignInButton() {
  const [csrfToken, setCsrfToken] = useState("");

  useEffect(() => {
    fetch("/api/auth/csrf")
      .then((res) => res.json())
      .then((data) => setCsrfToken(data.csrfToken));
  }, []);

  return (
    <form method="post" action="/api/auth/signin/google">
      <input type="hidden" name="csrfToken" value={csrfToken} />
      <input type="hidden" name="callbackUrl" value="/admin" />
      <button type="submit">
        Sign in with Google
      </button>
    </form>
  );
}
```

### Pattern 7: Sign-Out

**What:** Sign-out via form POST to Auth.js sign-out endpoint or via the `signOut()` function (which does work as a server action for sign-out, unlike sign-in).

**Example:**
```typescript
// Sign out form - works as server action or form POST
import { signOut } from "@/auth";

// In admin layout header:
<form
  action={async () => {
    "use server";
    await signOut({ redirectTo: "/admin/login" });
  }}
>
  <button type="submit">Sign out</button>
</form>
```

### Anti-Patterns to Avoid

- **Auth check only in layout:** Next.js layouts don't re-render on navigation due to Partial Rendering. Auth checks in layouts are cached across navigations. Always check auth in each page component too, or use proxy.ts for route-level protection. [VERIFIED: Next.js 16 auth guide -- "be cautious when doing checks in Layouts as these don't re-render on navigation"]
- **Using signIn() server action:** Known bug on Next.js 16 -- `signIn()` fails with Configuration error due to `x-forwarded-proto` header missing in server action context. Use form POST instead. [CITED: github.com/nextauthjs/next-auth/issues/13388]
- **Relying solely on proxy.ts:** Proxy is an optimistic check only. Always verify auth in the data layer (server components, route handlers) as the authoritative check. [VERIFIED: Next.js 16 auth guide]
- **Storing ADMIN_EMAIL in JWT:** The admin email should be compared server-side from env vars, not embedded in the JWT. The JWT stores the user's email; the admin check compares against the env var at runtime.
- **Using `unauthorized()`/`forbidden()` functions:** These require `experimental.authInterrupts: true` in next.config and are still experimental. Simpler to use `redirect()` for this use case. [VERIFIED: Next.js 16 docs unauthorized.md]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth flow (state, PKCE, callbacks) | Custom Google OAuth implementation | Auth.js v5 Google provider | OAuth has dozens of security edge cases (CSRF, state parameter, code exchange timing) |
| JWT signing/verification | Custom jose/jsonwebtoken setup | Auth.js v5 built-in JWT handling | Auth.js manages signing, encryption (JWE), rotation, and cookie management |
| CSRF protection | Manual CSRF token generation | Auth.js v5 built-in CSRF | Auth.js generates and validates CSRF tokens for all mutations automatically |
| Session cookies | Manual cookie management | Auth.js v5 session cookies | Correct HttpOnly, Secure, SameSite, Max-Age settings are complex to get right |
| Google profile data parsing | Manual OpenID Connect profile parsing | Auth.js v5 Google provider profile callback | Provider handles ID token verification and profile extraction |

**Key insight:** Auth.js v5 manages the entire OAuth lifecycle. The project only configures providers, callbacks, and pages. Custom auth code should be limited to the admin email check (D-05) and route protection wiring.

## Common Pitfalls

### Pitfall 1: signIn Server Action Bug on Next.js 16
**What goes wrong:** Calling `signIn("google")` from a server action redirects to `/api/auth/error?error=Configuration` instead of Google OAuth.
**Why it happens:** The `createActionURL()` function in next-auth reads `x-forwarded-proto` header which is absent in Next.js 16 server action context, causing incorrect URL construction.
**How to avoid:** Use direct form POST to `/api/auth/signin/google` with CSRF token fetched client-side.
**Warning signs:** "Configuration" error in URL after clicking sign-in button. [CITED: github.com/nextauthjs/next-auth/issues/13388]

### Pitfall 2: middleware.ts vs proxy.ts Naming
**What goes wrong:** Creating `middleware.ts` instead of `proxy.ts` results in the file being ignored or deprecated warnings.
**Why it happens:** Next.js 16 renamed the file convention. The exported function must be named `proxy` or be a default export, not `middleware`.
**How to avoid:** Use `proxy.ts` with `export default auth(...)` or `export { auth as proxy }`.
**Warning signs:** Auth redirects not working, middleware not executing. [VERIFIED: Next.js 16 proxy.md docs]

### Pitfall 3: proxy.ts Location
**What goes wrong:** Placing `proxy.ts` inside `src/app/` instead of `src/` root.
**Why it happens:** Confusion about where the file belongs in the project structure.
**How to avoid:** Place at `src/proxy.ts` (same level as `src/app/`). This project uses the `src/` directory. [VERIFIED: Next.js 16 proxy.md -- "Create a proxy.ts file in the project root, or inside src if applicable, so that it is located at the same level as pages or app"]
**Warning signs:** Proxy function never executes.

### Pitfall 4: AUTH_SECRET Not Set
**What goes wrong:** Auth.js v5 throws "Missing AUTH_SECRET" error at startup or during auth flow.
**Why it happens:** Auth.js v5 requires `AUTH_SECRET` environment variable for JWT encryption. This replaces v4's `NEXTAUTH_SECRET`.
**How to avoid:** Generate with `openssl rand -base64 32` and add to `.env.local`. [CITED: authjs.dev/getting-started/migrating-to-v5]
**Warning signs:** Server errors on any auth-related route.

### Pitfall 5: Layout-Only Auth Creates Security Gap
**What goes wrong:** Checking auth only in `admin/layout.tsx` leaves nested routes accessible on client-side navigation because layouts use Partial Rendering and don't re-execute.
**Why it happens:** Next.js optimizes by not re-rendering layouts on navigation.
**How to avoid:** Check auth in proxy.ts (optimistic redirect) AND in each page/route handler (authoritative check). The layout can check for display purposes (show admin header) but must not be the only guard.
**Warning signs:** Users can navigate to admin sub-pages after initial auth bypass. [VERIFIED: Next.js 16 auth guide]

### Pitfall 6: Google OAuth Callback URL Mismatch
**What goes wrong:** Google OAuth returns "redirect_uri_mismatch" error.
**Why it happens:** The callback URL in Google Cloud Console doesn't match what Auth.js sends. Auth.js v5 uses `/api/auth/callback/google`.
**How to avoid:** Configure Google Cloud Console with both `http://localhost:3000/api/auth/callback/google` (dev) and `https://yourdomain.com/api/auth/callback/google` (prod). [CITED: authjs.dev/reference/core/providers/google]
**Warning signs:** OAuth redirect fails immediately after Google consent screen.

### Pitfall 7: Environment Variable Naming
**What goes wrong:** Using `GOOGLE_CLIENT_ID` instead of `AUTH_GOOGLE_ID`, or `NEXTAUTH_SECRET` instead of `AUTH_SECRET`.
**Why it happens:** Auth.js v5 changed the env var naming convention to use `AUTH_` prefix. Google provider auto-detects `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
**How to avoid:** Use `AUTH_` prefix for all Auth.js env vars: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`. [CITED: authjs.dev/getting-started/migrating-to-v5]
**Warning signs:** "Missing configuration" errors or provider not finding credentials.

## Code Examples

### Complete auth.ts Configuration
```typescript
// Source: authjs.dev/reference/nextjs + CONTEXT.md decisions
// src/auth.ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days per D-13
  },
  pages: {
    signIn: "/admin/login",
    error: "/admin/login",
  },
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        token.email = profile.email;
        token.name = profile.name;
        token.given_name = (profile as { given_name?: string }).given_name;
        token.picture = (profile as { picture?: string }).picture;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
      }
      return session;
    },
  },
});
```

### Admin Auth Helper for API Routes
```typescript
// Source: Next.js 16 auth guide Route Handler pattern + CONTEXT.md D-08
// src/lib/auth/admin-check.ts
import "server-only";
import { auth } from "@/auth";

export type AdminSession = {
  user: { email: string; name: string; image?: string };
};

/**
 * Verifies the request has a valid admin session.
 * Returns the session if admin, or a Response with 401/403 error.
 */
export async function requireAdmin(): Promise<AdminSession | Response> {
  const session = await auth();

  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.email !== process.env.ADMIN_EMAIL) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return session as AdminSession;
}
```

### Environment Variables Required
```bash
# .env.local additions for Phase 8

# Auth.js v5 secret -- generate with: openssl rand -base64 32
AUTH_SECRET=

# Google OAuth credentials from Google Cloud Console
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# Admin email for access control (D-04)
ADMIN_EMAIL=
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` + `export function middleware()` | `proxy.ts` + `export function proxy()` or `export default` | Next.js 16.0.0 | Must use new file name and export name [VERIFIED: proxy.md] |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | `AUTH_SECRET` / `AUTH_URL` (optional) | Auth.js v5 | Env var prefix changed from NEXTAUTH_ to AUTH_ [CITED: authjs.dev/getting-started/migrating-to-v5] |
| `getServerSession(authOptions)` | `auth()` (no args needed) | Auth.js v5 | Simplified API, config lives in auth.ts [CITED: authjs.dev/reference/nextjs] |
| `next-auth/middleware` export | `auth` callback wrapper in proxy.ts | Auth.js v5 + Next.js 16 | `import { auth } from "./auth"` then `export default auth((req) => {...})` [CITED: authjs.dev/reference/nextjs] |
| `@next-auth/*-adapter` | `@auth/*-adapter` | Auth.js v5 | Package scope changed (not needed for JWT-only -- no adapter required) [CITED: authjs.dev/getting-started/migrating-to-v5] |

**Deprecated/outdated:**
- `middleware.ts`: Deprecated in Next.js 16, renamed to `proxy.ts` [VERIFIED: proxy.md]
- `NEXTAUTH_SECRET`: Replaced by `AUTH_SECRET` in Auth.js v5 [CITED: authjs.dev migration guide]
- `getServerSession()`: Replaced by `auth()` exported from auth.ts [CITED: authjs.dev/reference/nextjs]
- `experimental.authInterrupts`: The `unauthorized()`/`forbidden()` functions remain experimental -- avoid for now [VERIFIED: Next.js 16 unauthorized.md]

## Assumptions Log

> List all claims tagged `[ASSUMED]` in this research.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `signOut()` server action works correctly on Next.js 16 (only `signIn()` is bugged) | Architecture Patterns -- Pattern 7 | If signOut also fails, need form POST pattern for sign-out too |
| A2 | Auth.js v5 `auth()` wrapper in proxy.ts works as `export default auth((req) => {...})` on Next.js 16 | Architecture Patterns -- Pattern 2 | If destructured export fails, may need `export const proxy = auth((req) => {...})` syntax |
| A3 | Google profile provides `given_name` field for first name in JWT callback | Code Examples -- auth.ts | If missing, fall back to splitting `name` on space |
| A4 | CSRF token endpoint at `/api/auth/csrf` returns JSON with `csrfToken` field | Architecture Patterns -- Pattern 6 | If endpoint format differs, sign-in form POST will fail |

**If this table is empty:** N/A -- there are assumed claims above.

## Open Questions

1. **signIn Server Action Fix Timeline**
   - What we know: Issue #13388 reported 2026-03-01, still open as of research date
   - What's unclear: Whether a fix is coming in next-auth beta.31+ or if the form POST workaround is permanent
   - Recommendation: Use form POST workaround. If fix lands before implementation, can simplify to server action

2. **proxy.ts Export Syntax**
   - What we know: `export { auth as proxy }` reportedly works per GitHub discussion #13315, and `export default auth((req) => {...})` is the pattern for custom logic
   - What's unclear: Whether the callback wrapper form (`export default auth(...)`) is treated as default export correctly by Next.js 16
   - Recommendation: Test both patterns during implementation. The default export form is most likely to work based on proxy.md docs saying "either as a default export or named proxy"

3. **Google Cloud Console Setup**
   - What we know: Requires OAuth 2.0 client ID with authorized redirect URIs
   - What's unclear: Whether the user already has a Google Cloud project set up
   - Recommendation: Include setup instructions as a prerequisite/manual step before implementation begins. Callback URL: `http://localhost:3000/api/auth/callback/google` for dev

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | next-auth, Next.js | Yes | (system) | -- |
| next-auth@beta | Auth flow | Not yet installed | 5.0.0-beta.30 | -- (must install) |
| Google Cloud OAuth credentials | Google sign-in | External service | -- | Must create project + credentials manually |
| AUTH_SECRET env var | JWT encryption | Not yet set | -- | Generate with `openssl rand -base64 32` |

**Missing dependencies with no fallback:**
- Google Cloud OAuth credentials must be created manually by the user before auth can function
- AUTH_SECRET must be generated and added to .env.local

**Missing dependencies with fallback:**
- None -- all dependencies are either installable via npm or require manual setup

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Auth.js config exports auth, handlers, signIn, signOut | unit | `npx vitest run src/lib/auth/__tests__/auth-config.test.ts -x` | Wave 0 |
| AUTH-01 | proxy.ts redirects unauthenticated /admin to /admin/login | unit | `npx vitest run src/__tests__/proxy.test.ts -x` | Wave 0 |
| AUTH-02 | Admin check compares email against ADMIN_EMAIL | unit | `npx vitest run src/lib/auth/__tests__/admin-check.test.ts -x` | Wave 0 |
| AUTH-03 | API route helper returns 401/403 for non-admin requests | unit | `npx vitest run src/lib/auth/__tests__/admin-check.test.ts -x` | Wave 0 |
| AUTH-01 | /api/auth/[...nextauth] exports GET and POST handlers | unit | `npx vitest run src/app/api/auth/__tests__/route.test.ts -x` | Wave 0 |
| AUTH-01/02 | Login page renders sign-in button, access denied page shows email | manual-only | Manual: visit /admin/login, /admin/access-denied | -- |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/lib/auth/__tests__/admin-check.test.ts` -- covers AUTH-02, AUTH-03
- [ ] `src/__tests__/proxy.test.ts` -- covers AUTH-01 proxy redirect logic (can use `next/experimental/testing/server` utilities)
- [ ] Mock setup for `next-auth` in vitest (mock `auth()` return values)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Auth.js v5 Google OAuth (delegated to Google) |
| V3 Session Management | yes | Auth.js v5 JWT sessions with HttpOnly Secure cookies, 30-day maxAge |
| V4 Access Control | yes | ADMIN_EMAIL env var comparison in server components + route handlers |
| V5 Input Validation | no | No user input in auth flow (OAuth is redirect-based) |
| V6 Cryptography | yes | Auth.js v5 handles JWT signing (HS256) with AUTH_SECRET -- never hand-roll |

### Known Threat Patterns for Auth.js + Next.js

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CSRF on sign-in/out | Tampering | Auth.js built-in CSRF token on all POST endpoints |
| Session fixation | Spoofing | Auth.js rotates session on sign-in |
| JWT tampering | Tampering | Auth.js signs JWTs with AUTH_SECRET (HS256) |
| Open redirect via callbackUrl | Spoofing | Auth.js validates redirect URLs against allowed origins |
| Admin email spoofing | Elevation | Server-side comparison of session email vs ADMIN_EMAIL -- cannot be spoofed via client |
| Cookie theft | Information Disclosure | HttpOnly + Secure + SameSite=lax cookie flags (Auth.js defaults) |

## Project Constraints (from CLAUDE.md)

- CLAUDE.md references AGENTS.md which states: "This is NOT the Next.js you know. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code." -- This research has followed this directive by reading the Next.js 16 authentication guide and proxy.ts documentation from `node_modules/next/dist/docs/`.
- The project uses `src/` directory structure with `@/` path alias [VERIFIED: tsconfig.json]
- All pages are React Server Components by default [VERIFIED: existing codebase]
- API routes use the Route Handler pattern (`export async function POST/GET`) [VERIFIED: src/app/api/checkout/route.ts]
- Tailwind CSS 4 with custom theme variables in globals.css [VERIFIED: globals.css]
- Vitest for testing [VERIFIED: package.json, vitest.config.ts]
- `server-only` package used to guard server code [VERIFIED: package.json]

## Sources

### Primary (HIGH confidence)
- Next.js 16 proxy.md (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`) -- proxy.ts file convention, export patterns, matcher config
- Next.js 16 authentication guide (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`) -- auth patterns, DAL, session management, proxy integration
- Next.js 16 unauthorized.md / forbidden.md -- experimental auth interrupts (decided not to use)
- npm registry -- next-auth@beta version 5.0.0-beta.30, peer dependencies, @auth/core version

### Secondary (MEDIUM confidence)
- [authjs.dev/reference/nextjs](https://authjs.dev/reference/nextjs) -- Auth.js v5 Next.js integration API
- [authjs.dev/getting-started/migrating-to-v5](https://authjs.dev/getting-started/migrating-to-v5) -- v5 migration guide, env var naming
- [authjs.dev/reference/core/providers/google](https://authjs.dev/reference/core/providers/google) -- Google provider config, callback URL, profile data
- [github.com/nextauthjs/next-auth/issues/13302](https://github.com/nextauthjs/next-auth/issues/13302) -- Next.js 16 compatibility issue (resolved in beta.30)
- [github.com/nextauthjs/next-auth/issues/13388](https://github.com/nextauthjs/next-auth/issues/13388) -- signIn server action bug on Next.js 16
- [github.com/nextauthjs/next-auth/discussions/13315](https://github.com/nextauthjs/next-auth/discussions/13315) -- proxy.ts migration discussion

### Tertiary (LOW confidence)
- [dev.to Auth.js v5 + Next.js 16 guide](https://dev.to/huangyongshan46a11y/authjs-v5-with-nextjs-16-the-complete-authentication-guide-2026-2lg) -- community guide, used for cross-reference only

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM -- Auth.js v5 is still beta, but widely used and explicitly compatible with Next.js 16
- Architecture: MEDIUM -- proxy.ts pattern is new and has some edge cases; auth() pattern is well-documented
- Pitfalls: HIGH -- documented from official GitHub issues and Next.js 16 docs
- Security: HIGH -- Auth.js handles standard OAuth security patterns; admin check is straightforward

**Research date:** 2026-04-12
**Valid until:** 2026-04-26 (14 days -- Auth.js beta releases frequently, signIn bug may be fixed)
