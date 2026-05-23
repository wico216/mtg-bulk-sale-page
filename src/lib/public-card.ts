import type { AdminCard, PublicCard } from "@/lib/types";

export function toPublicCard(card: AdminCard): PublicCard {
  const publicCard: Partial<AdminCard> = { ...card };
  delete publicCard.binders;
  return publicCard as PublicCard;
}

export function toPublicCards(cards: AdminCard[]): PublicCard[] {
  return cards.map(toPublicCard);
}
