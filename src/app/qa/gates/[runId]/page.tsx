import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getQaGateAccess } from "@/lib/qa-gate-auth";
import { getQaGateRun, type QaGateReview } from "@/lib/qa-gates";
import { QaGateReviewer } from "../../_components/qa-gate-reviewer";

export const dynamic = "force-dynamic";

export default async function QaGateDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const access = await getQaGateAccess();
  if (!access.ok) {
    redirect(`/qa/login?next=${encodeURIComponent(`/qa/gates/${runId}`)}`);
  }

  const run = getQaGateRun(runId);
  if (!run) notFound();

  let latestReview: QaGateReview | null = null;
  try {
    const { getLatestQaGateReview } = await import("@/db/qa-gate-reviews");
    latestReview = await getLatestQaGateReview(run.id);
  } catch {
    // The gate remains reviewable/readable even if a preview deployment lacks DB
    // connectivity; submitting will return a structured API error.
    latestReview = null;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/qa/gates" className="text-sm hover:underline" style={{ color: "var(--muted)" }}>
          ← Back to QA gates
        </Link>
      </div>

      <header className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-[0.24em]"
            style={{ color: "var(--muted)" }}
          >
            {run.featureArea}
          </p>
          <h1
            className="m-0 text-4xl sm:text-6xl"
            style={{
              fontFamily: "var(--font-display)",
              letterSpacing: "-0.03em",
              lineHeight: 0.92,
            }}
          >
            {run.title}
            <em style={{ color: "var(--accent)", fontStyle: "italic" }}>.</em>
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7" style={{ color: "var(--ink-soft)" }}>
            {run.summary}
          </p>
        </div>

        <dl
          className="grid gap-3 rounded-3xl p-4 text-sm sm:min-w-80"
          style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
        >
          <div>
            <dt className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>Run ID</dt>
            <dd className="mt-1 font-mono text-xs">{run.id}</dd>
          </div>
          {run.branch && (
            <div>
              <dt className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>Branch</dt>
              <dd className="mt-1 font-mono text-xs">{run.branch}</dd>
            </div>
          )}
          {run.deploymentUrl && (
            <div>
              <dt className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>Deployment</dt>
              <dd className="mt-1 truncate text-xs">
                <a href={run.deploymentUrl} target="_blank" rel="noreferrer" className="hover:underline">
                  {run.deploymentUrl}
                </a>
              </dd>
            </div>
          )}
        </dl>
      </header>

      <QaGateReviewer run={run} initialReview={latestReview} />
    </div>
  );
}
