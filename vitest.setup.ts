// Loaded as a vitest `setupFiles` entry (see vitest.config.ts).
//
// Three responsibilities:
//   1. Register `@testing-library/jest-dom` matchers (`toBeInTheDocument`,
//      etc.) — only meaningful inside DOM-environment tests; in node-env
//      tests the import is a no-op (the matcher exports just append to
//      vitest's `expect`).
//   2. Provide cleanup() between tests so React Testing Library doesn't
//      leak DOM nodes across files.
//   3. Replace happy-dom's localStorage / Node 25's experimental built-in
//      localStorage with a predictable in-memory shim. Reason: Node 25
//      ships an experimental localStorage that requires
//      `--localstorage-file` and lacks `.clear()`; happy-dom's
//      `Window.localStorage` exposes a full Storage implementation but
//      vitest's worker pool exposes Node's built-in first, leading to
//      surprising `clear is not a function` errors. The shim guarantees
//      Phase 19 store tests have a real Storage interface.
//
// All three are tolerant of the `node` default env. The library's matchers
// gate themselves on `expect`, which exists in either env. cleanup() is
// safe to call when there's no document (it short-circuits).
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

// Override on globalThis so both `localStorage` (bare) and `window.localStorage`
// resolve to the shim. happy-dom's window.localStorage shadows globalThis;
// reassigning the descriptor ensures consistency across both views.
const memoryLocal = new MemoryStorage();
const memorySession = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  value: memoryLocal,
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, "sessionStorage", {
  value: memorySession,
  configurable: true,
  writable: true,
});
if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: memoryLocal,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, "sessionStorage", {
    value: memorySession,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  // happy-dom-only: cleans up React-rendered nodes. No-op in node env.
  if (typeof document !== "undefined") cleanup();
  // Reset shim storage between tests to keep them isolated.
  memoryLocal.clear();
  memorySession.clear();
});
