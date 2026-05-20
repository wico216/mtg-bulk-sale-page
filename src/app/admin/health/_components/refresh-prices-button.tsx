"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Phase 23 Plan 23-01 — Manual price-refresh escape hatch.
 *
 * Mounts next to the "Last price refresh" tile on `/admin/health` (page.tsx).
 * POSTs to `/api/admin/prices/refresh` and renders button-local state per
 * D-03 (no global notification library, no client-side persistence).
 *
 * State transitions:
 *   - idle -> refreshing (on click)
 *   - refreshing -> idle + router.refresh() (on 200; re-runs the snapshot
 *     so the tile timestamp updates without a full page reload)
 *   - refreshing -> error("try again in a moment") -> idle after 5s (on 409;
 *     advisory lock contention vs cron-vs-manual race)
 *   - refreshing -> error("check logs") -> idle after 5s (on 5xx OR network
 *     failure; D-03 distinguishes 409 vs 5xx in the inline message copy)
 *
 * Re-click guard: a click while `status.kind === "refreshing"` is a no-op
 * (button is also `disabled`, but a stale event still hits handleClick if
 * the focus is on the button when the request fires; the kind check is the
 * load-bearing guard).
 *
 * Outlined / quiet weight (NOT the destructive red filled style from
 * inventory-danger-zone) — refresh is non-destructive and re-runnable; the
 * heavy red weight is reserved for delete-all-inventory.
 */

type Status =
  | { kind: "idle" }
  | { kind: "refreshing" }
  | { kind: "error"; message: string };

const ERROR_AUTOCLEAR_MS = 5000;
const COPY_409 = "Refresh in progress — try again in a moment";
const COPY_5XX = "Refresh failed — check logs";

export function RefreshPricesButton() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function handleClick() {
    if (status.kind === "refreshing") return; // re-click guard
    setStatus({ kind: "refreshing" });

    let res: Response;
    try {
      res = await fetch("/api/admin/prices/refresh", { method: "POST" });
    } catch {
      // Network error -> same UX as 5xx (operator action is the same: check logs).
      setStatus({ kind: "error", message: COPY_5XX });
      setTimeout(() => setStatus({ kind: "idle" }), ERROR_AUTOCLEAR_MS);
      return;
    }

    if (res.status === 409) {
      // Advisory-lock contention. Distinct copy from 5xx so the operator
      // knows to wait rather than escalate (D-03).
      setStatus({ kind: "error", message: COPY_409 });
      setTimeout(() => setStatus({ kind: "idle" }), ERROR_AUTOCLEAR_MS);
      return;
    }

    if (!res.ok) {
      setStatus({ kind: "error", message: COPY_5XX });
      setTimeout(() => setStatus({ kind: "idle" }), ERROR_AUTOCLEAR_MS);
      return;
    }

    setStatus({ kind: "idle" });
    // The page is `dynamic = "force-dynamic"` (page.tsx:19), so router.refresh()
    // re-executes getAdminHealthSnapshot() and the new lastPriceRefreshAt
    // value flows back into the rendered tile without a hard reload.
    router.refresh();
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={status.kind === "refreshing"}
        aria-busy={status.kind === "refreshing"}
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
      >
        {status.kind === "refreshing" ? "Refreshing…" : "Refresh now"}
      </button>
      {status.kind === "error" && (
        <p
          role="alert"
          className="mt-2 text-xs text-amber-700 dark:text-amber-300"
        >
          {status.message}
        </p>
      )}
    </div>
  );
}
