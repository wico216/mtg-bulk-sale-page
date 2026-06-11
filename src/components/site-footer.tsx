import Link from "next/link";
import type { CSSProperties } from "react";

/* Footer nav labels are chosen to NOT collide with header accessible names
 * in Playwright's substring-matching getByRole queries:
 * header already owns "New arrivals" (aria-label) and "Cart" — so the /new
 * link here is "Just added" and /cart is "The Satchel". */
const FOOTER_LINKS = [
  { href: "/", label: "Browse" },
  { href: "/new", label: "Just added" },
  { href: "/deck-check", label: "Deck check" },
  { href: "/cart", label: "The Satchel" },
] as const;

export default function SiteFooter({ style }: { style?: CSSProperties }) {
  return (
    <footer
      className="wiko-site-footer"
      style={{
        position: "relative",
        zIndex: 1,
        marginTop: 48,
        borderTop: "1px solid var(--border)",
        background: "var(--bg)",
        padding: "26px 32px calc(26px + env(safe-area-inset-bottom))",
        ...style,
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "18px 32px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: 18,
              fontWeight: 400,
              fontStyle: "italic",
              color: "var(--ink)",
              lineHeight: 1.1,
            }}
          >
            Wiko&apos;s <span style={{ fontStyle: "normal" }}>Spellbook</span>
          </p>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 10,
              color: "var(--dim)",
              fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Prices via Scryfall · refreshed daily · pay in person at pickup
          </p>
        </div>
        <nav
          aria-label="Footer"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px 20px",
            flexWrap: "wrap",
            paddingTop: 4,
          }}
        >
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                color: "var(--muted)",
                textDecoration: "none",
                fontSize: 11,
                fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
