import Header from "@/components/header";
import StorefrontShell from "@/components/storefront-shell";
import { getCardsAggregated, getCardsMeta } from "@/db/queries";
import {
  e2eFixtureCards,
  e2eFixtureMeta,
  e2eFixturesEnabled,
} from "@/lib/e2e-fixtures";
import { toPublicCards } from "@/lib/public-card";
import type { CardData, PublicCard } from "@/lib/types";

export const dynamic = "force-dynamic";

type StorefrontData = {
  cards: PublicCard[];
  meta: CardData["meta"];
};

async function loadStorefrontData(): Promise<StorefrontData> {
  if (e2eFixturesEnabled()) {
    return { cards: e2eFixtureCards, meta: e2eFixtureMeta };
  }

  const [aggregatedAdmin, meta] = await Promise.all([
    getCardsAggregated(),
    getCardsMeta(),
  ]);
  // v1.3 Phase 20 D-05/D-06 + AGG-02: strip the admin-only `binders`
  // field BEFORE passing to the storefront. The PublicCard[] type guarantees
  // the storefront cannot accidentally read or render binder names.
  return { cards: toPublicCards(aggregatedAdmin), meta };
}

async function loadStorefrontDataSafely(): Promise<StorefrontData | null> {
  try {
    return await loadStorefrontData();
  } catch (error) {
    console.error("[HOME] Database error:", error);
    return null;
  }
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--ink)",
        position: "relative",
        zIndex: 1,
      }}
    >
      <Header />
      {children}
    </div>
  );
}

export default async function Home() {
  const data = await loadStorefrontDataSafely();

  if (!data) {
    return (
      <PageShell>
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
      </PageShell>
    );
  }

  return (
    <PageShell>
      <StorefrontShell cards={data.cards} meta={data.meta} />
    </PageShell>
  );
}
