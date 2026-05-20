import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireAdmin, mockGetAdminHealthSnapshot } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockGetAdminHealthSnapshot: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/admin-check", () => ({
  requireAdmin: mockRequireAdmin,
}));
vi.mock("@/db/admin-health", () => ({
  getAdminHealthSnapshot: mockGetAdminHealthSnapshot,
}));

import { GET } from "../route";

const adminSession = {
  user: { email: "admin@example.com", name: "Admin User" },
};

function makeRequest(): Request {
  return new Request("http://localhost:3000/api/admin/health");
}

const ORIGINAL_ENV: Record<string, string | undefined> = {};
const TRACKED_KEYS = [
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "RESEND_API_KEY",
  "SELLER_EMAIL",
  "ADMIN_EMAIL",
  // Phase 23 D-13: presence check for cron Bearer secret.
  "CRON_SECRET",
];

beforeEach(() => {
  for (const key of TRACKED_KEYS) {
    ORIGINAL_ENV[key] = process.env[key];
  }
  mockRequireAdmin.mockReset();
  mockGetAdminHealthSnapshot.mockReset();
});

afterEach(() => {
  for (const key of TRACKED_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = ORIGINAL_ENV[key];
    }
  }
});

function setEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function happySnapshot(overrides: Record<string, unknown> = {}) {
  return {
    database: "ok",
    lastOrderAt: "2026-04-29T12:34:56.000Z",
    lastImportAt: "2026-04-28T11:00:00.000Z",
    lastAuditAt: "2026-04-29T13:00:00.000Z",
    // Phase 23 D-06: timestamp of the most recent price_refresh audit row.
    lastPriceRefreshAt: "2026-05-19T09:00:42.000Z",
    ...overrides,
  };
}

