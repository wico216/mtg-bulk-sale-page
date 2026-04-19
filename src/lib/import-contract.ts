import type { Card } from "@/lib/types";
import type { SkippedRow } from "@/lib/csv-parser";
import type { SkippedCard } from "@/lib/enrichment";

// Shared contract between the admin import client (Phase 10-03) and the
// Route Handlers in /api/admin/import/{preview,commit}. Keeping the field
// name and message shapes in one module prevents typo drift across the
// network boundary (RESEARCH Pitfall 5).

/** Multipart field name the client uses when uploading the CSV. */
export const IMPORT_FILE_FIELD = "file";

// ---- NDJSON stream messages (preview endpoint) -----------------------------

/** Emitted one or more times while enrichment progresses. */
export interface ImportProgressMessage {
  type: "progress";
  done: number;
  total: number;
  /** Optional phase label so the UI can show friendlier copy. */
  stage?: "parse" | "enrich";
}

/** Emitted exactly once on success, carries the full preview payload. */
export interface ImportResultMessage {
  type: "result";
  preview: PreviewPayload;
}

/** Emitted when enrichment fails; terminal. */
export interface ImportErrorMessage {
  type: "error";
  message: string;
}

/** Union of every NDJSON line the preview route may emit. */
export type ImportStreamMessage =
  | ImportProgressMessage
  | ImportResultMessage
  | ImportErrorMessage;

// ---- Preview payload --------------------------------------------------------

/**
 * Produced by /preview, held in memory by the client, and posted back to
 * /commit as-is. The skippedRows field is a discriminated union so the UI
 * (Phase 10-03, D-05 zone 3) can render parse skips and Scryfall misses
 * with different icons / copy.
 */
export interface PreviewPayload {
  /** Number of cards that survived parse + enrichment (= enriched.length). */
  toImport: number;
  /** Parser-level skip count (bad rows in the CSV). */
  parseSkipped: number;
  /** Enrichment-level skip count (Scryfall misses). */
  scryfallSkipped: number;
  /** Number of enriched cards with price === null. */
  missingPrices: number;
  /** First up-to-20 enriched cards for the preview table. */
  sample: Card[];
  /** Per-row detail for the preview's expandable "Skipped rows" section. */
  skippedRows: Array<
    | {
        kind: "parse";
        rowNumber: SkippedRow["rowNumber"];
        reason: SkippedRow["reason"];
        name?: SkippedRow["name"];
        setCode?: SkippedRow["setCode"];
        collectorNumber?: SkippedRow["collectorNumber"];
      }
    | {
        kind: "enrich";
        setCode: SkippedCard["setCode"];
        collectorNumber: SkippedCard["collectorNumber"];
        name: SkippedCard["name"];
        reason: SkippedCard["reason"];
      }
  >;
  /** Full enriched card list -- posted back to /commit verbatim. */
  cards: Card[];
}

// ---- Commit endpoint --------------------------------------------------------

/** Shape of POST body accepted by /api/admin/import/commit. */
export interface CommitRequest {
  cards: Card[];
}

/** Success response returned by /api/admin/import/commit. */
export interface CommitResponse {
  success: true;
  inserted: number;
}
