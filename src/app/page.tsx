import Header from "@/components/header";
import StorefrontShell from "@/components/storefront-shell";
import {
  loadStorefrontData,
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
      }}
    >
      <Header />
      {children}
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

export default async function Home() {
  const data = await loadStorefrontDataSafely(loadStorefrontData, "HOME");

  return (
    <PageShell>
      {data ? <StorefrontShell cards={data.cards} meta={data.meta} /> : <ClosedMessage />}
    </PageShell>
  );
}
