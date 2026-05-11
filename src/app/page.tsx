import Header from "@/components/header";
import StorefrontShell from "@/components/storefront-shell";
import { getCardsAggregated, getCardsMeta } from "@/db/queries";
import type { PublicCard } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  try {
    const [aggregatedAdmin, meta] = await Promise.all([
      getCardsAggregated(),
      getCardsMeta(),
    ]);
    // v1.3 Phase 20 D-05/D-06 + AGG-02: strip the admin-only `binders`
    // field BEFORE passing to the storefront. The PublicCard[] type guarantees
    // the storefront cannot accidentally read or render binder names.
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
        <StorefrontShell cards={cards} meta={meta} />
      </div>
    );
  } catch (error) {
    console.error("[HOME] Database error:", error);
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
}
