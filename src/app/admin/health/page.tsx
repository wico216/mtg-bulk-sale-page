import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/auth/helpers";
import { getAdminHealthSnapshot } from "@/db/admin-health";
import { RefreshPricesButton } from "./_components/refresh-prices-button";

/**
 * Phase 15-02: Admin operational health page.
 *
 * Server-rendered. Uses the same shape as `/api/admin/health` so the page and
 * the JSON endpoint stay consistent. Configuration checks read env presence;
 * NO env VALUES are rendered or referenced beyond "configured" / "missing".
 */

export const metadata: Metadata = {
  title: "Health -- Viki MTG Bulk Store",
};

export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "configured" | "missing" | "error";

function isPresent(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function envChecks(): {
  authSecret: "configured" | "missing";
  googleOAuth: "configured" | "missing";
  email: "configured" | "missing";
  cronSecret: "configured" | "missing";
} {
  return {
    authSecret: isPresent(process.env.AUTH_SECRET) ? "configured" : "missing",
    googleOAuth:
      isPresent(process.env.AUTH_GOOGLE_ID) && isPresent(process.env.AUTH_GOOGLE_SECRET)
        ? "configured"
        : "missing",
    email:
      isPresent(process.env.RESEND_API_KEY) && isPresent(process.env.SELLER_EMAIL)
        ? "configured"
        : "missing",
    // Phase 23 D-13: presence-only; never serialize the secret value.
    cronSecret: isPresent(process.env.CRON_SECRET) ? "configured" : "missing",
  };
}

const STATUS_LABELS: Record<CheckStatus, string> = {
  ok: "OK",
  configured: "Configured",
  missing: "Missing",
  error: "Error",
};

const STATUS_CLASSES: Record<CheckStatus, string> = {
  ok: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
  configured: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
  missing: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
  error: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateFormatter.format(parsed);
}

function StatusBadge({ status, label }: { status: CheckStatus; label?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${STATUS_CLASSES[status]}`}
    >
      {label ?? STATUS_LABELS[status]}
    </span>
  );
}

export default async function AdminHealthPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/admin/login");
  }
  if (!isAdminEmail(session.user.email)) {
    redirect("/admin/access-denied");
  }

  const envState = envChecks();
  let snapshot;
  let snapshotError: string | null = null;
  try {
    snapshot = await getAdminHealthSnapshot();
  } catch (error) {
    snapshot = {
      database: "error" as const,
      lastOrderAt: null,
      lastImportAt: null,
      lastAuditAt: null,
      lastPriceRefreshAt: null,
    };
    snapshotError = error instanceof Error ? error.message : "Unknown error";
  }

  const checks: Array<{ key: string; label: string; status: CheckStatus; hint: string }> = [
    {
      key: "database",
      label: "Database",
      status: snapshot.database === "ok" ? "ok" : "error",
      hint:
        snapshot.database === "ok"
          ? "SELECT 1 succeeded on the configured Postgres connection."
          : "SELECT 1 failed. Check DATABASE_URL and the Neon project status.",
    },
    {
      key: "authSecret",
      label: "Auth secret",
      status: envState.authSecret,
      hint:
        envState.authSecret === "configured"
          ? "AUTH_SECRET is set."
          : "AUTH_SECRET is not set. Generate with: openssl rand -base64 32",
    },
    {
      key: "googleOAuth",
      label: "Google OAuth",
      status: envState.googleOAuth,
      hint:
        envState.googleOAuth === "configured"
          ? "AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET are set."
          : "One or both Google OAuth env vars are missing.",
    },
    {
      key: "email",
      label: "Email (Resend)",
      status: envState.email,
      hint:
        envState.email === "configured"
          ? "RESEND_API_KEY and SELLER_EMAIL are set."
          : "Order notifications cannot be sent until RESEND_API_KEY and SELLER_EMAIL are set.",
    },
    {
      // Phase 23 D-13: presence-only check; the secret value is never read or
      // rendered. STATUS_LABELS handles the literal -> UI translation.
      key: "cronSecret",
      label: "Cron secret",
      status: envState.cronSecret,
      hint:
        envState.cronSecret === "configured"
          ? "CRON_SECRET is set; Vercel cron can authenticate to /api/cron/refresh-prices."
          : "CRON_SECRET is not set. Generate with: openssl rand -hex 32. Daily price refresh will 401 until configured.",
    },
  ];

  const overallOk =
    snapshot.database === "ok" &&
    envState.authSecret === "configured" &&
    envState.googleOAuth === "configured" &&
    envState.email === "configured" &&
    envState.cronSecret === "configured";

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950 p-6 text-white shadow-sm dark:border-zinc-800">
        <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-accent/30 blur-3xl" />
        <div className="relative max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent-light">
            Operations
          </p>
          <h1 className="mt-2 text-2xl font-semibold">System Health</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            Configuration presence, database reachability, and recent activity. No
            secret values are displayed or logged from this page.
          </p>
          <div className="mt-3">
            <StatusBadge
              status={overallOk ? "ok" : "error"}
              label={overallOk ? "All checks passing" : "Attention required"}
            />
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Checks</h2>
        <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Check</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {checks.map((check) => (
                <tr key={check.key} className="bg-white dark:bg-zinc-950">
                  <td className="px-4 py-3 font-semibold">{check.label}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={check.status} />
                  </td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                    {check.hint}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {snapshotError ? (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300">
            Health snapshot threw: {snapshotError}
          </p>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Last order
            </dt>
            <dd className="mt-2 text-sm font-medium">{formatTimestamp(snapshot.lastOrderAt)}</dd>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Last import commit
            </dt>
            <dd className="mt-2 text-sm font-medium">{formatTimestamp(snapshot.lastImportAt)}</dd>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Last audit entry
            </dt>
            <dd className="mt-2 text-sm font-medium">{formatTimestamp(snapshot.lastAuditAt)}</dd>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Last price refresh
            </dt>
            <dd className="mt-2 text-sm font-medium">
              {formatTimestamp(snapshot.lastPriceRefreshAt)}
            </dd>
            <RefreshPricesButton />
          </div>
        </dl>
      </section>

      <section className="space-y-2 text-sm text-zinc-500 dark:text-zinc-400">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">JSON endpoint</h2>
        <p>
          Same data is available as JSON at{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 text-[0.8rem] dark:bg-zinc-900">
            /api/admin/health
          </code>
          . The endpoint is admin-only and never includes env values, only{" "}
          <code>configured</code> / <code>missing</code> markers.
        </p>
      </section>
    </div>
  );
}
