"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCartStore } from "@/lib/store/cart-store";
import { GoogleSignInButton } from "@/components/google-sign-in-button";

type Mode = "light" | "dark";
const MODE_KEY = "wiko.mode";

function MageMascot({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden
      style={{ flexShrink: 0, display: "block" }}
    >
      <path
        d="M24 4 C 23 4, 22 5, 20 12 C 18 19, 15 22, 14 23 L 34 23 C 33 22, 30 19, 28 12 C 26 5, 25 4, 24 4 Z"
        fill="var(--accent)"
      />
      <path
        d="M24 4 C 23.5 4.2, 23 5, 22.5 6.2 C 23.4 6.3, 24.2 5.5, 24 4 Z"
        fill="var(--accent)"
        opacity="0.6"
      />
      <rect x="13" y="22" width="22" height="3" rx="1" fill="var(--ink)" opacity="0.85" />
      <path
        d="M19 14 L19.4 15.6 L21 16 L19.4 16.4 L19 18 L18.6 16.4 L17 16 L18.6 15.6 Z"
        fill="var(--bg)"
      />
      <circle cx="24" cy="29" r="7" fill="var(--bg)" stroke="var(--ink)" strokeWidth="1.2" />
      <path
        d="M21 28.5 Q 21.7 27.6, 22.4 28.5 M 25.6 28.5 Q 26.3 27.6, 27 28.5"
        stroke="var(--ink)"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M22.2 31.2 Q 24 32.6, 25.8 31.2"
        stroke="var(--ink)"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="20.8" cy="30.6" r="0.8" fill="var(--accent)" opacity="0.5" />
      <circle cx="27.2" cy="30.6" r="0.8" fill="var(--accent)" opacity="0.5" />
      <path
        d="M22 35.2 Q 23 37.2, 24 36.6 Q 25 37.2, 26 35.2 Q 25 36, 24 35.6 Q 23 36, 22 35.2 Z"
        fill="var(--ink)"
        opacity="0.75"
      />
      <path
        d="M39 12 L 39.6 14.4 L 42 15 L 39.6 15.6 L 39 18 L 38.4 15.6 L 36 15 L 38.4 14.4 Z"
        fill="var(--accent)"
      />
      <circle cx="6" cy="18" r="1.2" fill="var(--accent)" opacity="0.7" />
      <circle cx="8" cy="34" r="0.9" fill="var(--accent)" opacity="0.5" />
    </svg>
  );
}

function IconCart({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 4h2l2.5 11h11L21 7H6.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="19" r="1.4" />
      <circle cx="17" cy="19" r="1.4" />
    </svg>
  );
}

function IconX({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

function IconSun({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconMoon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path
        d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function useMode(): [Mode, () => void] {
  // Dark is the SSR-stamped default; the flash-guard in layout.tsx swaps to
  // the stored mode before hydration.
  const [mode, setMode] = useState<Mode>("dark");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-mode");
    if (current === "light" || current === "dark") setMode(current);
  }, []);

  const toggle = () => {
    setMode((m) => {
      const next: Mode = m === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-mode", next);
      try {
        localStorage.setItem(MODE_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  };

  return [mode, toggle];
}

export default function Header() {
  const totalItems = useCartStore((s) => s.totalItems());
  const [showLogin, setShowLogin] = useState(false);
  const [mode, toggleMode] = useMode();

  return (
    <>
      <header
        className="wiko-header"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          height: 68,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 32px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg)",
          overflow: "hidden",
        }}
      >
        <div aria-hidden className="wiko-starfield" />

        <Link
          href="/"
          aria-label="Wiko's Spellbook home"
          className="wiko-header-brand"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            position: "relative",
            textDecoration: "none",
            color: "inherit",
            minWidth: 0,
          }}
        >
          <span className="wiko-header-mascot" style={{ display: "block", flexShrink: 0 }}>
            <MageMascot />
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <span
              className="wiko-header-title"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 26,
                fontWeight: 400,
                letterSpacing: "-0.005em",
                lineHeight: 1,
                fontStyle: "italic",
                whiteSpace: "nowrap",
              }}
            >
              Wiko&apos;s{" "}
              <span style={{ fontStyle: "normal" }}>Spellbook</span>
            </span>
            <span
              className="wiko-header-tagline"
              style={{
                fontSize: 10,
                color: "var(--muted)",
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                fontWeight: 500,
              }}
            >
              A trove of singles · est. 2026
            </span>
          </div>
        </Link>

        <div className="wiko-header-actions" style={{ display: "flex", alignItems: "center", gap: 10, position: "relative", flexShrink: 0 }}>
          <button
            type="button"
            onClick={toggleMode}
            aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={mode === "dark" ? "Light mode" : "Dark mode"}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 3,
              color: "var(--ink)",
              padding: "7px 9px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              fontFamily: "inherit",
            }}
          >
            {mode === "dark" ? <IconSun /> : <IconMoon />}
          </button>
          <button
            type="button"
            onClick={() => setShowLogin(true)}
            className="wiko-header-admin-btn"
            style={{
              background: "none",
              border: "none",
              color: "var(--muted)",
              padding: "0 8px",
              fontSize: 12,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Admin
          </button>
          <Link
            href="/cart"
            aria-label="Cart"
            style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px 8px 12px",
              border: "1px solid var(--border)",
              borderRadius: 3,
              color: "var(--ink)",
              textDecoration: "none",
            }}
          >
            <IconCart size={16} />
            <span
              className="wiko-header-satchel-label"
              style={{
                fontSize: 11,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Satchel
            </span>
            {totalItems > 0 && (
              <span
                style={{
                  background: "var(--accent)",
                  color: "var(--accent-fg)",
                  fontSize: 10,
                  fontWeight: 600,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  padding: "0 5px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {totalItems > 99 ? "99+" : totalItems}
              </span>
            )}
          </Link>
        </div>
      </header>

      {showLogin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowLogin(false);
          }}
        >
          <div
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: 24,
              maxWidth: 380,
              width: "100%",
              margin: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2
                style={{
                  margin: 0,
                  fontFamily: "var(--font-display)",
                  fontSize: 22,
                  fontWeight: 400,
                  fontStyle: "italic",
                }}
              >
                The keeper&apos;s door
              </h2>
              <button
                onClick={() => setShowLogin(false)}
                aria-label="Close"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--muted)",
                  cursor: "pointer",
                  padding: 4,
                }}
              >
                <IconX size={18} />
              </button>
            </div>

            <GoogleSignInButton />

            <p
              style={{
                fontSize: 11,
                color: "var(--muted)",
                marginTop: 16,
                textAlign: "center",
                fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Only the shopkeeper may pass.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
