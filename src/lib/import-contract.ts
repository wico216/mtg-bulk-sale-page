import type { Card } from "@/lib/types";
import type { SkippedRow } from "@/lib/csv-parser";
import type { SkippedCard } from "@/lib/enrichment";

// Shared contract between the admin import client (Phase 10-03) and the
// Route Handlers in /api/admin/import/{preview,commit}. Keeping the field
// name and message shapes in one module prevents typo drift across the
// network boundary (RESEARCH Pitfall 5).

/** Multipart field name the client uses when uploading the CSV. */
export const IMPORT_FILE_FIELD = "file";

/** Metadata for one uploaded CSV in a multi-file import preview. */
export interface ImportSourceFile {
  name: string;
  parsedCards: number;
  skippedRows: number;
}

// ---- NDJSON stream messages (preview endpoint) -----------------------------

/**
 * One row in the binder picker (Phase 19 D-01/D-04). Surfaced by the
 * /preview NDJSON stream BEFORE Scryfall enrichment so the operator
 * can scope the import.
 */
export interface BinderSummary {
  /** Normalized binder name (already passed through normalizeBinderName at parse time). */
  name: string;
  /** Number of parsed cards belonging to this binder in this upload. */
  rowCount: number;
  /** First 3-5 card names from this binder, for at-a-glance recognition. */
  sampleNames: string[];
  /** True iff this binder name was NOT in the operator's previous selection. */
  isNew: boolean;
}

/** Emitted exactly once after parse, BEFORE the first progress message. */
export interface ImportBindersMessage {
  type: "binders";
  binders: BinderSummary[];
}

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
  | ImportBindersMessage
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
        fileName?: SkippedRow["fileName"];
      }
    | {
        kind: "enrich";
        setCode: SkippedCard["setCode"];
        collectorNumber: SkippedCard["collectorNumber"];
        name: SkippedCard["name"];
        reason: SkippedCard["reason"];
      }
  >;
  /** Per-file parse totals shown when the admin imports multiple CSV files. */
  sourceFiles: ImportSourceFile[];
  /** Full enriched card list -- posted back to /commit verbatim. */
  cards: Card[];
}

// ---- Commit endpoint --------------------------------------------------------

export interface CommitSummary {
  sourceFiles?: ImportSourceFile[];
  toImport?: number;
  parseSkipped?: number;
  scryfallSkipped?: number;
  missingPrices?: number;
}

/** Shape of POST body accepted by /api/admin/import/commit. */
export interface CommitRequest {
  cards: Card[];
  summary?: CommitSummary;
  /**
   * Phase 19 D-15/D-16: when omitted, server defaults to all distinct
   * binders mentioned in `cards` (legacy wholesale-replace behavior
   * over the binders this upload touches). When present, MUST contain
   * every binder name appearing in `cards` (server validates).
   */
  selectedBinders?: string[];
  /**
   * Phase 19: operator's previous selection from useBinderImportStore.
   * Used to compute `newBindersInExport` / `missingBindersFromExport`
   * for the audit metadata. Loose contract — silently normalized
   * server-side; never causes a 400.
   */
  knownBinders?: string[];
}

/** Success response returned by /api/admin/import/commit. */
export interface CommitResponse {
  success: true;
  inserted: number;
}

// ---- Audit metadata (commit endpoint) ---------------------------------------

/**
 * Phase 19 D-17: bounded shape captured into both adminAuditLog.metadata
 * and importHistory.metadata for a scoped-replace commit. Estimated
 * ~1.5KB serialized for typical (30 binders, ~10 selected); fits the
 * existing 4KB MAX_AUDIT_METADATA_BYTES cap. List fields are capped
 * at MAX_AUDIT_ARRAY_LENGTH (50) by sanitizeAdminAuditMetadata before
 * write — `selectedBinders`, `newBindersInExport`,
 * `missingBindersFromExport` MAY exceed 50 in rare cases and the
 * shape pre-truncates to keep the captured set deterministic.
 */
export interface ScopedImportAuditMetadata {
  /** The set of binders this commit replaced. Capped at 50 by the helper. */
  selectedBinders: string[];
  /** Total binders the export contained (informational). */
  totalBindersInExport: number;
  scopedReplaceCounts: {
    /** Per-binder row count BEFORE the commit (only for selected binders). */
    before: Record<string, number>;
    /** Per-binder row count AFTER the commit (only for selected binders). */
    after: Record<string, number>;
    /** TYPED INVARIANT: D-18. Asserted at runtime in replaceCardsForBinders. */
    deletedFromUnselected: 0;
  };
  /** Total cards in the cards table after the commit. */
  totalCardsAfterImport: number;
  /** Binders present in this export but not in the operator's prior selection. Capped at 50. */
  newBindersInExport: string[];
  /** Binders in the prior selection but missing from this export. Capped at 50. */
  missingBindersFromExport: string[];
}
