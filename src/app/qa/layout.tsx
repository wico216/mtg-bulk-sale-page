import Link from "next/link";

export const metadata = {
  title: "QA Gates — Wiko's Spellbook",
  robots: { index: false, follow: false },
};

export default function QaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--bg)", color: "var(--ink)" }}
    >
      <header
        className="sticky top-0 z-30 backdrop-blur"
        style={{
          background: "color-mix(in oklab, var(--bg) 88%, transparent)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/qa/gates" className="flex items-center gap-2">
            <span
              className="text-xl font-semibold"
              style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}
            >
              Wiko&apos;s Spellbook
            </span>
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              QA Gates
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm" style={{ color: "var(--muted)" }}>
            <Link href="/qa/gates" className="hover:underline">
              Gate list
            </Link>
            <Link href="/" className="hover:underline">
              Storefront
            </Link>
            <form action="/api/qa/logout" method="post">
              <button type="submit" className="hover:underline">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
