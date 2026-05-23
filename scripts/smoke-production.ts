#!/usr/bin/env tsx
/**
 * Phase 15-02: Production smoke script.
 *
 * Goals (per 15-CONTEXT D-09 and 15-02 PLAN):
 *   - Repeatable, checked in, runnable as `npm run smoke:production`.
 *   - Guard-focused. The script is read-only AGAINST PRODUCTION DATA but
 *     intentionally issues an UNAUTHENTICATED `DELETE /api/admin/cards` as
 *     part of check #4 to verify that the route's `requireAdmin()` guard
 *     returns 401 BEFORE any state is touched. The expectation -- the only
 *     valid response -- is HTTP 401. If the deployment is misconfigured
 *     such that the guard is bypassed and the DELETE returns 200, this
 *     script BAILS LOUDLY (FAIL result + non-zero exit) so the operator
 *     does not silently destroy inventory. See WR-04: the failure mode of
 *     a deployment with broken auth is exactly the case the smoke is
 *     designed to catch, and it is the deployment's misconfiguration --
 *     not the smoke -- that would be the destructive event.
 *   - Help is available without secrets so a fresh operator can read the
 *     interface before running anything against a real deployment.
 *
 * What it checks against the deployment URL:
 *   1. GET /                   -> 200, HTML markers present
 *   2. GET /admin/login        -> 200, "Sign in with Google" visible,
 *                                       no local password field in production
 *   3. GET /admin              -> 302/307 redirect to /admin/login when no auth
 *   4. DELETE /api/admin/cards -> MUST be 401 (auth guard). Anything else
 *                                 (especially 200) is treated as a hard FAIL.
 *                                 Skipped when --read-only is set.
 *   5. GET  /api/admin/health  -> 401 (admin-only)
 *
 * Vercel protection bypass:
 *   If the deployment is protected by Vercel Authentication, pass
 *   `--bypass-token <token>` to send `x-vercel-protection-bypass` and
 *   `x-vercel-set-bypass-cookie: true`. Token is never echoed in output and
 *   is not stored. Alternatively, omit and run from `vercel curl` shell.
 */

const HELP = `\
Usage: npm run smoke:production -- --deployment <url> [options]

Required:
  --deployment <url>         Full https URL of the deployment to probe
                             (e.g. https://your-app.vercel.app)

Optional:
  --bypass-token <token>     Vercel protection bypass token. Sent as
                             x-vercel-protection-bypass header. Never logged.
  --timeout-ms <number>      Per-request timeout in ms. Default: 15000.
  --read-only                Skip mutation-method auth probes. Use this for
                             scheduled production monitoring where checks must
                             never send DELETE/POST/PATCH requests.
  --json                     Emit results as a single JSON line at the end.
  -h, --help                 Show this help and exit.

Behavior:
  - Guard-focused. The default mode is read-only against production data,
    except that it issues a guarded, unauthenticated DELETE /api/admin/cards
    probe to verify that requireAdmin() rejects with 401 BEFORE any state is
    touched. The expected (and only valid) response is 401. If the
    DELETE ever returns 200, the smoke fails loudly so a misconfigured
    deployment's broken auth is surfaced immediately. Use --read-only for
    scheduled production monitoring to skip that mutation-method probe.
  - Exit code is 0 if every check passes, 1 otherwise.
  - No secret values are printed (env vars, tokens, cookies all redacted).

Examples:
  npm run smoke:production -- --help
  npm run smoke:production -- --deployment https://your-app.vercel.app
  npm run smoke:production:readonly -- --deployment https://your-app.vercel.app
  npm run smoke:production -- --deployment https://preview.vercel.app \\
    --bypass-token "\$VERCEL_BYPASS_TOKEN"
`;

