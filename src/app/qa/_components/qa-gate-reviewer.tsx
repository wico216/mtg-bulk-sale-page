"use client";

import { useMemo, useState } from "react";
import type {
  QaChecklistState,
  QaGateDecision,
  QaGateEvidenceStatus,
  QaGateReview,
  QaGateRun,
} from "@/lib/qa-gates";
import { emptyQaChecklist } from "@/lib/qa-gates";

interface QaGateReviewerProps {
  run: QaGateRun;
  initialReview: QaGateReview | null;
}

const CHECKLIST_OPTIONS: { value: QaChecklistState; label: string }[] = [
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
  { value: "na", label: "N/A" },
];

function decisionLabel(decision: QaGateDecision | undefined): string {
  if (decision === "approved") return "Approved";
  if (decision === "failed") return "Failed";
  return "Pending";
}

function evidenceStatusLabel(status: QaGateEvidenceStatus): string {
  switch (status) {
    case "passed":
      return "Passed";
    case "failed":
      return "Failed";
    case "warning":
      return "Needs attention";
    case "not-run":
      return "Not run";
  }
}

function evidenceStatusColor(status: QaGateEvidenceStatus): string {
  switch (status) {
    case "passed":
      return "#22c55e";
    case "failed":
      return "var(--bad)";
    case "warning":
      return "#f59e0b";
    case "not-run":
      return "var(--muted)";
  }
}

function formatReviewDate(value: string): string {
  return new Date(value).toLocaleString();
}

