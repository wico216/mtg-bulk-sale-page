import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CardData } from "@/lib/types";

export function loadCardData(): CardData | null {
  try {
    const filePath = resolve(process.cwd(), "data/generated/cards.json");
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as CardData;
  } catch {
    return null;
  }
}
