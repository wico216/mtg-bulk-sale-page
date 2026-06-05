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

export type QaGateEvidenceStatus = "passed" | "failed" | "warning" | "not-run";

export interface QaGateProofRun {
  tool: string;
  recordedAt: string;
  targetUrl: string;
  browser: string;
  command: string;
  resultSummary: string;
}

export interface QaGateEvidence {
  id: string;
  checklistItemId?: string;
  title: string;
  expected: string;
  observed: string;
  status: QaGateEvidenceStatus;
  artifactKind: QaGateArtifact["kind"];
  artifactUrl?: string;
  timestamp?: string;
}

export interface QaGateRun {
  id: string;
  ticketId: string;
  ticketUrl?: string;
  title: string;
  featureArea: string;
  summary: string;
  changeSummary: string[];
  reviewerInstructions: string[];
  proofRun: QaGateProofRun;
  evidence: QaGateEvidence[];
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
    id: "latest-mtg-bulk-changes",
    ticketId: "WIKO-LATEST-CHANGES",
    ticketUrl: "/docs/qa-approval-gates.md",
    title: "Latest MTG bulk-page changes — approval gate",
    featureArea: "Wiko's Spellbook / production acceptance",
    summary:
      "Review packet for the current feat/qa-approval-gates working tree: the admin Price Movers report plus the new human-in-the-loop QA approval gate itself.",
    changeSummary: [
      "Added an admin-only Price Movers report under /admin/prices so Wiko can spot inventory cards that rose in value after price refreshes.",
      "Added price snapshot/delta tracking during refreshes so the report compares previous and current card prices instead of guessing from overwritten values.",
      "Added a password-protected QA approval gate under /qa/gates where Atlas attaches recorded browser proof, expected behavior, reviewer checklist, comments, and approve/fail controls.",
      "Hardened the gate so crafted API approvals cannot bypass required checklist failures and QA login redirects stay relative/trusted-origin.",
    ],
    reviewerInstructions: [
      "Watch the embedded desktop Price Movers walkthrough first; it visibly scrolls and highlights the report sections, rising cards, source boxes, price delta math, and desktop admin layout.",
      "Use the artifact links if you also want to review the QA gate's own Chromium/WebKit proof videos.",
      "Mark required checklist rows Pass only if the proof matches what you expect for a production-bound Spellbook change.",
      "If anything feels off, choose Fail / request fixes and leave comments for Atlas Dev before this ships.",
    ],
    proofRun: {
      tool: "Playwright",
      recordedAt: "2026-06-05T00:07:29.000Z",
      targetUrl: "/admin/prices",
      browser: "Chromium desktop walkthrough fixture proof",
      command:
        "NODE_PATH=node_modules node /tmp/wiko-record-desktop-price-proof.cjs against /admin/prices fixture server",
      resultSummary:
        "Passed: Price Movers report rendered rising cards, source boxes, value deltas, inventory upside, active nav, and no horizontal overflow.",
    },
    createdAt: "2026-06-05T00:07:29.000Z",
    branch: "feat/qa-approval-gates",
    commitSha: "1c84b23+working-tree",
    deploymentUrl: "/admin/prices",
    videoUrl: "/qa-artifacts/latest-mtg-bulk-price-movers-desktop-walkthrough.mp4",
    expectedBehavior: [
      "The Price Movers admin report is available from the admin nav and explains that it surfaces cards that jumped in value.",
      "The report shows rising cards with source box context, previous/current prices, dollar gain, percent gain, quantity, and inventory upside.",
      "The report remains readable on mobile admin widths without horizontal overflow.",
      "The QA approval gate lets Wiko review recorded proof, mark checklist rows, leave comments, and approve or fail the latest changes remotely.",
      "Server-side review rules require all required checklist rows to pass before approval and require comments when failing/requesting fixes.",
    ],
    checklist: [
      {
        id: "price-movers-route",
        label: "Price Movers route is reviewable",
        expected: "The proof shows /admin/prices with the Price movers heading and active Price Movers admin nav item.",
        required: true,
      },
      {
        id: "value-deltas-clear",
        label: "Value movement math is clear",
        expected: "The proof shows previous/current prices, gain, percent movement, quantity, and inventory upside for a rising card.",
        required: true,
      },
      {
        id: "physical-location-context",
        label: "Source box context is visible",
        expected: "The report makes it clear where to physically find valuable movers, including source box/binder context.",
        required: true,
      },
      {
        id: "mobile-admin-safe",
        label: "Mobile admin layout is safe",
        expected: "The Playwright proof verifies the report has no horizontal overflow at mobile admin size.",
        required: true,
      },
      {
        id: "qa-gate-flow-useful",
        label: "QA approval gate is useful",
        expected: "This page gives Wiko enough context, video proof, checklist controls, and notes/approve/fail actions to approve or reject without manual click-through.",
        required: true,
      },
      {
        id: "security-guards-covered",
        label: "Approval guardrails are covered",
        expected: "Tests cover required-checklist server enforcement, fail notes, persisted review semantics, and safe relative QA login redirects.",
        required: true,
      },
    ],
    evidence: [
      {
        id: "price-movers-route",
        checklistItemId: "price-movers-route",
        title: "Admin Price Movers report opens",
        expected: "The admin route renders a Price movers heading and active nav link.",
        observed: "Playwright passed the /admin/prices smoke and asserted the Price Movers nav link is aria-current=page.",
        status: "passed",
        artifactKind: "video",
        artifactUrl: "/qa-artifacts/latest-mtg-bulk-price-movers-desktop-walkthrough.mp4",
        timestamp: "0:01",
      },
      {
        id: "value-deltas-clear",
        checklistItemId: "value-deltas-clear",
        title: "Rising card math is visible",
        expected: "A mover row includes previous/current prices, gain, and inventory upside.",
        observed: "The proof checks Rhystic Study with $38.20 → $51.75, +$13.55, and +$9.00 inventory upside.",
        status: "passed",
        artifactKind: "video",
        artifactUrl: "/qa-artifacts/latest-mtg-bulk-price-movers-desktop-walkthrough.mp4",
        timestamp: "0:03",
      },
      {
        id: "mobile-admin-safe",
        checklistItemId: "mobile-admin-safe",
        title: "Mobile overflow guard passed",
        expected: "The admin report should not require side-scrolling on a phone-width viewport.",
        observed: "The Playwright assertion confirmed document scroll width stays within viewport width.",
        status: "passed",
        artifactKind: "other",
        timestamp: "0:06",
      },
      {
        id: "qa-gate-flow-useful",
        checklistItemId: "qa-gate-flow-useful",
        title: "Human approval surface is available",
        expected: "Wiko can review video proof, mark checklist rows, leave notes, and approve or fail.",
        observed: "The QA gate E2E passed in Chromium and WebKit; slow proof videos are attached as artifacts.",
        status: "passed",
        artifactKind: "video",
        artifactUrl: "/qa-artifacts/qa-gate-proof-chromium-slow10x.mp4",
        timestamp: "0:00",
      },
    ],
    artifacts: [
      {
        label: "Embedded desktop Price Movers walkthrough video",
        url: "/qa-artifacts/latest-mtg-bulk-price-movers-desktop-walkthrough.mp4",
        kind: "video",
      },
      {
        label: "QA gate Chromium proof video",
        url: "/qa-artifacts/qa-gate-proof-chromium-slow10x.mp4",
        kind: "video",
      },
      {
        label: "QA gate WebKit/Safari proof video",
        url: "/qa-artifacts/qa-gate-proof-webkit-slow10x.mp4",
        kind: "video",
      },
      {
        label: "Price Movers admin route",
        url: "/admin/prices",
        kind: "deployment",
      },
    ],
  },
  {
    id: "demo-mobile-storefront-gate",
    ticketId: "QA-GATE-DEMO",
    ticketUrl: "/docs/qa-approval-gates.md",
    title: "Demo — Human-in-the-loop Acceptance Gate",
    featureArea: "Production acceptance / human review",
    summary:
      "A sample acceptance packet showing how Atlas can exercise a change in the browser, attach recorded proof, and ask Wiko for a clear approve/fail decision before publishing.",
    changeSummary: [
      "Built a human-in-the-loop QA approval surface for production-bound changes.",
      "The gate packages a ticket summary, expected behavior, recorded browser proof, artifact links, and a reviewer checklist into one browser-openable page.",
      "Failed reviews capture comments for Atlas Dev so the next agent loop knows exactly what to fix.",
    ],
    reviewerInstructions: [
      "First watch the recorded browser proof video; you should not need to manually click through every screen yourself.",
      "Compare the observed proof against each expected behavior item and mark the checklist Pass, Fail, or N/A.",
      "Approve only when required checklist rows are passing. If something is off, press Fail / request fixes and leave notes describing what Atlas should change.",
    ],
    proofRun: {
      tool: "Playwright",
      recordedAt: "2026-06-04T00:00:00.000Z",
      targetUrl: "https://wikospellbinder.com",
      browser: "Chromium desktop fixture proof",
      command:
        "PLAYWRIGHT_PORT=3202 CI=1 npx playwright test e2e/admin-responsive.spec.ts --project=chromium --reporter=list --workers=1 -g 'QA gate'",
      resultSummary:
        "Agent proof packet demonstrates the gate page structure, embedded video, expected behavior copy, checklist controls, notes, and approve/fail actions.",
    },
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
    evidence: [
      {
        id: "video-visible",
        checklistItemId: "video-visible",
        title: "Video proof is visible",
        expected: "The QA gate embeds a browser-recorded proof video with playback controls.",
        observed: "The reviewer page renders an HTML video player at the top of the acceptance packet.",
        status: "passed",
        artifactKind: "video",
        artifactUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm",
        timestamp: "0:00",
      },
      {
        id: "expected-readable",
        checklistItemId: "expected-readable",
        title: "Ticket intent is readable",
        expected: "Wiko can understand what changed and what to look for without opening the PR.",
        observed: "The packet includes change summary, reviewer instructions, expected behavior, and checklist copy.",
        status: "passed",
        artifactKind: "screenshot",
        timestamp: "0:06",
      },
      {
        id: "notes-decision",
        checklistItemId: "notes-decision",
        title: "Review decision is actionable",
        expected: "Approve/fail actions are paired with notes for Atlas Dev when the gate fails.",
        observed: "The side panel includes reviewer name, comments, Approve, and Fail / request fixes controls.",
        status: "passed",
        artifactKind: "other",
        timestamp: "0:12",
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
