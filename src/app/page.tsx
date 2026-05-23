import Header from "@/components/header";
import StorefrontShell from "@/components/storefront-shell";
import { getCardsAggregated, getCardsMeta } from "@/db/queries";
import type { CardData, PublicCard } from "@/lib/types";
import {
  DEFAULT_SORT,
  STOREFRONT_PAGE_SIZE,
  paginateStorefrontCards,
  stripAdminFields,
  type StorefrontFacets,
} from "@/lib/storefront";

export const dynamic = "force-dynamic";

type HomeData =
  | {
      ok: true;
      cards: PublicCard[];
      meta: CardData["meta"];
      initialTotal: number;
      facets: StorefrontFacets;
    }
  | { ok: false };

async function getHomeData(): Promise<HomeData> {
  try {
    const [aggregatedAdmin, meta] = await Promise.all([
      getCardsAggregated(),
      getCardsMeta(),
    ]);
    // v1.3 Phase 20 D-05/D-06 + AGG-02: strip the admin-only `binders`
    // field BEFORE passing to the storefront. The PublicCard[] type guarantees
    // the storefront cannot accidentally read or render binder names.
    const cards = stripAdminFields(aggregatedAdmin);
    const initialPage = paginateStorefrontCards(
      cards,
      { sortBy: DEFAULT_SORT },
      0,
      STOREFRONT_PAGE_SIZE,
    );

    return {
      ok: true,
      cards: initialPage.cards,
      meta,
      initialTotal: initialPage.total,
      facets: initialPage.facets,
    };
  } catch (error) {
    console.error("[HOME] Database error:", error);
    return { ok: false };
  }
}

export default async function Home() {
  const data = await getHomeData();

  if (!data.ok) {
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
      </div>
    );
  }

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
      <StorefrontShell
        cards={data.cards}
        meta={data.meta}
        initialTotal={data.initialTotal}
        facets={data.facets}
      />
    </div>
  );
}
