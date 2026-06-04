import Link from "next/link";
import { redirect } from "next/navigation";
import { getQaGateAccess } from "@/lib/qa-gate-auth";
import { listQaGateRuns } from "@/lib/qa-gates";

export const dynamic = "force-dynamic";

export default async function QaGateListPage() {
  const access = await getQaGateAccess();
  if (!access.ok) {
    redirect(`/qa/login?next=${encodeURIComponent("/qa/gates")}`);
  }

  const runs = listQaGateRuns();

  return (
    <div className="space-y-8">
      <section className="max-w-3xl">
        <p
          className="mb-3 text-xs font-semibold uppercase tracking-[0.24em]"
          style={{ color: "var(--muted)" }}
        >
          Human approval layer
        </p>
        <h1
          className="m-0 text-5xl sm:text-6xl"
          style={{
            fontFamily: "var(--font-display)",
            letterSpacing: "-0.03em",
            lineHeight: 0.9,
          }}
        >
          QA approval gates
          <em style={{ color: "var(--accent)", fontStyle: "italic" }}>.</em>
        </h1>
        <p className="mt-4 text-base leading-7" style={{ color: "var(--ink-soft)" }}>
          Review Playwright videos, expected behavior, checklist state, and final
          approve/fail decisions from a Vercel-hosted page. This gives Wiko a
          remote gate before customer-facing MTG changes ship.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {runs.map((run) => (
          <Link
            key={run.id}
            href={`/qa/gates/${run.id}`}
            className="group rounded-3xl p-5 transition hover:-translate-y-0.5"
            style={{
              background: "color-mix(in oklab, var(--surface) 88%, transparent)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
              <span>{run.featureArea}</span>
              <span aria-hidden="true">·</span>
              <time dateTime={run.createdAt}>
                {new Date(run.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </time>
            </div>
            <h2 className="mt-3 text-2xl font-semibold" style={{ color: "var(--ink)" }}>
              {run.title}
            </h2>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--ink-soft)" }}>
              {run.summary}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs" style={{ color: "var(--muted)" }}>
              {run.branch && <span className="rounded-full border px-2 py-1" style={{ borderColor: "var(--border)" }}>{run.branch}</span>}
              {run.deploymentUrl && <span className="rounded-full border px-2 py-1" style={{ borderColor: "var(--border)" }}>Deployment attached</span>}
              {run.videoUrl && <span className="rounded-full border px-2 py-1" style={{ borderColor: "var(--border)" }}>Video attached</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
