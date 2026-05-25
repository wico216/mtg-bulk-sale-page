import type { Finish, PublicCard } from "@/lib/types";

export interface CardVariantGroup {
  id: string;
  card: PublicCard;
  variants: PublicCard[];
}

const FINISH_RANK: Record<Finish, number> = {
  normal: 0,
  foil: 1,
  etched: 2,
};

function normalizeKeyPart(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Groups storefront cards by the printed card/art identity, intentionally
 * excluding finish so regular + foil copies share one customer-facing tile.
 * Collector number stays in the key so extended-art/borderless/showcase
 * printings remain separate cards even when they share the same name.
 */
export function cardPrintingKey(card: PublicCard): string {
  return [card.setCode, card.collectorNumber, card.name]
    .map(normalizeKeyPart)
    .join("::");
}

export function compareCardVariants(a: PublicCard, b: PublicCard): number {
  return (
    (FINISH_RANK[a.finish] ?? 99) - (FINISH_RANK[b.finish] ?? 99) ||
    a.condition.localeCompare(b.condition) ||
    a.id.localeCompare(b.id)
  );
}

function pickRepresentative(variants: PublicCard[]): PublicCard {
  return variants.find((variant) => variant.finish === "normal") ?? variants[0];
}

export function groupCardVariants(cards: PublicCard[]): CardVariantGroup[] {
  const groups = new Map<string, PublicCard[]>();

  for (const card of cards) {
    const key = cardPrintingKey(card);
    const variants = groups.get(key);
    if (variants) {
      variants.push(card);
    } else {
      groups.set(key, [card]);
    }
  }

  return [...groups.entries()].map(([key, variants]) => {
    const sortedVariants = [...variants].sort(compareCardVariants);
    return {
      id: `printing:${key}`,
      card: pickRepresentative(sortedVariants),
      variants: sortedVariants,
    };
  });
}
