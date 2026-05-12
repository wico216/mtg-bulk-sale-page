import fs from "node:fs";
import { parseManaboxCsvContent } from "../src/lib/csv-parser";

async function main() {
  const csv = fs.readFileSync("/home/wiko/Downloads/ManaBox_Collection.csv", "utf-8");
  const parsed = parseManaboxCsvContent(csv, "ManaBox_Collection.csv");

  const total = parsed.cards.length;
  const withId = parsed.cards.filter((c) => c.scryfallId && c.scryfallId.length === 36).length;
  const withMalformedId = parsed.cards.filter((c) => c.scryfallId && c.scryfallId.length !== 36).length;
  const withoutId = parsed.cards.filter((c) => !c.scryfallId).length;
  console.log(`Total cards parsed: ${total}; skipped rows: ${parsed.skippedRows.length}`);
  console.log(`  with valid 36-char UUID: ${withId}`);
  console.log(`  with non-UUID-shaped scryfallId: ${withMalformedId}`);
  console.log(`  with empty/null scryfallId: ${withoutId}`);

  const axxCards = parsed.cards.filter((c) => /^a[0-9]+$/i.test(c.binder));
  const axxWithId = axxCards.filter((c) => c.scryfallId && c.scryfallId.length === 36).length;
  const axxBadId = axxCards.filter((c) => c.scryfallId && c.scryfallId.length !== 36).length;
  const axxNoId = axxCards.filter((c) => !c.scryfallId).length;
  console.log(`\nAxx binder cards: ${axxCards.length}`);
  console.log(`  Axx with valid UUID: ${axxWithId}`);
  console.log(`  Axx with malformed scryfallId: ${axxBadId}`);
  console.log(`  Axx without scryfallId: ${axxNoId}`);

  const axxBindersByName: Record<string, number> = {};
  for (const c of axxCards) axxBindersByName[c.binder] = (axxBindersByName[c.binder] ?? 0) + 1;
  console.log(`\nAxx binders found:`, axxBindersByName);

  if (axxBadId > 0) {
    console.log("\nSample malformed scryfallIds:");
    for (const c of axxCards.filter((c) => c.scryfallId && c.scryfallId.length !== 36).slice(0, 5)) {
      console.log(`  ${c.name} (${c.binder}): "${c.scryfallId}" (len=${c.scryfallId!.length})`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
