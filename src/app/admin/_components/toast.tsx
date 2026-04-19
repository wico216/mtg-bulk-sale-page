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

  const bgClass = variant === "success" ? "bg-green-600" : "bg-red-600";
  const role = variant === "success" ? "status" : "alert";

  return (
    <div
      role={role}
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 ${bgClass} text-white text-sm font-semibold px-4 py-2 rounded-md shadow-lg z-50`}
    >
      {message}
    </div>
  );
}
