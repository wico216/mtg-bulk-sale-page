export type QaGateDecision = "approved" | "failed";
export type QaChecklistState = "pass" | "fail" | "na" | "unchecked";

export interface QaChecklistItem {
  id: string;
  label: string;
  expected: string;
  required?: boolean;
}

export interface QaGateArtifact {
  label: string;
  url: string;
  kind: "video" | "screenshot" | "trace" | "deployment" | "other";
}

export interface QaGateRun {
  id: string;
  title: string;
  featureArea: string;
  summary: string;
  createdAt: string;
  branch?: string;
  commitSha?: string;
  prUrl?: string;
  deploymentUrl?: string;
  videoUrl?: string;
  videoPosterUrl?: string;
  expectedBehavior: string[];
  checklist: QaChecklistItem[];
  artifacts: QaGateArtifact[];
}

export interface QaGateReview {
  decision: QaGateDecision;
  notes: string;
  reviewerName: string;
  checklist: Record<string, QaChecklistState>;
  reviewedAt: string;
  actorEmail?: string | null;
}

export const QA_CHECKLIST_STATES: readonly QaChecklistState[] = [
  "pass",
  "fail",
  "na",
  "unchecked",
] as const;

export const QA_GATE_RUNS: readonly QaGateRun[] = [
  {
    id: "demo-mobile-storefront-gate",
    title: "Demo — Mobile Storefront Approval Gate",
    featureArea: "Mobile storefront / filter UX",
    summary:
      "A sample approval packet showing how Wiko can review Playwright proof from a phone or laptop before a feature is approved.",
    createdAt: "2026-06-04T00:00:00.000Z",
    branch: "feat/qa-approval-gates",
    deploymentUrl: "https://wikospellbinder.com",
    videoUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm",
    expectedBehavior: [
      "The reviewer can watch the Playwright proof video directly in the browser.",
      "The expected behavior and checklist are visible beside the artifact, so approval is based on product intent instead of only test output.",
      "The reviewer can mark checklist rows, leave notes, and approve or fail the feature from a remote device.",
      "The final decision is saved server-side as an audit-log event for traceability.",
    ],
    checklist: [
      {
        id: "video-visible",
        label: "Video proof is visible",
        expected: "The approval page embeds the recorded Playwright video with playback controls.",
        required: true,
      },
      {
        id: "expected-readable",
        label: "Expected behavior is readable",
        expected: "The reviewer can understand what the feature was supposed to do without opening the PR.",
        required: true,
      },
      {
        id: "notes-decision",
        label: "Notes and decision are available",
        expected: "The page has a notes field plus clear Approve and Fail actions.",
        required: true,
      },
      {
        id: "remote-useful",
        label: "Remote review flow works",
        expected: "The page is designed for a Vercel URL, not a local Mac-only artifact path.",
        required: true,
      },
      {
        id: "spellbook-feel",
        label: "Spellbook review packet feels on-brand",
        expected: "The approval surface should feel like Wiko's Spellbook, not a generic CI artifact dump.",
      },
    ],
    artifacts: [
      {
        label: "Production storefront",
        url: "https://wikospellbinder.com",
        kind: "deployment",
      },
      {
        label: "Sample video placeholder — future runs use Playwright artifacts",
        url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm",
        kind: "video",
      },
    ],
  },
];

export function listQaGateRuns(): QaGateRun[] {
  return [...QA_GATE_RUNS].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getQaGateRun(runId: string): QaGateRun | undefined {
  return QA_GATE_RUNS.find((run) => run.id === runId);
}

export function isQaChecklistState(value: unknown): value is QaChecklistState {
  return (
    typeof value === "string" &&
    QA_CHECKLIST_STATES.includes(value as QaChecklistState)
  );
}

export function normalizeQaChecklist(
  value: unknown,
  run: QaGateRun,
): Record<string, QaChecklistState> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;
  const normalized: Record<string, QaChecklistState> = {};
  for (const item of run.checklist) {
    const state = input[item.id] ?? "unchecked";
    if (!isQaChecklistState(state)) {
      return null;
    }
    normalized[item.id] = state;
  }
  return normalized;
}

export function emptyQaChecklist(run: QaGateRun): Record<string, QaChecklistState> {
  return Object.fromEntries(
    run.checklist.map((item) => [item.id, "unchecked" as const]),
  );
}