export function QaGateReviewer({ run, initialReview }: QaGateReviewerProps) {
  const [checklist, setChecklist] = useState<Record<string, QaChecklistState>>(
    () => ({ ...emptyQaChecklist(run), ...(initialReview?.checklist ?? {}) }),
  );
  const [reviewerName, setReviewerName] = useState(
    initialReview?.reviewerName ?? "Wiko",
  );
  const [notes, setNotes] = useState(initialReview?.notes ?? "");
  const [currentReview, setCurrentReview] = useState<QaGateReview | null>(
    initialReview,
  );
  const [submittingDecision, setSubmittingDecision] =
    useState<QaGateDecision | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requiredFailures = useMemo(
    () =>
      run.checklist.filter(
        (item) => item.required && checklist[item.id] !== "pass",
      ),
    [checklist, run.checklist],
  );
  const approveDisabled = Boolean(submittingDecision) || requiredFailures.length > 0;

  function updateChecklist(itemId: string, state: QaChecklistState) {
    setChecklist((prev) => ({ ...prev, [itemId]: state }));
  }

  async function submitDecision(decision: QaGateDecision) {
    setError(null);

    if (decision === "approved" && requiredFailures.length > 0) {
      setError("Mark every required checklist row Pass before approving this gate.");
      return;
    }

    if (decision === "failed" && notes.trim().length === 0) {
      setError("Failed QA gates need notes describing what Atlas should fix.");
      return;
    }

    setSubmittingDecision(decision);
    try {
      const response = await fetch(`/api/qa/gates/${encodeURIComponent(run.id)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes, reviewerName, checklist }),
      });
      const payload = (await response.json()) as {
        review?: QaGateReview;
        error?: string;
      };
      if (!response.ok || !payload.review) {
        throw new Error(payload.error || "Failed to save review");
      }
      setCurrentReview(payload.review);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save review");
    } finally {
      setSubmittingDecision(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
      <section className="space-y-5">
        <div
          className="overflow-hidden rounded-3xl"
          style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
        >
          {run.videoUrl ? (
            <video
              className="aspect-video w-full bg-black"
              controls
              playsInline
              preload="metadata"
              poster={run.videoPosterUrl}
              src={run.videoUrl}
            />
          ) : (
            <div className="grid aspect-video place-items-center p-6 text-center" style={{ color: "var(--muted)" }}>
              No video artifact is attached to this gate yet.
            </div>
          )}
        </div>

        <div
          className="rounded-3xl p-5"
          style={{
            border: "1px solid var(--border)",
            background: "color-mix(in oklab, var(--surface) 86%, transparent)",
          }}
        >
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
            <span>Ticket</span>
            <span className="rounded-full border px-2 py-1 font-mono" style={{ borderColor: "var(--border)", color: "var(--ink)" }}>
              {run.ticketId}
            </span>
          </div>
          <h2 className="mt-4 text-xl font-semibold">What changed</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6" style={{ color: "var(--ink-soft)" }}>
            {run.changeSummary.map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div
          className="rounded-3xl p-5"
          style={{
            border: "1px solid var(--border)",
            background: "color-mix(in oklab, var(--surface) 86%, transparent)",
          }}
        >
          <h2 className="text-xl font-semibold">What to look for</h2>
          <p className="mt-2 text-sm leading-6" style={{ color: "var(--muted)" }}>
            Use this packet to compare the agent&apos;s recorded browser proof against
            the ticket&apos;s expected behavior. You should only have to watch proof and
            mark the checklist, not manually replay every screen yourself.
          </p>
          <ol className="mt-4 space-y-3 text-sm leading-6" style={{ color: "var(--ink-soft)" }}>
            {[...run.reviewerInstructions, ...run.expectedBehavior].map((item, index) => (
              <li key={`${index}-${item}`} className="flex gap-3">
                <span
                  className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold"
                  style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                >
                  {index + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </div>

        <div
          className="rounded-3xl p-5"
          style={{
            border: "1px solid var(--border)",
            background: "color-mix(in oklab, var(--surface) 82%, transparent)",
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Agent-recorded evidence</h2>
              <p className="mt-2 text-sm leading-6" style={{ color: "var(--muted)" }}>
                {run.proofRun.tool} proof against {run.proofRun.targetUrl} · {run.proofRun.browser}
              </p>
            </div>
            <span className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: "var(--border)", color: "var(--ink-soft)" }}>
              {run.proofRun.resultSummary}
            </span>
          </div>
          <dl className="mt-4 grid gap-3 rounded-2xl p-4 text-xs" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--muted)" }}>
            <div>
              <dt className="font-semibold uppercase tracking-[0.16em]">Recorded command</dt>
              <dd className="mt-1 break-words font-mono">{run.proofRun.command}</dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-[0.16em]">Recorded at</dt>
              <dd className="mt-1">{formatReviewDate(run.proofRun.recordedAt)}</dd>
            </div>
          </dl>
          <div className="mt-4 grid gap-3">
            {run.evidence.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl p-4"
                style={{ border: "1px solid var(--border)", background: "var(--bg)" }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-base font-semibold">{item.title}</h3>
                  <span
                    className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em]"
                    style={{
                      background: `color-mix(in oklab, ${evidenceStatusColor(item.status)} 22%, transparent)`,
                      color: "var(--ink)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {evidenceStatusLabel(item.status)}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6" style={{ color: "var(--ink-soft)" }}>
                  <strong>Expected:</strong> {item.expected}
                </p>
                <p className="mt-2 text-sm leading-6" style={{ color: "var(--ink-soft)" }}>
                  <strong>Observed:</strong> {item.observed}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs" style={{ color: "var(--muted)" }}>
                  <span className="rounded-full border px-2 py-1" style={{ borderColor: "var(--border)" }}>
                    {item.artifactKind}
                  </span>
                  {item.timestamp && (
                    <span className="rounded-full border px-2 py-1" style={{ borderColor: "var(--border)" }}>
                      Video timestamp {item.timestamp}
                    </span>
                  )}
                  {item.artifactUrl && (
                    <a href={item.artifactUrl} target="_blank" rel="noreferrer" className="rounded-full border px-2 py-1 hover:underline" style={{ borderColor: "var(--border)", color: "var(--ink-soft)" }}>
                      Open artifact
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>

        {run.artifacts.length > 0 && (
          <div
            className="rounded-3xl p-5"
            style={{
              border: "1px solid var(--border)",
              background: "color-mix(in oklab, var(--surface) 78%, transparent)",
            }}
          >
            <h2 className="text-xl font-semibold">Artifacts</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {run.artifacts.map((artifact) => (
                <a
                  key={`${artifact.kind}-${artifact.url}`}
                  href={artifact.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl p-4 text-sm transition hover:-translate-y-0.5"
                  style={{ border: "1px solid var(--border)", color: "var(--ink)" }}
                >
                  <span className="block text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--muted)" }}>
                    {artifact.kind}
                  </span>
                  <span className="mt-1 block font-medium">{artifact.label}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </section>

      <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
        <div
          className="rounded-3xl p-5"
          style={{
            border: "1px solid var(--border)",
            background: "color-mix(in oklab, var(--surface) 92%, transparent)",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--muted)" }}>
                Gate status
              </p>
              <h2 className="mt-1 text-2xl font-semibold">
                {decisionLabel(currentReview?.decision)}
              </h2>
            </div>
            <span
              className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.16em]"
              style={{
                background:
                  currentReview?.decision === "approved"
                    ? "color-mix(in oklab, #22c55e 24%, transparent)"
                    : currentReview?.decision === "failed"
                      ? "color-mix(in oklab, var(--bad) 24%, transparent)"
                      : "color-mix(in oklab, var(--accent) 16%, transparent)",
                color: "var(--ink)",
                border: "1px solid var(--border)",
              }}
            >
              {currentReview?.decision ?? "pending"}
            </span>
          </div>
          {currentReview && (
            <p className="mt-3 text-xs leading-5" style={{ color: "var(--muted)" }}>
              Last reviewed by {currentReview.reviewerName || "Reviewer"} on{" "}
              {formatReviewDate(currentReview.reviewedAt)}.
            </p>
          )}
        </div>

        <div
          className="rounded-3xl p-5"
          style={{
            border: "1px solid var(--border)",
            background: "color-mix(in oklab, var(--surface) 92%, transparent)",
          }}
        >
          <h2 className="text-xl font-semibold">Review checklist</h2>
          <div className="mt-4 space-y-4">
            {run.checklist.map((item) => (
              <fieldset
                key={item.id}
                className="rounded-2xl p-4"
                style={{ border: "1px solid var(--border)", background: "var(--bg)" }}
              >
                <legend className="px-1 text-sm font-semibold">
                  {item.label} {item.required && <span style={{ color: "var(--accent)" }}>*</span>}
                </legend>
                <p className="mt-2 text-xs leading-5" style={{ color: "var(--muted)" }}>
                  {item.expected}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {CHECKLIST_OPTIONS.map((option) => {
                    const active = checklist[item.id] === option.value;
                    return (
                      <label
                        key={option.value}
                        className="cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em]"
                        style={{
                          border: "1px solid var(--border)",
                          background: active ? "var(--accent)" : "transparent",
                          color: active ? "var(--accent-fg)" : "var(--ink-soft)",
                        }}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          name={`checklist-${item.id}`}
                          value={option.value}
                          checked={active}
                          onChange={() => updateChecklist(item.id, option.value)}
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>

          {requiredFailures.length > 0 && (
            <p id="required-checklist-warning" className="mt-4 text-xs leading-5" style={{ color: "var(--muted)" }}>
              Required items not marked pass yet: {requiredFailures.map((item) => item.label).join(", ")}
            </p>
          )}
        </div>

        <div
          className="rounded-3xl p-5"
          style={{
            border: "1px solid var(--border)",
            background: "color-mix(in oklab, var(--surface) 92%, transparent)",
          }}
        >
          <label className="text-sm font-semibold" htmlFor="reviewer-name">
            Reviewer name
          </label>
          <input
            id="reviewer-name"
            value={reviewerName}
            maxLength={80}
            onChange={(event) => setReviewerName(event.target.value)}
            className="mt-2 w-full rounded-2xl px-4 py-3 text-base outline-none"
            style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--ink)" }}
          />

          <label className="mt-4 block text-sm font-semibold" htmlFor="qa-notes">
            Notes for Atlas Dev
          </label>
          <textarea
            id="qa-notes"
            value={notes}
            maxLength={2000}
            onChange={(event) => setNotes(event.target.value)}
            rows={6}
            placeholder="Required if failing. Tell Atlas what feels right, what feels off, or what must change before this ships."
            className="mt-2 w-full resize-y rounded-2xl px-4 py-3 text-base outline-none"
            style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--ink)" }}
          />

          {error && (
            <p role="alert" className="mt-3 rounded-xl px-3 py-2 text-sm" style={{ background: "color-mix(in oklab, var(--bad) 18%, transparent)" }}>
              {error}
            </p>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => submitDecision("failed")}
              disabled={Boolean(submittingDecision)}
              className="rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-[0.16em] disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                background: "color-mix(in oklab, var(--bad) 20%, transparent)",
                border: "1px solid color-mix(in oklab, var(--bad) 45%, var(--border))",
                color: "var(--ink)",
              }}
            >
              {submittingDecision === "failed" ? "Saving…" : "Fail / request fixes"}
            </button>
            <button
              type="button"
              onClick={() => submitDecision("approved")}
              disabled={approveDisabled}
              aria-describedby={requiredFailures.length > 0 ? "required-checklist-warning" : undefined}
              className="rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-[0.16em] disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              {submittingDecision === "approved" ? "Saving…" : "Approve"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
