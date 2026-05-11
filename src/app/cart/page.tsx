import Header from "@/components/header";
import CartPageClient from "./cart-page-client";
import { getCardsAggregated } from "@/db/queries";
import type { PublicCard } from "@/lib/types";

export const metadata = {
  title: "The Satchel — Wiko's Spellbook",
};

export const dynamic = "force-dynamic";

export default async function CartPage() {
  try {
    // v1.3 Phase 20 D-03/D-06 + AGG-02: cart-page-client builds its
    // cardMap from the aggregated 4-segment ids (matches the buyer's
    // cart key shape). The disaggregated getCards() is no longer needed
    // here — cart-page-client only reads PublicCard fields. The legacy
    // CONTEXT D-03 directive to "KEEP getCards()" was conditional on
    // future internal/admin paths consuming disaggregated rows; in v1.3
    // scope no such consumer exists, so this drops the no-op call (the
    // executor's recommended option-b per Plan 20-01 Task 6).
    const aggregatedAdmin = await getCardsAggregated();
    const cards: PublicCard[] = aggregatedAdmin.map(
      ({ binders: _binders, ...rest }) => rest,
    );

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
        <main style={{ paddingTop: 24, paddingBottom: 96 }}>
          <CartPageClient cards={cards} />
        </main>
      </div>
    );
  } catch (error) {
    console.error("[CART] Database error:", error);
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
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "64px 24px", textAlign: "center" }}>
          <p style={{ fontSize: 18, color: "var(--muted)" }}>
            The satchel is briefly mislaid — try again soon.
          </p>
        </main>
      </div>
    );
  }
}
