import Header from "@/components/header";
import SiteFooter from "@/components/site-footer";
import StorefrontShell from "@/components/storefront-shell";
import {
  loadStorefrontData,
  loadStorefrontDataSafely,
} from "@/lib/storefront-data";
import type { CardData } from "@/lib/types";

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

function formatSyncedDate(lastUpdated: string): string | null {
  const parsed = Date.parse(lastUpdated);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const HOME_STEPS = [
  { num: "01", label: "Browse", desc: "find cards you want" },
  { num: "02", label: "Reserve", desc: "place your order online" },
  { num: "03", label: "Pay at pickup", desc: "no online payment" },
] as const;

/* Compact editorial intro — mirrors NewArrivalsIntro on /new but stays
 * tight so the grid remains above the fold on desktop. The subline
 * deliberately avoids the phrase "cards in stock" (SortBar owns it —
 * duplicate text would trip Playwright strict-mode getByText queries). */
function HomeIntro({ meta }: { meta: CardData["meta"] }) {
  const syncedDate = formatSyncedDate(meta.lastUpdated);

  return (
    <section
      className="wiko-storefront-intro"
      style={{
        padding: "26px 32px 14px",
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
          From my binders to your deck
        </p>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: "clamp(30px, 4.5vw, 48px)",
            fontWeight: 400,
            lineHeight: 0.95,
            fontStyle: "italic",
          }}
        >
          A trove of singles
        </h1>
        <p
          style={{
            margin: "12px 0 0",
            maxWidth: 620,
            color: "var(--muted)",
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          {meta.totalCards.toLocaleString()} singles, priced and ready.
        </p>
        {syncedDate && (
          <p
            style={{
              margin: "6px 0 0",
              color: "var(--dim)",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
            }}
          >
            Prices via Scryfall · synced {syncedDate}
          </p>
        )}
        <div
          className="wiko-home-steps"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px 28px",
            marginTop: 16,
          }}
        >
          {HOME_STEPS.map((step) => (
            <div
              key={step.num}
              style={{ display: "flex", alignItems: "baseline", gap: 8 }}
            >
              <span
                style={{
                  color: "var(--accent)",
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                  letterSpacing: "0.08em",
                }}
              >
                {step.num}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>
                {step.label}
              </span>
              <span
                className="wiko-home-step-desc"
                style={{ fontSize: 12, color: "var(--muted)" }}
              >
                — {step.desc}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default async function Home() {
  const data = await loadStorefrontDataSafely(loadStorefrontData, "HOME");

  return (
    <PageShell>
      {data ? (
        <>
          <HomeIntro meta={data.meta} />
          <StorefrontShell cards={data.cards} meta={data.meta} />
        </>
      ) : (
        <ClosedMessage />
      )}
    </PageShell>
  );
}
