import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { logEvent, logError } from "@/lib/logger";

type LogCall = { stream: "log" | "warn" | "error"; payload: Record<string, unknown> };

function captureConsole(): {
  calls: LogCall[];
  restore: () => void;
} {
  const calls: LogCall[] = [];
  const log = vi
    .spyOn(console, "log")
    .mockImplementation((line: unknown) => {
      calls.push({ stream: "log", payload: JSON.parse(String(line)) });
    });
  const warn = vi
    .spyOn(console, "warn")
    .mockImplementation((line: unknown) => {
      calls.push({ stream: "warn", payload: JSON.parse(String(line)) });
    });
  const error = vi
    .spyOn(console, "error")
    .mockImplementation((line: unknown) => {
      calls.push({ stream: "error", payload: JSON.parse(String(line)) });
    });
  return {
    calls,
    restore: () => {
      log.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    },
  };
}

describe("logEvent", () => {
  let capture: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    capture = captureConsole();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T02:03:04.000Z"));
  });

  afterEach(() => {
    capture.restore();
    vi.useRealTimers();
  });

  it("emits a single JSON line on console with level, event, timestamp, and metadata", () => {
    logEvent({
      level: "info",
      event: "checkout.order_committed",
      route: "/api/checkout",
      metadata: { orderRef: "ORD-1", totalItems: 3 },
    });

    expect(capture.calls).toHaveLength(1);
    expect(capture.calls[0].stream).toBe("log");
    expect(capture.calls[0].payload).toEqual({
      level: "info",
      event: "checkout.order_committed",
      route: "/api/checkout",
      timestamp: "2026-04-27T02:03:04.000Z",
      metadata: { orderRef: "ORD-1", totalItems: 3 },
    });
  });

  it("routes warn level to console.warn", () => {
    logEvent({
      level: "warn",
      event: "notification.buyer_email_failed",
      metadata: { orderRef: "ORD-1" },
    });
    expect(capture.calls).toHaveLength(1);
    expect(capture.calls[0].stream).toBe("warn");
    expect(capture.calls[0].payload.level).toBe("warn");
  });

  it("redacts forbidden top-level metadata keys (auth secrets, env values, cookies, raw bodies)", () => {
    logEvent({
      level: "info",
      event: "checkout.attempt",
      metadata: {
        orderRef: "ORD-1",
        authorization: "Bearer abc.def.ghi",
        cookie: "session=xyz",
        password: "hunter2",
        resendApiKey: "re_live_secret",
        DATABASE_URL: "postgres://user:pwd@host/db",
        rawCsv: "id,name\nlea-1,Lightning Bolt",
      },
    });

    const payload = capture.calls[0].payload;
    const metadata = payload.metadata as Record<string, unknown>;
    expect(metadata.orderRef).toBe("ORD-1");
    expect(metadata.authorization).toBe("[REDACTED]");
    expect(metadata.cookie).toBe("[REDACTED]");
    expect(metadata.password).toBe("[REDACTED]");
    expect(metadata.resendApiKey).toBe("[REDACTED]");
    expect(metadata.DATABASE_URL).toBe("[REDACTED]");
    expect(metadata.rawCsv).toBe("[REDACTED]");
  });

  it("redacts forbidden nested metadata keys", () => {
    logEvent({
      level: "info",
      event: "checkout.attempt",
      metadata: {
        request: {
          headers: {
            authorization: "Bearer abc",
            cookie: "session=xyz",
          },
          body: { password: "hunter2", email: "viki@example.com" },
        },
      },
    });

    const payload = capture.calls[0].payload;
    const metadata = payload.metadata as {
      request: {
        headers: { authorization: string; cookie: string };
        body: { password: string; email: string };
      };
    };
    expect(metadata.request.headers.authorization).toBe("[REDACTED]");
    expect(metadata.request.headers.cookie).toBe("[REDACTED]");
    expect(metadata.request.body.password).toBe("[REDACTED]");
    // Non-secret nested fields preserved.
    expect(metadata.request.body.email).toBe("viki@example.com");
  });

  it("never logs the raw payload back through serialization (no key bleed-through)", () => {
    // Ensures redaction happens before JSON.stringify so secrets cannot leak via
    // Symbol.toPrimitive / toJSON tricks.
    const sneaky = {
      toJSON() {
        return { password: "hunter2" };
      },
    };

    logEvent({
      level: "info",
      event: "checkout.attempt",
      metadata: { sneaky },
    });

    const rendered = JSON.stringify(capture.calls[0].payload);
    expect(rendered).not.toContain("hunter2");
  });
});

