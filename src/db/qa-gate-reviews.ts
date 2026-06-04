import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adminAuditLog } from "@/db/schema";
import type { QaChecklistState, QaGateDecision, QaGateReview } from "@/lib/qa-gates";

const QA_GATE_REVIEW_ACTION = "qa_gate.review";
const QA_GATE_TARGET_TYPE = "qa_gate";

export type SaveQaGateReviewInput = {
  runId: string;
  decision: QaGateDecision;
  notes: string;
  reviewerName: string;
  checklist: Record<string, QaChecklistState>;
  actorEmail: string | null;
};

type QaReviewMetadata = {
  decision?: unknown;
  notes?: unknown;
  reviewerName?: unknown;
  checklist?: unknown;
};

function metadataToReview(
  metadata: unknown,
  createdAt: Date | string,
  actorEmail: string | null,
): QaGateReview | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const data = metadata as QaReviewMetadata;
  if (data.decision !== "approved" && data.decision !== "failed") {
    return null;
  }

  const reviewedAt =
    createdAt instanceof Date ? createdAt.toISOString() : new Date(createdAt).toISOString();

  return {
    decision: data.decision,
    notes: typeof data.notes === "string" ? data.notes : "",
    reviewerName:
      typeof data.reviewerName === "string" ? data.reviewerName : "Reviewer",
    checklist:
      data.checklist && typeof data.checklist === "object" && !Array.isArray(data.checklist)
        ? (data.checklist as Record<string, QaChecklistState>)
        : {},
    reviewedAt,
    actorEmail,
  };
}

export async function getLatestQaGateReview(
  runId: string,
): Promise<QaGateReview | null> {
  const [row] = await db
    .select()
    .from(adminAuditLog)
    .where(
      and(
        eq(adminAuditLog.action, QA_GATE_REVIEW_ACTION),
        eq(adminAuditLog.targetType, QA_GATE_TARGET_TYPE),
        eq(adminAuditLog.targetId, runId),
      ),
    )
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(1);

  if (!row) return null;
  return metadataToReview(row.metadata, row.createdAt, row.actorEmail);
}

export async function saveQaGateReview(
  input: SaveQaGateReviewInput,
): Promise<QaGateReview> {
  const [row] = await db
    .insert(adminAuditLog)
    .values({
      action: QA_GATE_REVIEW_ACTION,
      actorEmail: input.actorEmail,
      targetType: QA_GATE_TARGET_TYPE,
      targetId: input.runId,
      targetCount: 1,
      metadata: {
        decision: input.decision,
        notes: input.notes,
        reviewerName: input.reviewerName,
        checklist: input.checklist,
      },
    })
    .returning();

  const review = metadataToReview(row.metadata, row.createdAt, row.actorEmail);
  if (!review) {
    throw new Error("Failed to read saved QA gate review");
  }
  return review;
}
