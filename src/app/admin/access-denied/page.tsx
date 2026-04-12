import Link from "next/link";
import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";

export default async function AccessDeniedPage() {
  const session = await auth();

  // Defensive redirect: if no session, send to login
  // (review concern MEDIUM: access-denied null session)
  if (!session?.user?.email) {
    redirect("/admin/login");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-zinc-950">
      <div className="max-w-sm mx-auto text-center px-4">
        <h1 className="text-xl font-bold mb-2">
          <span className="text-accent">Viki</span>{" "}
          <span className="text-zinc-500 dark:text-zinc-400">
            MTG Bulk Store
          </span>
        </h1>

        <h2 className="text-xl font-bold mt-8">Access Denied</h2>

        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
          <span className="font-bold">{session.user.email}</span> does not have
          admin access to this store.
        </p>

        <div className="flex items-center justify-center gap-4 mt-6">
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/admin/login" });
            }}
          >
            <button
              type="submit"
              className="px-5 py-2 text-sm font-bold rounded-md bg-accent text-white hover:bg-accent-hover transition-colors"
            >
              Sign out
            </button>
          </form>

          <Link href="/" className="text-sm text-accent hover:underline">
            Back to store
          </Link>
        </div>
      </div>
    </div>
  );
}
