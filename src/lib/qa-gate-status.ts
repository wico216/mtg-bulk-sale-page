import type { QaGateReview, QaGateRun } from "./qa-gates";

export type QaGateStatus = "approved" | "failed" | "pending" | "unreadable";

export interface QaGateStatusSummary {
  runId: string;
  status: QaGateStatus;
  approved: boolean;
  message: string;
  reviewedAt?: string;
  reviewerName?: string;
  notes?: string;
}

export function summarizeQaGateStatus(
  run: Pick<QaGateRun, "id" | "title">,
  review: QaGateReview | null,
): QaGateStatusSummary {
  if (!review) {
    return {
      runId: run.id,
      status: "pending",
      approved: false,
      message: `QA gate '${run.title}' is pending review.`,
    };
  }

  if (review.decision === "approved") {
    return {
      runId: run.id,
      status: "approved",
      approved: true,
      message: `QA gate '${run.title}' was approved by ${review.reviewerName || "Reviewer"}.`,
      reviewedAt: review.reviewedAt,
      reviewerName: review.reviewerName,
      notes: review.notes,
    };
  }

  return {
    runId: run.id,
    status: "failed",
    approved: false,
    message: `QA gate '${run.title}' failed review and needs fixes.`,
    reviewedAt: review.reviewedAt,
    reviewerName: review.reviewerName,
    notes: review.notes,
  };
}

export function unreadableQaGateStatus(runId: string, reason: string): QaGateStatusSummary {
  return {
    runId,
    status: "unreadable",
    approved: false,
    message: reason,
  };
}
