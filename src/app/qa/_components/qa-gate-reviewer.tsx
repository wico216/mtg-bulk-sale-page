"use client";

import { useMemo, useState } from "react";
import type {
  QaChecklistState,
  QaGateDecision,
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

  function updateChecklist(itemId: string, state: QaChecklistState) {
    setChecklist((prev) => ({ ...prev, [itemId]: state }));
  }

  async function submitDecision(decision: QaGateDecision) {
    setError(null);
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
          <h2 className="text-xl font-semibold">Expected behavior</h2>
          <ol className="mt-4 space-y-3 text-sm leading-6" style={{ color: "var(--ink-soft)" }}>
            {run.expectedBehavior.map((item, index) => (
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
              {new Date(currentReview.reviewedAt).toLocaleString()}.
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
            <p className="mt-4 text-xs leading-5" style={{ color: "var(--muted)" }}>
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
            placeholder="What feels right, what feels off, or what must change before this ships?"
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
              {submittingDecision === "failed" ? "Saving…" : "Fail"}
            </button>
            <button
              type="button"
              onClick={() => submitDecision("approved")}
              disabled={Boolean(submittingDecision)}
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
