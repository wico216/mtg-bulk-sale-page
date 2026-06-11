import Header from "@/components/header";
import { Suspense } from "react";
import ConfirmationClient from "./confirmation-client";

export const metadata = {
  title: "Order Confirmed — Wiko's Spellbook",
};

export default function ConfirmationPage() {
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
      <main>
        <Suspense
          fallback={
            <div style={{ maxWidth: 448, margin: "0 auto", padding: "64px 16px", textAlign: "center" }}>
              <div className="wiko-skeleton" style={{ width: 64, height: 64, borderRadius: "50%", margin: "0 auto 24px" }} />
              <div className="wiko-skeleton" style={{ height: 32, width: 192, margin: "0 auto 16px" }} />
              <div className="wiko-skeleton" style={{ height: 20, width: 128, margin: "0 auto" }} />
            </div>
          }
        >
          <ConfirmationClient />
        </Suspense>
      </main>
    </div>
  );
}
