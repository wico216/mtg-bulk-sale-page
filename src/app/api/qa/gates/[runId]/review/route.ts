import { getQaGateAccess } from "@/lib/qa-gate-auth";
import {
  getQaGateRun,
  normalizeQaChecklist,
  type QaGateDecision,
} from "@/lib/qa-gates";
import { clientKeyFromRequest, enforceRateLimit, RATE_LIMIT_BUCKETS } from "@/lib/rate-limit";
import { logError, logEvent } from "@/lib/logger";

const ROUTE = "/api/qa/gates/[runId]/review";
const MAX_NOTES_LENGTH = 2000;
const MAX_REVIEWER_NAME_LENGTH = 80;

function isDecision(value: unknown): value is QaGateDecision {
  return value === "approved" || value === "failed";
}

function parseText(value: unknown, maxLength: number, field: string): string | Response {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    return Response.json({ error: `${field} must be a string` }, { status: 400 });
  }
  if (value.length > maxLength) {
    return Response.json(
      { error: `${field} must be ${maxLength} characters or fewer` },
      { status: 400 },
    );
  }
  return value.trim();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const access = await getQaGateAccess();
  if (!access.ok) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { runId } = await params;
  const run = getQaGateRun(runId);
  if (!run) return Response.json({ error: "QA gate not found" }, { status: 404 });

  try {
    const { getLatestQaGateReview } = await import("@/db/qa-gate-reviews");
    const review = await getLatestQaGateReview(runId);
    return Response.json({ review });
  } catch (err) {
    logError({ event: "qa_gate.review_load_failed", route: ROUTE, error: err, metadata: { runId } });
    return Response.json({ error: "Failed to load QA gate review" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const access = await getQaGateAccess();
  if (!access.ok) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await enforceRateLimit({
    key: clientKeyFromRequest(request, access.actorEmail ?? "qa-reviewer"),
    config: RATE_LIMIT_BUCKETS.ADMIN_MUTATION,
  });
  if (rateLimited) return rateLimited;

  const { runId } = await params;
  const run = getQaGateRun(runId);
  if (!run) return Response.json({ error: "QA gate not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = body as {
    decision?: unknown;
    notes?: unknown;
    reviewerName?: unknown;
    checklist?: unknown;
  };

  if (!isDecision(payload.decision)) {
    return Response.json(
      { error: "decision must be approved or failed" },
      { status: 400 },
    );
  }

  const notes = parseText(payload.notes, MAX_NOTES_LENGTH, "notes");
  if (notes instanceof Response) return notes;

  const reviewerName = parseText(
    payload.reviewerName,
    MAX_REVIEWER_NAME_LENGTH,
    "reviewerName",
  );
  if (reviewerName instanceof Response) return reviewerName;

  const checklist = normalizeQaChecklist(payload.checklist, run);
  if (!checklist) {
    return Response.json({ error: "Invalid checklist payload" }, { status: 400 });
  }

  try {
    const { saveQaGateReview } = await import("@/db/qa-gate-reviews");
    const review = await saveQaGateReview({
      runId,
      decision: payload.decision,
      notes,
      reviewerName: reviewerName || "Reviewer",
      checklist,
      actorEmail: access.actorEmail,
    });

    logEvent({
      level: "info",
      event: "qa_gate.review_saved",
      route: ROUTE,
      actor: access.actorEmail,
      metadata: { runId, decision: payload.decision, via: access.via },
    });

    return Response.json({ success: true, review });
  } catch (err) {
    logError({ event: "qa_gate.review_save_failed", route: ROUTE, error: err, metadata: { runId } });
    return Response.json({ error: "Failed to save QA gate review" }, { status: 500 });
  }
}
