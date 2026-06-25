#!/usr/bin/env tsx
import { getQaGateRun, type QaGateReview } from "../src/lib/qa-gates";
import { summarizeQaGateStatus, unreadableQaGateStatus } from "../src/lib/qa-gate-status";

type Args = {
  deployment?: string;
  runId?: string;
  password?: string;
  cookie?: string;
  requireApproved: boolean;
  json: boolean;
  help: boolean;
};

function usage() {
  return `Usage: npx tsx scripts/check-qa-gate-status.ts --run <run-id> --deployment <url> [options]

Options:
  --run <run-id>           QA gate run id to check.
  --deployment <url>       App base URL, for example https://<preview>.vercel.app.
  --password <password>    QA gate password. Defaults to QA_GATE_PASSWORD env.
  --cookie <cookie>        Existing Cookie header value. Defaults to QA_GATE_COOKIE env.
  --require-approved       Exit non-zero unless latest review is approved.
  --json                   Print JSON summary instead of plain text.
  --help                   Show this help.

Exit codes:
  0 = readable status, or approved when --require-approved is used
  1 = failed/pending/unreadable when --require-approved is used, or invalid args
  2 = network/auth/read error without a readable status
`;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    requireApproved: false,
    json: false,
    help: false,
    password: process.env.QA_GATE_PASSWORD,
    cookie: process.env.QA_GATE_COOKIE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case "--run":
      case "--run-id":
        args.runId = argv[++index];
        break;
      case "--deployment":
      case "--base-url":
        args.deployment = argv[++index];
        break;
      case "--password":
        args.password = argv[++index];
        break;
      case "--cookie":
        args.cookie = argv[++index];
        break;
      case "--require-approved":
        args.requireApproved = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function normalizeDeployment(value: string): string {
  return value.replace(/\/+$/, "");
}

function cookieHeaderFromSetCookie(value: string | null): string | undefined {
  if (!value) return undefined;
  return value
    .split(/,(?=[^;]+?=)/)
    .map((cookie) => cookie.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

async function loginForCookie(baseUrl: string, runId: string, password: string): Promise<string | undefined> {
  const form = new URLSearchParams({
    password,
    next: `/qa/gates/${runId}`,
  });
  const response = await fetch(`${baseUrl}/api/qa/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  if (response.status !== 303) {
    throw new Error(`QA login failed with HTTP ${response.status}`);
  }

  return cookieHeaderFromSetCookie(response.headers.get("set-cookie"));
}

async function loadRemoteReview(baseUrl: string, runId: string, cookie?: string): Promise<QaGateReview | null> {
  const response = await fetch(`${baseUrl}/api/qa/gates/${encodeURIComponent(runId)}/review`, {
    headers: cookie ? { Cookie: cookie } : undefined,
  });

  if (response.status === 404) {
    throw new Error(`QA gate '${runId}' was not found on ${baseUrl}`);
  }
  if (response.status === 401) {
    throw new Error("Unauthorized reading QA gate review; provide --password or --cookie");
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to read QA gate review: HTTP ${response.status}${body ? ` ${body}` : ""}`);
  }

  const payload = (await response.json()) as { review?: QaGateReview | null };
  return payload.review ?? null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.runId) throw new Error("Missing --run <run-id>");
  if (!args.deployment) throw new Error("Missing --deployment <url>");

  const run = getQaGateRun(args.runId);
  if (!run) throw new Error(`Unknown local QA gate run '${args.runId}'`);

  const baseUrl = normalizeDeployment(args.deployment);
  let cookie = args.cookie;
  if (!cookie && args.password) {
    cookie = await loginForCookie(baseUrl, args.runId, args.password);
  }

  const review = await loadRemoteReview(baseUrl, args.runId, cookie);
  const summary = summarizeQaGateStatus(run, review);

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`${summary.status.toUpperCase()}: ${summary.message}`);
    if (summary.reviewedAt) console.log(`Reviewed at: ${summary.reviewedAt}`);
    if (summary.notes) console.log(`Notes: ${summary.notes}`);
  }

  if (args.requireApproved && !summary.approved) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown QA gate status error";
  const runArgIndex = process.argv.findIndex((arg) => arg === "--run" || arg === "--run-id");
  const runId = runArgIndex >= 0 ? process.argv[runArgIndex + 1] : "unknown";
  const summary = unreadableQaGateStatus(runId, message);

  if (process.argv.includes("--json")) {
    console.error(JSON.stringify(summary, null, 2));
  } else {
    console.error(`${summary.status.toUpperCase()}: ${summary.message}`);
  }

  process.exitCode = process.argv.includes("--require-approved") ? 1 : 2;
});
