import { readFileSync } from "node:fs";
import { join } from "node:path";

interface CardData {
  cards: unknown[];
  meta: {
    lastUpdated: string;
    totalCards: number;
  };
}

function loadCardData(): CardData | null {
  try {
    const filePath = join(process.cwd(), "data/generated/cards.json");
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as CardData;
  } catch {
    return null;
  }
}

export default function Home() {
  const data = loadCardData();

  return (
    <div className="flex flex-col flex-1 items-center justify-center min-h-screen font-sans">
      <main className="flex flex-col items-center gap-6 text-center p-16">
        <h1 className="text-3xl font-semibold tracking-tight">
          Viki &mdash; MTG Bulk Store
        </h1>
        {data ? (
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            {data.meta.totalCards} cards available. Last updated:{" "}
            {new Date(data.meta.lastUpdated).toLocaleDateString()}.
          </p>
        ) : (
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            No card data yet &mdash; run build pipeline first.
          </p>
        )}
      </main>
    </div>
  );
}
