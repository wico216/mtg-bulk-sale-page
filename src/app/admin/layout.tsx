import Link from "next/link";
import { auth, signOut } from "@/auth";
import { isAdminEmail } from "@/lib/auth/helpers";
import { AdminNav } from "./_components/admin-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const isAdmin = isAdminEmail(session?.user?.email);

  // For non-admin or unauthenticated users, render children only
  // (login and access-denied pages have their own standalone layout).
  // proxy.ts handles the redirects; layout just wraps content.
  if (!session || !isAdmin) {
    return <>{children}</>;
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--bg)", color: "var(--ink)" }}
    >
      <header
        className="sticky top-0 z-30 backdrop-blur"
        style={{
          background: "color-mix(in oklab, var(--bg) 85%, transparent)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link
            href="/admin"
            className="flex items-center gap-2 shrink-0"
            aria-label="Admin home"
          >
            <span
              className="text-xl font-semibold"
              style={{
                fontFamily: "var(--font-display)",
                color: "var(--ink)",
              }}
            >
              Viki
            </span>
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{
                background: "var(--accent)",
                color: "var(--accent-fg)",
              }}
            >
              Admin
            </span>
          </Link>

          <AdminNav />

          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/"
              className="hidden sm:inline text-sm transition-colors hover:underline"
              style={{ color: "var(--muted)" }}
            >
              View store
            </Link>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/admin/login" });
              }}
            >
              <button
                type="submit"
                className="text-sm transition-colors hover:underline"
                style={{ color: "var(--muted)" }}
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pt-6 pb-12 relative z-10">
        {children}
      </main>
    </div>
  );
}
