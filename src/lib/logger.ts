/**
 * Phase 15-01: Structured logging primitives.
 *
 * Design (D-05, D-06):
 * - Emit one JSON line per call to console (Vercel function logs).
 * - Required fields: `level`, `event`, `timestamp`, plus optional `route`,
 *   `actor`, `metadata`, `error`.
 * - Always redact secret-shaped keys (case-insensitive substring match) anywhere
 *   in the metadata tree before serialization.
 * - Never log: raw request bodies, full env values, auth headers, cookies,
 *   API keys, raw CSVs, full DATABASE_URL, etc.
 * - Errors are summarized to `{ name, message }` only -- stack traces can leak
 *   filesystem paths and are intentionally omitted.
 *
 * Public surface:
 *   - `logEvent({ level, event, route?, actor?, metadata? })`
 *   - `logError({ event, route?, actor?, metadata?, error })`
 *   - `safeErrorSummary(error)` for callers that build their own metadata
 */

import "server-only";

export type LogLevel = "info" | "warn" | "error";

export type LogEventInput = {
  level: LogLevel;
  event: string;
  route?: string;
  actor?: string | null;
  metadata?: Record<string, unknown>;
};

export type LogErrorInput = Omit<LogEventInput, "level"> & {
  error: unknown;
};

export type SafeErrorSummary = { name: string; message: string };

// Substrings (case-insensitive) that mark a field as secret-shaped. Anything
// matching is replaced with "[REDACTED]" before serialization.
const SECRET_KEY_SUBSTRINGS = [
  "password",
  "secret",
  "token",
  "apikey",
  "api_key",
  "authorization",
  "auth_header",
  "cookie",
  "set-cookie",
  "session",
  "csrf",
  "database_url",
  "resend_api_key",
  "client_secret",
  "private_key",
  "raw_csv",
  "rawcsv",
  "raw_body",
  "rawbody",
];

const REDACTED = "[REDACTED]";

function shouldRedactKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SECRET_KEY_SUBSTRINGS.some((s) => lower.includes(s));
}

/**
 * Deep-clones `value`, redacting any field whose key matches a secret-shaped
 * substring. Calls `toJSON` first (if present) so callers can't smuggle secrets
 * through a custom serializer.
 *
 * WR-D: every operation that touches user-supplied values is guarded.
 * Property getters may throw (Proxy traps, lazy fields backed by a closed
 * connection, etc.); a single throwing getter must not propagate out of
 * the logger and unwind a route's catch-block into a generic Next 500.
 * `Object.entries` itself can throw on a Proxy whose `ownKeys` trap
 * throws; that case falls through to "[UNREADABLE]" for the whole node.
 */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]"; // defense against pathological nesting

  if (value === null || value === undefined) return value;

  // Materialize toJSON output FIRST so we can redact its keys (the test
  // "no key bleed-through" covers this path).
  if (typeof value === "object" && value !== null && "toJSON" in value && typeof (value as { toJSON?: unknown }).toJSON === "function") {
    try {
      const serialized = (value as { toJSON: () => unknown }).toJSON();
      return redact(serialized, depth + 1);
    } catch {
      return "[UNSERIALIZABLE]";
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => {
      try {
        return redact(item, depth + 1);
      } catch {
        return "[UNREADABLE]";
      }
    });
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    // Object.entries itself can throw on a Proxy whose ownKeys/getOwnPropertyDescriptor
    // traps throw. Guard the entries() call separately from each per-key access.
    let entries: [string, unknown][];
    try {
      entries = Object.entries(value as Record<string, unknown>);
    } catch {
      return "[UNREADABLE]";
    }
    for (const [k, v] of entries) {
      if (shouldRedactKey(k)) {
        out[k] = REDACTED;
        continue;
      }
      // A throwing getter is invoked at the destructuring above (`v` already
      // holds the getter result). Wrap the recursive redact() call so a
      // descendant getter or stringifier throw is caught at the lowest
      // possible scope -- replacing only the offending sub-value, not the
      // whole metadata tree.
      try {
        out[k] = redact(v, depth + 1);
      } catch {
        out[k] = "[UNREADABLE]";
      }
    }
    return out;
  }

  // BigInt is a primitive but JSON.stringify rejects it (TypeError). Convert
  // to a tagged string so emit()'s stringify never trips on it.
  if (typeof value === "bigint") {
    return `[BIGINT:${(value as bigint).toString()}]`;
  }

  // Primitives pass through unchanged.
  return value;
}

