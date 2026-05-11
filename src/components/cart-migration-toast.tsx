"use client";
import { useEffect } from "react";

const TOAST_DURATION_MS = 6000;

const MESSAGE =
  "We updated your cart for our improved inventory system. If anything looks off, give it a refresh.";

/**
 * v1.3 Phase 20 D-12 — buyer-facing informational toast that surfaces
 * after the one-time v1.2 → v1.3 cart reconciliation. Fires exactly once
 * per buyer (gated by the `version` sentinel on the persisted cart store).
 *
 * Visual style mirrors the existing admin Toast (admin/_components/toast.tsx)
 * but uses neutral var(--ink)/var(--bg) tokens — NOT the green/red accent
 * variants — because this is informational, not success/error feedback.
 *
 * Auto-dismisses after 6000ms (longer than the admin success toast's
 * 4000ms because the message is informational + actionable, not a
 * transient confirmation).
 */
export function CartMigrationToast({
  onDismiss,
}: {
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        maxWidth: 480,
        padding: "12px 16px",
        background: "var(--bg)",
        color: "var(--ink)",
        border: "1px solid var(--border-strong)",
        borderRadius: 6,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        fontSize: 13,
        lineHeight: 1.4,
        zIndex: 50,
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        fontFamily: "inherit",
      }}
    >
      <span style={{ flex: 1 }}>{MESSAGE}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          background: "none",
          border: "none",
          color: "var(--muted)",
          cursor: "pointer",
          padding: 2,
          fontSize: 16,
          lineHeight: 1,
          flexShrink: 0,
          fontFamily: "inherit",
        }}
      >
        ×
      </button>
    </div>
  );
}
