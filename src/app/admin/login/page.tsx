import Link from "next/link";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Login -- Viki MTG Bulk Store",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const params = await searchParams;
  const hasError = !!params.error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-zinc-950">
      <div className="max-w-sm mx-auto text-center px-4">
        <h1 className="text-xl font-bold mb-8">
          <span className="text-accent">Viki</span>{" "}
          <span className="text-zinc-500 dark:text-zinc-400">
            MTG Bulk Store
          </span>
        </h1>

        <GoogleSignInButton />

        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-4">
          Only authorized admins can access this area.
        </p>

        <Link
          href="/"
          className="text-sm text-accent hover:underline mt-4 inline-block"
        >
          Back to store
        </Link>

        {hasError && (
          <div
            role="alert"
            className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md p-3 text-sm text-red-600 dark:text-red-400 mt-4"
          >
            Sign-in failed. Try again.
          </div>
        )}
      </div>
    </div>
  );
}