/**
 * WR-08: scrub Postgres-driver error messages of the bound-parameter values
 * they helpfully (and dangerously) echo back. A unique-constraint violation
 * on `orders.buyer_email` produces a driver message that includes
 *   `Key (buyer_email)=(viki@example.com) already exists.`
 * which copies the buyer's email — and therefore PII — verbatim into our
 * logs unless we strip it. The redaction is intentionally conservative:
 *
 *   - `Key (col1, col2)=(v1, v2)` -> `Key (col1, col2)=[REDACTED]`
 *     (covers the most common pg constraint-violation phrasing)
 *   - Any remaining `email@host` substring -> `[REDACTED_EMAIL]`
 *   - 7+ consecutive digits not adjacent to letters -> `[REDACTED_NUMBER]`
 *     (catches phone numbers; deliberately lenient to avoid eating order
 *      counters or similar operational integers we WANT in the log)
 *
 * If the resulting message is huge (some pg drivers append the full statement
 * + parameter list), it is truncated to keep log lines bounded.
 */
const MAX_SAFE_ERROR_MESSAGE_LENGTH = 500;

function scrubErrorMessage(raw: string): string {
  let scrubbed = raw;
  // Drop the `=(...)` value clause that pg drivers tack on to constraint
  // violations. Non-greedy match against the closing paren handles nested
  // commas in composite-key values.
  scrubbed = scrubbed.replace(
    /(Key\s*\([^)]*\))\s*=\s*\([^)]*\)/gi,
    "$1=[REDACTED]",
  );
  // Email-shaped substrings anywhere in the remainder.
  scrubbed = scrubbed.replace(
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    "[REDACTED_EMAIL]",
  );
  // Phone-number-shaped digit runs (7+ digits not bordered by letters/digits).
  scrubbed = scrubbed.replace(
    /(?<![A-Za-z0-9])\d{7,}(?![A-Za-z0-9])/g,
    "[REDACTED_NUMBER]",
  );
  if (scrubbed.length > MAX_SAFE_ERROR_MESSAGE_LENGTH) {
    scrubbed = `${scrubbed.slice(0, MAX_SAFE_ERROR_MESSAGE_LENGTH)}…[TRUNCATED]`;
  }
  return scrubbed;
}

export function safeErrorSummary(error: unknown): SafeErrorSummary {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: scrubErrorMessage(error.message || ""),
    };
  }
  if (typeof error === "string") {
    return { name: "UnknownError", message: scrubErrorMessage(error) };
  }
  if (error && typeof error === "object" && "message" in (error as Record<string, unknown>)) {
    const message = scrubErrorMessage(String((error as { message: unknown }).message));
    const name =
      typeof (error as { name?: unknown }).name === "string"
        ? ((error as { name: string }).name)
        : "UnknownError";
    return { name, message };
  }
  return { name: "UnknownError", message: scrubErrorMessage(String(error)) };
}

/**
 * WR-D: a JSON.stringify replacer that turns BigInt into a tagged string so
 * a stray BigInt in metadata (or in a deeply nested non-redacted value that
 * slipped through `redact`) cannot throw out of `emit()`. The `redact` walk
 * already coerces BigInt at top level; this is a belt-and-suspenders guard
 * for any value that bypassed redact (e.g. the top-level `error` summary).
 */
function safeStringifyReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return `[BIGINT:${value.toString()}]`;
  }
  return value;
}

function emit(level: LogLevel, payload: Record<string, unknown>): void {
  // WR-D: never throw out of emit(). A serialization failure (BigInt,
  // circular reference, a getter that slipped past redact) must degrade
  // to a minimal one-liner rather than unwind a route's catch block.
  let line: string;
  try {
    line = JSON.stringify(payload, safeStringifyReplacer);
  } catch {
    line = JSON.stringify({
      level,
      event: "log.serialize_failed",
      timestamp: new Date().toISOString(),
    });
  }
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logEvent({
  level,
  event,
  route,
  actor,
  metadata,
}: LogEventInput): void {
  const payload: Record<string, unknown> = {
    level,
    event,
    timestamp: new Date().toISOString(),
  };
  if (route) payload.route = route;
  if (actor) payload.actor = actor;
  if (metadata) payload.metadata = redact(metadata);
  emit(level, payload);
}

export function logError({
  event,
  route,
  actor,
  metadata,
  error,
}: LogErrorInput): void {
  const payload: Record<string, unknown> = {
    level: "error",
    event,
    timestamp: new Date().toISOString(),
    error: safeErrorSummary(error),
  };
  if (route) payload.route = route;
  if (actor) payload.actor = actor;
  if (metadata) payload.metadata = redact(metadata);
  emit("error", payload);
}
