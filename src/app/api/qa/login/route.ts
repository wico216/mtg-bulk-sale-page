import { NextResponse } from "next/server";
import {
  createQaGateToken,
  isQaGateConfigured,
  QA_GATE_COOKIE_MAX_AGE_SECONDS,
  QA_GATE_COOKIE_NAME,
  safeQaNextPath,
  verifyQaGatePassword,
} from "@/lib/qa-gate-auth";
import { clientKeyFromRequest, enforceRateLimit, RATE_LIMIT_BUCKETS } from "@/lib/rate-limit";
import { e2eFixturesEnabled } from "@/lib/e2e-fixtures";
import { logEvent } from "@/lib/logger";

const ROUTE = "/api/qa/login";

function qaRedirect(location: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: location },
  });
}

function qaLoginLocation(error: "bad-password" | "not-configured", next: string): string {
  const params = new URLSearchParams({ error, next });
  return `/qa/login?${params.toString()}`;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = formData.get("password");
  const next = safeQaNextPath(
    typeof formData.get("next") === "string" ? (formData.get("next") as string) : null,
  );
  if (!isQaGateConfigured()) {
    return qaRedirect(qaLoginLocation("not-configured", next));
  }

  if (!e2eFixturesEnabled()) {
    const rateLimited = await enforceRateLimit({
      key: clientKeyFromRequest(request, "qa-login"),
      config: RATE_LIMIT_BUCKETS.ADMIN_MUTATION,
    });
    if (rateLimited) return rateLimited;
  }

  if (typeof password !== "string" || !verifyQaGatePassword(password)) {
    logEvent({ level: "warn", event: "qa_gate.login_failed", route: ROUTE });
    return qaRedirect(qaLoginLocation("bad-password", next));
  }

  const response = qaRedirect(next);
  response.cookies.set(QA_GATE_COOKIE_NAME, createQaGateToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: QA_GATE_COOKIE_MAX_AGE_SECONDS,
  });

  logEvent({ level: "info", event: "qa_gate.login_succeeded", route: ROUTE });
  return response;
}
