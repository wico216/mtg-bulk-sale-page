import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { authorizeAdminCredentials } from "@/lib/auth/credentials";

// Fail fast on missing auth env vars (review concern: env validation).
// Password login is local-only so production keeps Google OAuth as the public
// admin auth surface. Set ENABLE_PASSWORD_LOGIN=false to hide it in local dev.
const passwordLoginEnabled =
  process.env.NODE_ENV !== "production" &&
  process.env.ENABLE_PASSWORD_LOGIN !== "false";

const requiredEnvVars = ["AUTH_SECRET", "ADMIN_EMAIL"] as const;
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(
      `Missing required environment variable: ${envVar}. Check .env.local.example for setup instructions.`,
    );
  }
}

if (passwordLoginEnabled) {
  for (const envVar of ["ADMIN_USERNAME", "ADMIN_PASSWORD"] as const) {
    if (!process.env[envVar]) {
      throw new Error(
        `Missing required environment variable: ${envVar}. Check .env.local.example for setup instructions.`,
      );
    }
  }
}

const providers: NextAuthConfig["providers"] = [];

if (passwordLoginEnabled) {
  providers.push(
    Credentials({
      name: "Admin password",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: authorizeAdminCredentials,
    }),
  );
}

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days per D-13
  },
  pages: {
    signIn: "/admin/login", // Custom login page per D-01
    error: "/admin/login", // OAuth/errors redirect to login per D-15
  },
  callbacks: {
    async jwt({ token, profile, user }) {
      if (user) {
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      } else if (profile) {
        token.email = profile.email;
        token.name = profile.name;
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
