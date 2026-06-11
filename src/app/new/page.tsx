import Header from "@/components/header";
import SiteFooter from "@/components/site-footer";
import StorefrontShell from "@/components/storefront-shell";
import {
  loadRecentlyAddedStorefrontData,
  loadStorefrontDataSafely,
} from "@/lib/storefront-data";

export const dynamic = "force-dynamic";

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--ink)",
        position: "relative",
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Header />
      <div style={{ flex: 1 }}>{children}</div>
      <SiteFooter />
    </div>
  );
}

function NewArrivalsIntro() {
  return (
    <section
      className="wiko-storefront-intro"
      style={{
        padding: "34px 32px 10px",
        borderBottom: "1px solid var(--border)",
        background:
          "linear-gradient(180deg, color-mix(in oklch, var(--surface) 72%, transparent), transparent)",
      }}
    >
      <div style={{ maxWidth: 980 }}>
        <p
          style={{
            margin: "0 0 8px",
            color: "var(--muted)",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
          }}
        >
          Fresh from the binders
        </p>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: "clamp(34px, 6vw, 64px)",
            fontWeight: 400,
            lineHeight: 0.95,
            fontStyle: "italic",
          }}
        >
          New arrivals
        </h1>
        <p
          style={{
            margin: "14px 0 0",
            maxWidth: 620,
            color: "var(--muted)",
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          Cards from the latest inventory import, ordered newest first.
        </p>
      </div>
    </section>
  );
}

function ClosedMessage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "64px 24px",
        textAlign: "center",
      }}
    >
      <p style={{ fontSize: 18, color: "var(--muted)" }}>
        The shop is briefly closed — try again soon.
      </p>
    </main>
  );
}

export default async function NewArrivalsPage() {
  const data = await loadStorefrontDataSafely(
    () => loadRecentlyAddedStorefrontData(),
    "NEW_ARRIVALS",
  );

  return (
    <PageShell>
      {data ? (
        <>
          <NewArrivalsIntro />
          <StorefrontShell
            cards={data.cards}
            meta={data.meta}
            initialSort="recent-desc"
          />
        </>
      ) : (
        <ClosedMessage />
      )}
    </PageShell>
  );
}