describe("GET /api/admin/health", () => {
  it("returns 401 when requireAdmin returns a 401 Response", async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetAdminHealthSnapshot).not.toHaveBeenCalled();
  });

  it("returns 403 when requireAdmin returns a 403 Response", async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      Response.json({ error: "Forbidden" }, { status: 403 }),
    );

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
    expect(mockGetAdminHealthSnapshot).not.toHaveBeenCalled();
  });

  it("returns ok=true and all checks configured when all env vars and DB are healthy", async () => {
    setEnv({
      AUTH_SECRET: "non-empty",
      AUTH_GOOGLE_ID: "client-id",
      AUTH_GOOGLE_SECRET: "client-secret",
      RESEND_API_KEY: "re_xxx",
      SELLER_EMAIL: "seller@example.com",
      // Phase 23 D-13: required for top-level ok=true; literal-only check.
      CRON_SECRET: "hex-secret-not-echoed",
    });
    mockRequireAdmin.mockResolvedValueOnce(adminSession);
    mockGetAdminHealthSnapshot.mockResolvedValueOnce(happySnapshot());

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.checks).toEqual({
      database: "ok",
      authSecret: "configured",
      googleOAuth: "configured",
      email: "configured",
      cronSecret: "configured",
    });
    expect(body.recent).toMatchObject({
      lastOrderAt: "2026-04-29T12:34:56.000Z",
      lastImportAt: "2026-04-28T11:00:00.000Z",
      lastAuditAt: "2026-04-29T13:00:00.000Z",
      lastPriceRefreshAt: "2026-05-19T09:00:42.000Z",
    });
    // Phase 23 D-06: replaced the retired notificationFailuresLast24h field.
    expect("lastPriceRefreshAt" in body.recent).toBe(true);
    expect("notificationFailuresLast24h" in body.recent).toBe(false);
  });

  it("reports AUTH_SECRET missing without exposing any env value", async () => {
    setEnv({
      AUTH_SECRET: undefined,
      AUTH_GOOGLE_ID: "client-id",
      AUTH_GOOGLE_SECRET: "client-secret",
      RESEND_API_KEY: "re_xxx",
      SELLER_EMAIL: "seller@example.com",
      CRON_SECRET: "hex-secret-not-echoed",
    });
    mockRequireAdmin.mockResolvedValueOnce(adminSession);
    mockGetAdminHealthSnapshot.mockResolvedValueOnce(happySnapshot());

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.ok).toBe(false);
    expect(body.checks.authSecret).toBe("missing");
    expect(body.checks.googleOAuth).toBe("configured");
    expect(body.checks.email).toBe("configured");
    expect(body.checks.cronSecret).toBe("configured");

    // No env values leak.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("client-id");
    expect(serialized).not.toContain("client-secret");
    expect(serialized).not.toContain("re_xxx");
    expect(serialized).not.toContain("seller@example.com");
    expect(serialized).not.toContain("hex-secret-not-echoed");
  });

  it("reports googleOAuth missing when either AUTH_GOOGLE_ID or AUTH_GOOGLE_SECRET is unset", async () => {
    setEnv({
      AUTH_SECRET: "non-empty",
      AUTH_GOOGLE_ID: "client-id",
      AUTH_GOOGLE_SECRET: undefined,
      RESEND_API_KEY: "re_xxx",
      SELLER_EMAIL: "seller@example.com",
      CRON_SECRET: "hex-secret-not-echoed",
    });
    mockRequireAdmin.mockResolvedValueOnce(adminSession);
    mockGetAdminHealthSnapshot.mockResolvedValueOnce(happySnapshot());

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.checks.googleOAuth).toBe("missing");
    expect(body.ok).toBe(false);
  });

  it("reports email missing when RESEND_API_KEY or SELLER_EMAIL is unset", async () => {
    setEnv({
      AUTH_SECRET: "non-empty",
      AUTH_GOOGLE_ID: "client-id",
      AUTH_GOOGLE_SECRET: "client-secret",
      RESEND_API_KEY: undefined,
      SELLER_EMAIL: "seller@example.com",
      CRON_SECRET: "hex-secret-not-echoed",
    });
    mockRequireAdmin.mockResolvedValueOnce(adminSession);
    mockGetAdminHealthSnapshot.mockResolvedValueOnce(happySnapshot());

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.checks.email).toBe("missing");
    expect(body.ok).toBe(false);
  });

  // Phase 23 D-13: CRON_SECRET missing must flip ok=false and surface
  // checks.cronSecret === "missing"; the helper for the page-local envChecks()
  // mirrors the same logic. Tested as a deficiency (200, not 503).
  it("reports cronSecret missing and ok=false when CRON_SECRET is unset (fail-closed env check)", async () => {
    setEnv({
      AUTH_SECRET: "non-empty",
      AUTH_GOOGLE_ID: "client-id",
      AUTH_GOOGLE_SECRET: "client-secret",
      RESEND_API_KEY: "re_xxx",
      SELLER_EMAIL: "seller@example.com",
      CRON_SECRET: undefined,
    });
    mockRequireAdmin.mockResolvedValueOnce(adminSession);
    mockGetAdminHealthSnapshot.mockResolvedValueOnce(happySnapshot());

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.checks.cronSecret).toBe("missing");
    expect(body.checks.database).toBe("ok");
  });

  // Phase 23 D-13: CRON_SECRET configured surfaces both
  // checks.cronSecret === "configured" and the snapshot's lastPriceRefreshAt
  // without ever serializing the secret value.
  it("reports cronSecret configured and surfaces lastPriceRefreshAt when CRON_SECRET is set", async () => {
    setEnv({
      AUTH_SECRET: "non-empty",
      AUTH_GOOGLE_ID: "client-id",
      AUTH_GOOGLE_SECRET: "client-secret",
      RESEND_API_KEY: "re_xxx",
      SELLER_EMAIL: "seller@example.com",
      CRON_SECRET: "DEADBEEF-NEVER-ECHOED-IN-RESPONSE",
    });
    mockRequireAdmin.mockResolvedValueOnce(adminSession);
    mockGetAdminHealthSnapshot.mockResolvedValueOnce(
      happySnapshot({ lastPriceRefreshAt: "2026-05-19T09:00:42.000Z" }),
    );

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.checks.cronSecret).toBe("configured");
    expect(body.recent.lastPriceRefreshAt).toBe("2026-05-19T09:00:42.000Z");

    // Secret value never appears in the serialized response.
    expect(JSON.stringify(body)).not.toContain(
      "DEADBEEF-NEVER-ECHOED-IN-RESPONSE",
    );
  });

  it("returns ok=false when the database is unreachable", async () => {
    setEnv({
      AUTH_SECRET: "non-empty",
      AUTH_GOOGLE_ID: "client-id",
      AUTH_GOOGLE_SECRET: "client-secret",
      RESEND_API_KEY: "re_xxx",
      SELLER_EMAIL: "seller@example.com",
      CRON_SECRET: "hex-secret-not-echoed",
    });
    mockRequireAdmin.mockResolvedValueOnce(adminSession);
    mockGetAdminHealthSnapshot.mockResolvedValueOnce(
      happySnapshot({
        database: "error",
        lastOrderAt: null,
        lastImportAt: null,
        lastAuditAt: null,
        lastPriceRefreshAt: null,
      }),
    );

    const res = await GET(makeRequest());
    const body = await res.json();

    // 503 lets external HTTP-status monitors alert on DB outage; the detailed
    // body still says ok=false for human/admin consumption.
    expect(res.status).toBe(503);
    expect(body.checks.database).toBe("error");
    expect(body.ok).toBe(false);
  });

  it("returns 200 when only env config is missing (deficiency, not outage)", async () => {
    // A missing SELLER_EMAIL is a configuration deficiency surfaced via the
    // admin UI -- it must NOT trip an external HTTP-status monitor.
    setEnv({
      AUTH_SECRET: "non-empty",
      AUTH_GOOGLE_ID: "client-id",
      AUTH_GOOGLE_SECRET: "client-secret",
      RESEND_API_KEY: "re_xxx",
      SELLER_EMAIL: undefined,
      CRON_SECRET: "hex-secret-not-echoed",
    });
    mockRequireAdmin.mockResolvedValueOnce(adminSession);
    mockGetAdminHealthSnapshot.mockResolvedValueOnce(happySnapshot());

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.checks.email).toBe("missing");
  });

  it("never includes secret values in the response, even when env values are set to obvious markers", async () => {
    setEnv({
      AUTH_SECRET: "SECRET_AUTH_VALUE",
      AUTH_GOOGLE_ID: "GOOGLE_ID_VALUE",
      AUTH_GOOGLE_SECRET: "GOOGLE_SECRET_VALUE",
      RESEND_API_KEY: "RESEND_VALUE",
      SELLER_EMAIL: "seller-marker@example.com",
      CRON_SECRET: "CRON_SECRET_MARKER_VALUE",
    });
    mockRequireAdmin.mockResolvedValueOnce(adminSession);
    mockGetAdminHealthSnapshot.mockResolvedValueOnce(happySnapshot());

    const res = await GET(makeRequest());
    const body = await res.json();
    const serialized = JSON.stringify(body);

    for (const marker of [
      "SECRET_AUTH_VALUE",
      "GOOGLE_ID_VALUE",
      "GOOGLE_SECRET_VALUE",
      "RESEND_VALUE",
      "seller-marker@example.com",
      "CRON_SECRET_MARKER_VALUE",
    ]) {
      expect(serialized).not.toContain(marker);
    }
  });

  it("propagates recent timestamps from the snapshot helper", async () => {
    setEnv({
      AUTH_SECRET: "non-empty",
      AUTH_GOOGLE_ID: "client-id",
      AUTH_GOOGLE_SECRET: "client-secret",
      RESEND_API_KEY: "re_xxx",
      SELLER_EMAIL: "seller@example.com",
      CRON_SECRET: "hex-secret-not-echoed",
    });
    mockRequireAdmin.mockResolvedValueOnce(adminSession);
    mockGetAdminHealthSnapshot.mockResolvedValueOnce({
      database: "ok",
      lastOrderAt: null,
      lastImportAt: "2026-04-30T08:00:00.000Z",
      lastAuditAt: null,
      lastPriceRefreshAt: null,
    });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.recent.lastOrderAt).toBeNull();
    expect(body.recent.lastImportAt).toBe("2026-04-30T08:00:00.000Z");
    expect(body.recent.lastAuditAt).toBeNull();
    expect(body.recent.lastPriceRefreshAt).toBeNull();
  });
});
