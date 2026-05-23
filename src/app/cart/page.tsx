import Header from "@/components/header";
import CartPageClient from "./cart-page-client";
import { getCardsAggregated } from "@/db/queries";
import {
  e2eFixtureCards,
  e2eFixturesEnabled,
} from "@/lib/e2e-fixtures";
import { toPublicCards } from "@/lib/public-card";
import type { PublicCard } from "@/lib/types";

export const metadata = {
  title: "The Satchel — Wiko's Spellbook",
};

export const dynamic = "force-dynamic";

async function loadCartCards(): Promise<PublicCard[]> {
  if (e2eFixturesEnabled()) return e2eFixtureCards;

  // v1.3 Phase 20 D-03/D-06 + AGG-02: cart-page-client builds its
  // cardMap from the aggregated 4-segment ids (matches the buyer's
  // cart key shape). The disaggregated getCards() is no longer needed
  // here — cart-page-client only reads PublicCard fields. The legacy
  // CONTEXT D-03 directive to "KEEP getCards()" was conditional on
  // future internal/admin paths consuming disaggregated rows; in v1.3
  // scope no such consumer exists, so this drops the no-op call (the
  // executor's recommended option-b per Plan 20-01 Task 6).
  const aggregatedAdmin = await getCardsAggregated();
  return toPublicCards(aggregatedAdmin);
}

async function loadCartCardsSafely(): Promise<PublicCard[] | null> {
  try {
    return await loadCartCards();
  } catch (error) {
    console.error("[CART] Database error:", error);
    return null;
  }
}

function CartShell({ children }: { children: React.ReactNode }) {
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

export default async function CartPage() {
  const cards = await loadCartCardsSafely();

  if (!cards) {
    return (
      <CartShell>
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "64px 24px", textAlign: "center" }}>
          <p style={{ fontSize: 18, color: "var(--muted)" }}>
            The satchel is briefly mislaid — try again soon.
          </p>
        </main>
      </CartShell>
    );
  }

  return (
    <CartShell>
      <main style={{ paddingTop: 24, paddingBottom: 96 }}>
        <CartPageClient cards={cards} />
      </main>
    </CartShell>
  );
}