interface Args {
  deployment?: string;
  bypassToken?: string;
  timeoutMs: number;
  readOnly: boolean;
  json: boolean;
  help: boolean;
}

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { timeoutMs: 15_000, readOnly: false, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "-h":
      case "--help":
        args.help = true;
        break;
      case "--deployment":
        args.deployment = argv[++i];
        break;
      case "--bypass-token":
        args.bypassToken = argv[++i];
        break;
      case "--timeout-ms":
        args.timeoutMs = Number.parseInt(argv[++i] ?? "", 10) || 15_000;
        break;
      case "--read-only":
        args.readOnly = true;
        break;
      case "--json":
        args.json = true;
        break;
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown flag: ${arg}`);
        }
    }
  }
  return args;
}

function bypassHeaders(token: string | undefined): Record<string, string> {
  if (!token) return {};
  return {
    "x-vercel-protection-bypass": token,
    "x-vercel-set-bypass-cookie": "true",
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs: number },
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "manual" });
  } finally {
    clearTimeout(timer);
  }
}

async function checkHome(base: string, args: Args): Promise<CheckResult> {
  const res = await fetchWithTimeout(`${base}/`, {
    method: "GET",
    headers: bypassHeaders(args.bypassToken),
    timeoutMs: args.timeoutMs,
  });
  if (res.status !== 200) {
    return { name: "GET /", ok: false, detail: `status=${res.status}, expected 200` };
  }
  const body = await res.text();
  // A minimal HTML marker. Avoid matching brittle copy.
  if (!body.toLowerCase().includes("<html")) {
    return { name: "GET /", ok: false, detail: "response body did not look like HTML" };
  }
  return { name: "GET /", ok: true, detail: "200 + HTML" };
}

async function checkLoginPage(base: string, args: Args): Promise<CheckResult> {
  const res = await fetchWithTimeout(`${base}/admin/login`, {
    method: "GET",
    headers: bypassHeaders(args.bypassToken),
    timeoutMs: args.timeoutMs,
  });
  if (res.status !== 200) {
    return {
      name: "GET /admin/login",
      ok: false,
      detail: `status=${res.status}, expected 200`,
    };
  }
  const body = await res.text();
  const hasGoogle = body.includes("Sign in with Google");
  // Local password input should be hidden in production. The credentials form
  // renders <input id="admin-password" .../> -- absence of that id is the
  // canonical "password login hidden" signal.
  const hasPasswordField = body.includes('id="admin-password"');
  if (!hasGoogle) {
    return {
      name: "GET /admin/login",
      ok: false,
      detail: 'expected "Sign in with Google" copy on login page',
    };
  }
  if (hasPasswordField) {
    return {
      name: "GET /admin/login",
      ok: false,
      detail: "local password field is visible in production (expected hidden)",
    };
  }
  return {
    name: "GET /admin/login",
    ok: true,
    detail: "Google sign-in visible, password field hidden",
  };
}

async function checkAdminRedirect(base: string, args: Args): Promise<CheckResult> {
  const res = await fetchWithTimeout(`${base}/admin`, {
    method: "GET",
    headers: bypassHeaders(args.bypassToken),
    timeoutMs: args.timeoutMs,
  });
  const isRedirect = res.status === 302 || res.status === 307 || res.status === 308;
  const location = res.headers.get("location") ?? "";
  if (!isRedirect || !location.includes("/admin/login")) {
    return {
      name: "GET /admin (unauth)",
      ok: false,
      detail: `status=${res.status}, location="${location}", expected 30x to /admin/login`,
    };
  }
  return {
    name: "GET /admin (unauth)",
    ok: true,
    detail: `redirected to ${location}`,
  };
}

async function checkAdminMutationGuard(base: string, args: Args): Promise<CheckResult> {
  // DELETE /api/admin/cards is the delete-all endpoint. Unauthenticated calls
  // must return 401 JSON via requireAdmin(). We intentionally use DELETE so
  // the test exercises a mutation method -- but the route returns 401 before
  // touching any state.
  //
  // WR-04: if the deployment is misconfigured such that the auth guard is
  // bypassed, this call would (in the worst case) reach the delete-all
  // handler and destroy inventory. We treat that case as a hard FAIL with
  // an explicit "CRITICAL" detail string so the operator notices
  // immediately; the smoke is the right place to surface this because
  // catching a broken auth guard is precisely its purpose.
  const res = await fetchWithTimeout(`${base}/api/admin/cards`, {
    method: "DELETE",
    headers: bypassHeaders(args.bypassToken),
    timeoutMs: args.timeoutMs,
  });
  if (res.status === 200) {
    return {
      name: "DELETE /api/admin/cards (unauth)",
      ok: false,
      detail:
        "CRITICAL: status=200 from unauthenticated DELETE -- requireAdmin guard is broken on this deployment. Inventory may have been touched. Investigate auth env (AUTH_SECRET, ADMIN_EMAIL, AUTH_GOOGLE_*) immediately.",
    };
  }
  if (res.status !== 401) {
    return {
      name: "DELETE /api/admin/cards (unauth)",
      ok: false,
      detail: `status=${res.status}, expected 401`,
    };
  }
  return {
    name: "DELETE /api/admin/cards (unauth)",
    ok: true,
    detail: "401 from requireAdmin guard",
  };
}

async function checkHealthGuard(base: string, args: Args): Promise<CheckResult> {
  const res = await fetchWithTimeout(`${base}/api/admin/health`, {
    method: "GET",
    headers: bypassHeaders(args.bypassToken),
    timeoutMs: args.timeoutMs,
  });
  if (res.status !== 401) {
    return {
      name: "GET /api/admin/health (unauth)",
      ok: false,
      detail: `status=${res.status}, expected 401`,
    };
  }
  return {
    name: "GET /api/admin/health (unauth)",
    ok: true,
    detail: "401 from requireAdmin guard",
  };
}

function printSummary(args: Args, deployment: string, results: CheckResult[]) {
  if (args.json) {
    // Single JSON line for easy log parsing.
    const payload = {
      deployment,
      ok: results.every((r) => r.ok),
      results: results.map((r) => ({ name: r.name, ok: r.ok, detail: r.detail })),
    };
    console.log(JSON.stringify(payload));
    return;
  }
  console.log(`\nProduction smoke against: ${deployment}`);
  console.log("=".repeat(64));
  for (const r of results) {
    const mark = r.ok ? "PASS" : "FAIL";
    console.log(`[${mark}] ${r.name} -- ${r.detail}`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log("-".repeat(64));
  console.log(`${passed} / ${results.length} checks passed`);
}

async function main() {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${(error as Error).message}\n`);
    console.error(HELP);
    process.exit(1);
  }

  if (args.help) {
    console.log(HELP);
    return;
  }

  if (!args.deployment) {
    console.error("Error: --deployment <url> is required.\n");
    console.error(HELP);
    process.exit(1);
  }

  // Normalize: strip trailing slash so we can build paths consistently.
  const base = args.deployment.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) {
    console.error("Error: --deployment must be an http(s) URL.\n");
    process.exit(1);
  }

  const checks = args.readOnly
    ? [checkHome, checkLoginPage, checkAdminRedirect, checkHealthGuard]
    : [
        checkHome,
        checkLoginPage,
        checkAdminRedirect,
        checkAdminMutationGuard,
        checkHealthGuard,
      ];

  const results: CheckResult[] = [];
  for (const check of checks) {
    try {
      const result = await check(base, args);
      results.push(result);
    } catch (error) {
      results.push({
        name: check.name,
        ok: false,
        detail: `threw: ${(error as Error).name}: ${(error as Error).message}`,
      });
    }
  }

  printSummary(args, base, results);
  const ok = results.every((r) => r.ok);
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(`Unexpected error: ${(error as Error).message}`);
  process.exit(1);
});
