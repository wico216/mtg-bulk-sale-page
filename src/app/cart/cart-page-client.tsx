"use client";

import type { Card } from "@/lib/types";

interface CartPageClientProps {
  cards: Card[];
}

export default function CartPageClient({ cards: _cards }: CartPageClientProps) {
  return <div />;
}
