import { redirect } from "next/navigation";
import { getQaGateAccess, isQaGateConfigured, safeQaNextPath } from "@/lib/qa-gate-auth";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function errorMessage(error: string | undefined): string | null {
  switch (error) {
    case "bad-password":
      return "That QA gate password did not work. Try again.";
    case "not-configured":
      return "QA gate password is not configured on this deployment yet.";
    default:
      return null;
  }
}

export default async function QaLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  const next = safeQaNextPath(firstParam(resolvedSearchParams.next) ?? null);
  const access = await getQaGateAccess();
  if (access.ok) {
    redirect(next);
  }

  const configured = isQaGateConfigured();
  const message = errorMessage(firstParam(resolvedSearchParams.error));

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-2xl place-items-center">
      <section
        className="w-full rounded-3xl p-6 shadow-2xl sm:p-8"
        style={{
          background: "color-mix(in oklab, var(--surface) 92%, transparent)",
          border: "1px solid var(--border)",
        }}
      >
        <p
          className="mb-3 text-xs font-semibold uppercase tracking-[0.24em]"
          style={{ color: "var(--muted)" }}
        >
          Remote feature review
        </p>
        <h1
          className="m-0 text-4xl sm:text-5xl"
          style={{
            fontFamily: "var(--font-display)",
            letterSpacing: "-0.02em",
            lineHeight: 0.95,
          }}
        >
          Enter the QA gate password
          <em style={{ color: "var(--accent)", fontStyle: "italic" }}>.</em>
        </h1>
        <p className="mt-4 text-sm leading-6" style={{ color: "var(--ink-soft)" }}>
          This protects Playwright proof videos, expected behavior, checklist
          decisions, and Wiko approval notes while keeping the review page usable
          from any device with the Vercel URL.
        </p>

        {message && (
          <div
            role="alert"
            className="mt-5 rounded-2xl px-4 py-3 text-sm"
            style={{
              background: "color-mix(in oklab, var(--bad) 14%, transparent)",
              border: "1px solid color-mix(in oklab, var(--bad) 35%, var(--border))",
              color: "var(--ink)",
            }}
          >
            {message}
          </div>
        )}

        <form action="/api/qa/login" method="post" className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          <label className="block text-sm font-medium" htmlFor="qa-password">
            Password
          </label>
          <input
            id="qa-password"
            name="password"
            type="password"
            required
            disabled={!configured}
            autoComplete="current-password"
            className="w-full rounded-2xl px-4 py-3 text-base outline-none transition"
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border-strong)",
              color: "var(--ink)",
            }}
          />
          <button
            type="submit"
            disabled={!configured}
            className="w-full rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            Open QA Gate
          </button>
        </form>

        <p className="mt-5 text-xs leading-5" style={{ color: "var(--muted)" }}>
          Production deployments need <code>QA_GATE_PASSWORD</code> set in Vercel.
          Admin sessions can also open the gate without a separate password.
        </p>
      </section>
    </div>
  );
}
