/**
 * Card finish enum — matches the `cards.finish` Postgres enum (Phase 16
 * FIN-01 / D-07). The literal `"etched"` is the value Manabox emits in the
 * `Foil` column for etched-foil cards (D-01, verified against the operator's
 * 12,749-row export). Drives both Scryfall price selection (Phase 17 D-08
 * etched mispricing fix) and the storefront display badge (D-09).
 */
export type Finish = "normal" | "foil" | "etched";

/**
 * Raw row from a Manabox CSV export.
 * Maps directly to CSV headers when parsed with PapaParse header mode.
 */
export interface ManaboxRow {
  Name: string;
  "Set code": string;
  "Set name": string;
  "Collector number": string;
  Foil: Finish;
  Rarity: "common" | "uncommon" | "rare" | "mythic";
  Quantity: number;
  Condition: string;
  // Phase 17 D-02 — binder columns are OPTIONAL because older Manabox
  // exports (pre-binder-aware schema) lack them; the parser degrades
  // gracefully by defaulting Binder Name to 'unsorted' and Binder Type to
  // 'binder'.
  "Binder Name"?: string;
  "Binder Type"?: string;
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
 * v1.3 Phase 20 D-05/D-06 — PUBLIC card shape returned by the storefront
 * aggregation. No `binder` or `binders` field; binder names are an
 * admin-only physical-world identifier and MUST NOT reach any public
 * surface (AGG-02 / I-DISC-05). The id is the 4-segment aggregated key
 * `${setCode}-${collectorNumber}-${finish}-${condition}` produced by
 * getCardsAggregated().
 */
export interface PublicCard {
  /** 4-segment aggregated key: `${setCode}-${collectorNumber}-${finish}-${condition}` */
  id: string;
  name: string;
  /** Lowercased set code (e.g., "sld") */
  setCode: string;
  setName: string;
  collectorNumber: string;
  /** TCGPlayer market price in USD, null means "Price N/A"; AVG of per-binder prices, rounded */
  price: number | null;
  condition: string;
  /** SUM(quantity) across binders */
  quantity: number;
  /** Color identity from Scryfall (e.g., ["G"], ["W","U"]) */
  colorIdentity: string[];
  /** Scryfall image URL, null if unavailable */
  imageUrl: string | null;
  /** Oracle rules text, null if unavailable */
  oracleText: string | null;
  rarity: string;
  /** Card finish — drives Scryfall price selection and display badge. */
  finish: Finish;
  scryfallId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * v1.3 Phase 20 D-05 — ADMIN-only aggregated card shape. Adds the
 * sorted-distinct binders[] array sourced from ARRAY_AGG(DISTINCT
 * binder ORDER BY binder ASC) in getCardsAggregated(). MUST NOT
 * cross the public boundary; map to PublicCard by destructuring
 * `{binders, ...rest}` before sending to any public component.
 */
export interface AdminCard extends PublicCard {
  /** Distinct binders this aggregated card is sourced from, sorted ASC */
  binders: string[];
}

/**
 * v1.3 Phase 20 D-03 — DISAGGREGATED per-binder row. Same shape as
 * the legacy v1.2 Card interface (5-segment id including binder).
 * Used by admin/import/order/csv-parser/enrichment paths that operate
 * on physical per-binder rows. NOT a public surface; the binder field
 * is permitted here because every consumer is admin or internal.
 */
export interface InventoryRow {
  /** 5-segment composite key: `${setCode}-${collectorNumber}-${finish}-${condition}-${binder}` */
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
  /** Card finish — drives Scryfall price selection and display badge. */
  finish: Finish;
  /**
   * Normalized binder name (lowercase, whitespace-collapsed,
   * hyphens→underscores). Defaults to 'unsorted' for legacy or
   * pre-binder-aware imports. See src/lib/binder-name.ts.
   */
  binder: string;
  // D-07: Optional DB fields (available for future phases)
  scryfallId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Structure of the generated cards.json file.
 */
export interface CardData {
  cards: InventoryRow[];
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

/**
 * A single item in a submitted order.
 *
 * v1.3 D-11: `binder` is the snapshot of the source binder for this
 * allocation; admin order detail (Phase 21) reads it; survives subsequent
 * inventory edits. A buyer line "Lightning Bolt × 3" split across A02:2 +
 * A05:1 produces TWO OrderItem rows — one per binder source — each with
 * its own `cardId` (the 5-segment per-binder id) and `binder` snapshot.
 */
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
  /**
   * Snapshot of the binder this allocation was pulled from at order time.
   * Defaults to 'unsorted' for legacy/migrated rows. Phase 21 admin order
   * detail renders this as `[binder]` annotation per line.
   */
  binder: string;
}

/**
 * v1.3 Phase 20 D-07 / AGG-02 — public-facing variant of OrderItem with
 * the per-binder `binder` snapshot stripped. Used as the `items` shape on
 * `CheckoutResponse.order` so the public response NEVER reveals binder
 * provenance. The internal `OrderItem` (DB rows, email pipelines, admin
 * order detail) keeps `binder`.
 */
export type PublicOrderItem = Omit<OrderItem, "binder">;

/**
 * v1.3 Phase 20 D-07 — public-facing variant of OrderData with binder-less
 * items[]. Used by `CheckoutResponse.order`. Internal `OrderData` (Phase 18)
 * retains the full `OrderItem[]` for email + admin paths.
 */
export type PublicOrderData = Omit<OrderData, "items"> & {
  items: PublicOrderItem[];
};

/**
 * v1.3 D-06: `cardId` is the AGGREGATED 4-segment id
 * `${setCode}-${collectorNumber}-${finish}-${condition}` — NOT a per-binder
 * 5-segment id. `available` is the SUM across all binders for that
 * aggregated key — NEVER per-binder. The shape is preserved verbatim from
 * v1.2; only the semantic meaning shifts.
 *
 * The buyer's cart submits aggregated keys; if the order can't be fully
 * fulfilled (across all binders combined), they see this shape. Per-binder
 * breakdowns are admin-only (PITFALLS Pitfall 6 / I-DISC-05).
 */
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

/**
 * Shape of /api/checkout success response.
 *
 * v1.3 Phase 20 D-07 / AGG-02: `order` is `PublicOrderData` — the binder
 * snapshot on each item is stripped before this leaves the server. The
 * internal `OrderData` (with `binder` snapshot per item) lives in the DB
 * and in the email pipelines; only buyer/seller-emailed copies retain it.
 */
export interface CheckoutResponse {
  success: boolean;
  orderRef: string;
  order: PublicOrderData;
  notification?: {
    sellerEmailSent: boolean;
    buyerEmailSent: boolean;
  };
}
