"use client";
import { useEffect } from "react";

export type ToastVariant = "success" | "error";

export function Toast({
  message,
  onDismiss,
  variant = "error",
}: {
  message: string;
  onDismiss: () => void;
  variant?: ToastVariant;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, variant === "success" ? 4000 : 3000);
    return () => clearTimeout(timer);
  }, [onDismiss, variant]);

  const role = variant === "success" ? "status" : "alert";

  return (
    <div
      role={role}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 text-sm font-semibold px-4 py-2 rounded-md shadow-lg z-50 max-w-[90vw]"
      style={{
        background:
          variant === "success"
            ? "var(--accent)"
            : "rgb(220 38 38)",
        color:
          variant === "success" ? "var(--accent-fg)" : "white",
        border:
          variant === "success"
            ? "1px solid color-mix(in oklab, var(--accent) 60%, transparent)"
            : "1px solid rgb(220 38 38 / 0.8)",
      }}
    >
      {message}
    </div>
  );
}
