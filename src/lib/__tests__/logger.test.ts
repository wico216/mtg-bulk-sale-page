import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
});