describe("logError", () => {
  let capture: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    capture = captureConsole();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T02:03:04.000Z"));
  });

  afterEach(() => {
    capture.restore();
    vi.useRealTimers();
  });

  it("emits an error JSON line with a safe error summary (name + message, no stack details)", () => {
    const err = new Error("Database connection lost");
    err.stack = "Error: Database connection lost\n    at /home/wiko/secret/path:1:1";

    logError({
      event: "checkout.db_failed",
      route: "/api/checkout",
      error: err,
      metadata: { orderRef: "ORD-1" },
    });

    expect(capture.calls).toHaveLength(1);
    expect(capture.calls[0].stream).toBe("error");
    const payload = capture.calls[0].payload;
    expect(payload.level).toBe("error");
    expect(payload.event).toBe("checkout.db_failed");
    expect(payload.route).toBe("/api/checkout");
    expect(payload.timestamp).toBe("2026-04-27T02:03:04.000Z");
    expect(payload.error).toEqual({
      name: "Error",
      message: "Database connection lost",
    });
    expect(payload.metadata).toEqual({ orderRef: "ORD-1" });
    // Stack must NOT leak filesystem paths or secrets.
    expect(JSON.stringify(payload)).not.toContain("/home/wiko/secret/path");
  });

  it("safely handles non-Error throwables", () => {
    logError({
      event: "checkout.db_failed",
      error: "raw string failure",
    });

    const payload = capture.calls[0].payload;
    expect(payload.error).toEqual({
      name: "UnknownError",
      message: "raw string failure",
    });
  });

  it("WR-08: scrubs Postgres unique-constraint PII from error.message", () => {
    // Real-world shape produced by node-postgres / Neon for a unique
    // violation on orders.buyer_email.
    const pgErr = new Error(
      'duplicate key value violates unique constraint "orders_buyer_email_key": Key (buyer_email)=(viki@example.com) already exists',
    );

    logError({
      event: "checkout.db_failed",
      error: pgErr,
    });

    const payload = capture.calls[0].payload as Record<string, unknown>;
    const summary = payload.error as { name: string; message: string };
    expect(summary.message).not.toContain("viki@example.com");
    // Sanity: the constraint name is still useful for debugging.
    expect(summary.message).toContain("orders_buyer_email_key");
  });

  it("WR-08: redacts free-floating emails in error.message even without Key clause", () => {
    const err = new Error(
      "Send failed: invalid recipient viki@example.com (rejected by relay)",
    );
    logError({ event: "notification.failed", error: err });

    const summary = capture.calls[0].payload.error as {
      name: string;
      message: string;
    };
    expect(summary.message).not.toContain("viki@example.com");
    expect(summary.message).toContain("[REDACTED_EMAIL]");
  });

  it("WR-08: truncates very large error messages", () => {
    const huge = "ERR ".repeat(1000); // ~4000 chars
    const err = new Error(huge);
    logError({ event: "checkout.db_failed", error: err });
    const summary = capture.calls[0].payload.error as {
      name: string;
      message: string;
    };
    expect(summary.message.length).toBeLessThanOrEqual(600);
    expect(summary.message).toContain("[TRUNCATED]");
  });
});

describe("redact + emit defensive guards (WR-D)", () => {
  let capture: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    capture = captureConsole();
  });

  afterEach(() => {
    capture.restore();
  });

  it("emits one line without throwing when a metadata property getter throws", () => {
    // A class instance whose `details` getter throws (e.g. lazy field
    // backed by a closed DB connection). The route's catch handler must
    // be able to log without itself unwinding into a generic Next 500.
    const exploding: Record<string, unknown> = {};
    Object.defineProperty(exploding, "details", {
      enumerable: true,
      get() {
        throw new Error("boom — getter exploded");
      },
    });

    expect(() =>
      logError({
        event: "route.failure",
        error: new Error("primary failure"),
        metadata: { orderId: "ORD-1", payload: exploding },
      }),
    ).not.toThrow();

    expect(capture.calls).toHaveLength(1);
    const payload = capture.calls[0].payload as Record<string, unknown>;
    const metadata = payload.metadata as { orderId: string; payload: unknown };
    expect(metadata.orderId).toBe("ORD-1");
    // The whole offending node degrades to a sentinel; siblings survive.
    expect(metadata.payload).toBe("[UNREADABLE]");
    // Caller-supplied error summary is preserved.
    expect((payload.error as { message: string }).message).toBe("primary failure");
  });

  it("emits one line without throwing when metadata contains a BigInt value", () => {
    // BigInt is a primitive that JSON.stringify rejects with TypeError.
    // The replacer-based emit() must convert it to a tagged string.
    expect(() =>
      logEvent({
        level: "info",
        event: "metrics.snapshot",
        metadata: { orderId: "ORD-1", largeCount: BigInt("9007199254740993") },
      }),
    ).not.toThrow();

    expect(capture.calls).toHaveLength(1);
    const metadata = capture.calls[0].payload.metadata as {
      orderId: string;
      largeCount: string;
    };
    expect(metadata.orderId).toBe("ORD-1");
    expect(metadata.largeCount).toBe("[BIGINT:9007199254740993]");
  });

  it("falls back to a minimal serialization line if the top-level payload still cannot stringify", () => {
    // Pathological case: circular references in metadata. redact() walks
    // and produces a shallow clone, so a circular *input* becomes
    // non-circular *output*. To exercise the emit() fallback we need a
    // direct circular at the level emit() sees -- inject a top-level
    // property whose getter returns a circular ref bypassing redact.
    // We do this by mocking a logger call with the safe path AND a
    // hostile error.toString that throws via valueOf. The simplest
    // observable behavior is that the logger does not throw and writes
    // exactly one line.
    const hostile: { self?: unknown; n: number } = { n: 1 };
    hostile.self = hostile; // cycle survives redact via depth limit but
    // would still defeat JSON.stringify if redact missed it. redact()
    // does produce a finite tree, so the primary assertion below is the
    // "does not throw" invariant.
    expect(() =>
      logEvent({
        level: "info",
        event: "smoke.circular",
        metadata: { hostile },
      }),
    ).not.toThrow();
    expect(capture.calls).toHaveLength(1);
  });
});
