/**
 * Raw row from a Manabox CSV export.
 * Maps directly to CSV headers when parsed with PapaParse header mode.
 */
export interface ManaboxRow {
  Name: string;
  "Set code": string;
  "Set name": string;
  "Collector number": string;
  Foil: "foil" | "normal";
  Rarity: "common" | "uncommon" | "rare" | "mythic";
  Quantity: number;
  Condition: string;
  // Ignored fields (present in CSV but not used in processing)
  "ManaBox ID"?: string;
  "Scryfall ID"?: string;
  "Purchase price"?: string;
  Misprint?: string;
  Altered?: string;
  Language?: string;
  "Purchase price currency"?: string;
}

/**
 * Enriched card model used throughout the application.
 * Produced by CSV parsing (partial) then completed by Scryfall enrichment.
 */
export interface Card {
  /** Composite key: `${setCode}-${collectorNumber}-${foil}-${condition}` */
  id: string;
  name: string;
  /** Lowercased set code (e.g., "sld") */
  setCode: string;
  setName: string;
  collectorNumber: string;
  /** TCGPlayer market price in USD, null means "Price N/A" */
  price: number | null;
  condition: string;
  quantity: number;
  /** Color identity from Scryfall (e.g., ["G"], ["W","U"]) */
  colorIdentity: string[];
  /** Scryfall image URL, null if unavailable */
  imageUrl: string | null;
  /** Oracle rules text, null if unavailable */
  oracleText: string | null;
  rarity: string;
  foil: boolean;
  // D-07: Optional DB fields (available for future phases)
  scryfallId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Structure of the generated cards.json file.
 */
export interface CardData {
  cards: Card[];
  meta: {
    lastUpdated: string;
    totalCards: number;
    totalSkipped: number;
    totalMissingPrices: number;
  };
}

/**
 * Key fields from a Scryfall API card response.
 * Used during enrichment to extract images, prices, and color identity.
 */
export interface ScryfallCard {
  object: string;
  name: string;
  color_identity: string[];
  oracle_text?: string;
  image_uris?: {
    normal: string;
    small: string;
    large: string;
  };
  card_faces?: Array<{
    name: string;
    oracle_text?: string;
    image_uris?: {
      normal: string;
    };
  }>;
  prices: {
    usd: string | null;
    usd_foil: string | null;
    usd_etched: string | null;
  };
  layout: string;
}

/** A single item in a submitted order */
export interface OrderItem {
  cardId: string;
  name: string;
  setName: string;
  setCode: string;
  collectorNumber: string;
  condition: string;
  price: number | null;
  quantity: number;
  lineTotal: number | null;
  imageUrl?: string | null;
}

export interface StockConflict {
  cardId: string;
  name: string;
  requested: number;
  available: number;
}

/** Complete order data -- consumed by email templates and future thermal printer (D-14) */
export interface OrderData {
  orderRef: string;
  buyerName: string;
  buyerEmail: string;
  message?: string;
  items: OrderItem[];
  totalItems: number;
  totalPrice: number;
  createdAt: string; // ISO 8601 timestamp
}

/** Shape of POST body sent to /api/checkout */
export interface CheckoutRequest {
  buyerName: string;
  buyerEmail: string;
  message?: string;
  items: Array<{ cardId: string; quantity: number }>;
}

/** Shape of /api/checkout success response */
export interface CheckoutResponse {
  success: boolean;
  orderRef: string;
  order: OrderData;
  notification?: {
    sellerEmailSent: boolean;
    buyerEmailSent: boolean;
  };
}
