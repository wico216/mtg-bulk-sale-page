import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CardData } from "@/lib/types";

function loadCardData(): CardData | null {
  try {
    const filePath = resolve(process.cwd(), "data/generated/cards.json");
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as CardData;
  } catch {
    return null;
  }
}

export default function Home() {
  const data = loadCardData();

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen font-sans">
        <main className="text-center p-16">
          <h1 className="text-3xl font-semibold tracking-tight mb-4">
            Viki &mdash; MTG Bulk Store
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            No card data generated yet. Run:{" "}
            <code className="bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded text-sm">
              npm run generate
            </code>
          </p>
        </main>
      </div>
    );
  }

  const cardsWithPrices = data.cards.filter((c) => c.price !== null);
  const preview = data.cards.slice(0, 10);

  return (
    <div className="min-h-screen font-sans bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight mb-8">
          Viki &mdash; MTG Bulk Store
        </h1>

        {/* Stats */}
        <section className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-medium mb-4">Pipeline Stats</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{data.meta.totalCards}</p>
              <p className="text-sm text-zinc-500">Total Cards</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{cardsWithPrices.length}</p>
              <p className="text-sm text-zinc-500">With Prices</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{data.meta.totalMissingPrices}</p>
              <p className="text-sm text-zinc-500">Missing Prices</p>
            </div>
          </div>
          <p className="text-xs text-zinc-400 mt-4">
            Last updated: {new Date(data.meta.lastUpdated).toLocaleString()}
          </p>
          {data.meta.totalSkipped > 0 && (
            <p className="text-xs text-zinc-400">
              {data.meta.totalSkipped} cards skipped (no Scryfall match)
            </p>
          )}
        </section>

        {/* Sample Cards */}
        <section className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-medium mb-4">
            Sample Cards (first 10)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700 text-left">
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Set</th>
                  <th className="pb-2 pr-4">Price</th>
                  <th className="pb-2 pr-4">Condition</th>
                  <th className="pb-2">Qty</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((card) => (
                  <tr
                    key={card.id}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="py-2 pr-4 font-medium">{card.name}</td>
                    <td className="py-2 pr-4 text-zinc-500 uppercase text-xs">
                      {card.setCode}
                    </td>
                    <td className="py-2 pr-4">
                      {card.price !== null ? `$${card.price.toFixed(2)}` : "N/A"}
                    </td>
                    <td className="py-2 pr-4 text-zinc-500">{card.condition}</td>
                    <td className="py-2">{card.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-sm text-zinc-400 text-center">
          Full catalog coming in Phase 2
        </p>
      </main>
    </div>
  );
}
