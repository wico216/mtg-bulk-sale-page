import Header from "@/components/header";
import CartPageClient from "./cart-page-client";
import { getCards } from "@/db/queries";

export const metadata = {
  title: "The Satchel — Wiko's Spellbook",
};

export const dynamic = "force-dynamic";

export default async function CartPage() {
  try {
    const cards = await getCards();

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
