import Header from "@/components/header";
import StorefrontShell from "@/components/storefront-shell";
import { getCards, getCardsMeta } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  try {
    const [cards, meta] = await Promise.all([getCards(), getCardsMeta()]);

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
