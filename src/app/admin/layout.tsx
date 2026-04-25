import Link from "next/link";
import { auth, signOut } from "@/auth";
import { isAdminEmail } from "@/lib/auth/helpers";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const isAdmin = isAdminEmail(session?.user?.email);

  // For non-admin or unauthenticated users, render children only
  // (login and access-denied pages have their own standalone layout)
  // proxy.ts handles the redirects; layout just wraps content
  if (!session || !isAdmin) {
    return <>{children}</>;
  }

  // Admin header shown only for authenticated admin users
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-xl font-bold text-accent">Viki</span>
            <span className="ml-2 text-xs font-bold px-2 py-1 rounded-full bg-accent-light text-accent">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
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
                className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 pt-6">{children}</main>
    </div>
  );
}
