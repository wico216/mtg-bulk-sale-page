import Header from "@/components/header";
import { DeckCheckShell } from "@/app/deck-check/_components/deck-check-shell";

export const dynamic = "force-dynamic";

export default function DeckCheckPage() {
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
      <DeckCheckShell />
    </div>
  );
}
