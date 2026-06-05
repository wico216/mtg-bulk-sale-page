import type { Finish, InventoryRow, ScryfallCard } from "@/lib/types";
import { getPrice } from "@/lib/enrichment";

export interface CardVersionInput {
  setCode?: unknown;
  collectorNumber?: unknown;
}

export interface NormalizedCardVersionInput {
  setCode: string;
  collectorNumber: string;
}

export interface InventoryCardIdParts {
  setCode: string;
  collectorNumber: string;
  finish: Finish;
  condition: string;
  binder: string;
}

export interface CardVersionUpdate {
  targetId: string;
  values: {
    id: string;
    name: string;
    setCode: string;
    setName: string;
    collectorNumber: string;
    price: number | null;
    condition: string;
    quantity: number;
    colorIdentity: string[];
    imageUrl: string | null;
    backImageUrl: string | null;
    oracleText: string | null;
    typeLine: string | null;
    manaCost: string | null;
    manaValue: number | null;
    rarity: string;
    finish: Finish;
    binder: string;
    scryfallId: string | null;
  };
}

type ScryfallPrinting = ScryfallCard & {
  id?: string;
  set?: string;
  set_name?: string;
  collector_number?: string;
  rarity?: string;
};

export function normalizeCardVersionInput(
  input: CardVersionInput,
): NormalizedCardVersionInput {
  const setCode = String(input.setCode ?? "").trim().toLowerCase();
  const collectorNumber = String(input.collectorNumber ?? "").trim();

  if (!setCode) throw new Error("Set code is required");
  if (!collectorNumber) throw new Error("Collector number is required");

  return { setCode, collectorNumber };
}

export function buildInventoryCardId(parts: InventoryCardIdParts): string {
  return `${parts.setCode.toLowerCase()}-${parts.collectorNumber}-${parts.finish}-${parts.condition}-${parts.binder}`;
}

function getImageUrls(card: ScryfallCard): {
  imageUrl: string | null;
  backImageUrl: string | null;
} {
  if (card.image_uris) {
    return {
      imageUrl: card.image_uris.normal,
      backImageUrl: null,
    };
  }

  return {
    imageUrl: card.card_faces?.[0]?.image_uris?.normal ?? null,
    backImageUrl: card.card_faces?.[1]?.image_uris?.normal ?? null,
  };
}

function getOracleText(card: ScryfallCard): string | null {
  if (card.oracle_text) return card.oracle_text;
  const texts =
    card.card_faces
      ?.map((face) => face.oracle_text)
      .filter((text): text is string => Boolean(text)) ?? [];
  return texts.length > 0 ? texts.join(" // ") : null;
}

function getTypeLine(card: ScryfallCard): string | null {
  if (card.type_line) return card.type_line;
  const typeLines =
    card.card_faces
      ?.map((face) => face.type_line)
      .filter((typeLine): typeLine is string => Boolean(typeLine)) ?? [];
  return typeLines.length > 0 ? typeLines.join(" // ") : null;
}

function parseManaCostValue(manaCost: string): number {
  const symbols = manaCost.match(/\{([^}]+)\}/g) ?? [];
  return symbols.reduce((total, symbol) => {
    const raw = symbol.slice(1, -1);
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return total + numeric;
    if (raw === "X" || raw === "Y" || raw === "Z") return total;
    const hybridNumeric = Number(raw.split("/")[0]);
    if (Number.isFinite(hybridNumeric)) return total + hybridNumeric;
    return total + 1;
  }, 0);
}

function getManaValue(card: ScryfallCard): number | null {
  if (typeof card.cmc === "number") return card.cmc;
  const faceValues =
    card.card_faces
      ?.map((face) =>
        typeof face.mana_cost === "string"
          ? parseManaCostValue(face.mana_cost)
          : null,
      )
      .filter((value): value is number => value != null) ?? [];
  return faceValues.length > 0 ? Math.max(...faceValues) : null;
}

function getManaCost(card: ScryfallCard): string | null {
  if (typeof card.mana_cost === "string") return card.mana_cost;
  const faceCosts =
    card.card_faces
      ?.map((face) =>
        typeof face.mana_cost === "string" ? face.mana_cost : null,
      )
      .filter((value): value is string => value !== null) ?? [];
  return faceCosts.length > 0 ? faceCosts.join(" // ") : null;
}

export function buildCardVersionUpdate(
  current: InventoryRow,
  scryfallCard: ScryfallPrinting,
  version: NormalizedCardVersionInput,
): CardVersionUpdate {
  const setCode = (scryfallCard.set ?? version.setCode).toLowerCase();
  const collectorNumber = scryfallCard.collector_number ?? version.collectorNumber;
  const targetId = buildInventoryCardId({
    setCode,
    collectorNumber,
    finish: current.finish,
    condition: current.condition,
    binder: current.binder,
  });
  const { imageUrl, backImageUrl } = getImageUrls(scryfallCard);
  const price = getPrice(scryfallCard.prices, current.finish);

  return {
    targetId,
    values: {
      id: targetId,
      name: scryfallCard.name,
      setCode,
      setName: scryfallCard.set_name ?? current.setName,
      collectorNumber,
      price: price !== null ? Math.round(price * 100) : null,
      condition: current.condition,
      quantity: current.quantity,
      colorIdentity: scryfallCard.color_identity,
      imageUrl,
      backImageUrl,
      oracleText: getOracleText(scryfallCard),
      typeLine: getTypeLine(scryfallCard),
      manaCost: getManaCost(scryfallCard),
      manaValue: getManaValue(scryfallCard),
      rarity: scryfallCard.rarity ?? current.rarity,
      finish: current.finish,
      binder: current.binder,
      scryfallId: scryfallCard.id ?? null,
    },
  };
}
