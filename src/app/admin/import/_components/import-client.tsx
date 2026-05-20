"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IMPORT_FILE_FIELD,
  type BinderSummary,
  type ImportStreamMessage,
  type PreviewPayload,
} from "@/lib/import-contract";
import { useBinderImportStore } from "@/lib/store/binder-import-store";
import { BinderConfirm } from "./binder-confirm";
import { BinderPicker, computeMissingBinders } from "./binder-picker";
import { DropZone } from "./drop-zone";
import { PreviewPanel } from "./preview-panel";
import { ProgressBar } from "./progress-bar";

type SelectedFile = { name: string; size: number };

/**
 * Phase 19 Stage union — widened from 5 to 7 variants.
 *
 * Flow:
 *   idle → uploading-binders → picker → uploading → preview → committing → idle
 *                                                                       ↘ error
 *
 * The `picker` stage sits BETWEEN upload and enrichment so the operator
 * can scope which binders to import; the server runs stage-1 parse → emit
 * binders message → halt (client cancels the stream). Stage-2 enrichment
 * is fired by handleConfirmPicker which re-POSTs to /preview WITH
 * selectedBinders body field.
 *
 * `preview` + `committing` carry `binders`, `selectedBinders`, and
 * `willDeleteBinders` so the BinderConfirm view can render the breakdown
 * without re-deriving from the store.
 */
type Stage =
  | { kind: "idle"; invalidExtension?: boolean }
  | { kind: "uploading-binders"; files: SelectedFile[] }
  | {
      kind: "picker";
      files: SelectedFile[];
      binders: BinderSummary[];
      willDelete: string[];
    }
  | {
      kind: "uploading";
      files: SelectedFile[];
      done: number;
      total: number;
      indeterminate: boolean;
    }
  | {
      kind: "preview";
      files: SelectedFile[];
      payload: PreviewPayload;
      binders: BinderSummary[];
      selectedBinders: string[];
      willDeleteBinders: string[];
    }
  | {
      kind: "committing";
      files: SelectedFile[];
      payload: PreviewPayload;
      binders: BinderSummary[];
      selectedBinders: string[];
      willDeleteBinders: string[];
    }
  | { kind: "error"; message: string; previousFiles?: SelectedFile[] };

function summarizeFiles(files: File[]): SelectedFile[] {
  return files.map((file) => ({ name: file.name, size: file.size }));
}

function totalSizeKb(files: SelectedFile[]): number {
  return Math.max(
    1,
    Math.round(files.reduce((total, file) => total + file.size, 0) / 1024),
  );
}

function fileSummary(files: SelectedFile[]): string {
  if (files.length === 1) return `${files[0].name} · ${totalSizeKb(files)} KB`;
  return `${files.length} files · ${totalSizeKb(files)} KB`;
}

/**
 * Read NDJSON messages from a Response stream and invoke `onMessage` for
 * each line. Returns when the stream ends OR the consumer throws inside
 * `onMessage` (used to halt the stage-1 stream after the binders message).
 */
async function consumeNdjsonStream(
  res: Response,
  onMessage: (msg: ImportStreamMessage) => void,
): Promise<void> {
  if (!res.body) throw new Error("Upload failed: empty response stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const msg = JSON.parse(line) as ImportStreamMessage;
        onMessage(msg);
      }
    }
    if (buffer.trim()) {
      const msg = JSON.parse(buffer) as ImportStreamMessage;
      onMessage(msg);
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // ignore — stream already closed
    }
  }
}

export function ImportClient({ currentTotal }: { currentTotal: number }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [pickerSelection, setPickerSelection] = useState<
    Record<string, boolean>
  >({});
  const [willDeleteSelection, setWillDeleteSelection] = useState<
    Record<string, boolean>
  >({});
  const abortControllerRef = useRef<AbortController | null>(null);

  // Individual selectors keep re-renders minimal (zustand best practice).
  const setLastSelection = useBinderImportStore((s) => s.setLastSelection);
  const recordCommit = useBinderImportStore((s) => s.recordCommit);
  const knownBinderNamesFn = useBinderImportStore((s) => s.knownBinderNames);

  // ------------------------------------------------------------------------
  // Stage-1: drop files → fetch binders → halt stream → show picker
  // ------------------------------------------------------------------------
  async function handleFiles(files: File[]) {
    const selectedFiles = summarizeFiles(files);
    setStage({ kind: "uploading-binders", files: selectedFiles });

    const knownBinders = knownBinderNamesFn();
    const fd = new FormData();
    for (const file of files) fd.append(IMPORT_FILE_FIELD, file);
    fd.append("knownBinders", JSON.stringify(knownBinders));

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let res: Response;
    try {
      res = await fetch("/api/admin/import/preview", {
        method: "POST",
        body: fd,
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) return; // cancel from UI
      setStage({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
      return;
    }

    if (!res.ok) {
      try {
        const body = await res.json();
        setStage({
          kind: "error",
          message: body?.error ?? `Upload failed (${res.status})`,
          previousFiles: selectedFiles,
        });
      } catch {
        setStage({
          kind: "error",
          message: `Upload failed (${res.status})`,
          previousFiles: selectedFiles,
        });
      }
      return;
    }

    // Read messages until we see the binders message; then abort the rest.
    let binders: BinderSummary[] | null = null;
    let streamError: string | null = null;
    try {
      await consumeNdjsonStream(res, (msg) => {
        if (msg.type === "binders") {
          binders = msg.binders;
          // Halt the stream — server is still wastefully streaming progress
          // for the unscoped enrichment we'll re-fire after picker.
          controller.abort();
        } else if (msg.type === "error") {
          streamError = msg.message;
        }
        // progress / result messages are ignored at this stage.
      });
    } catch (err) {
      // AbortError is expected (we triggered it after the binders message);
      // any OTHER thrown error is real.
      if (controller.signal.aborted && binders) {
        // expected halt path
      } else if (controller.signal.aborted) {
        // cancel-from-UI path: don't transition to error
        return;
      } else {
        setStage({
          kind: "error",
          message: err instanceof Error ? err.message : "Stream error",
          previousFiles: selectedFiles,
        });
        return;
      }
    }

    if (streamError) {
      setStage({
        kind: "error",
        message: streamError,
        previousFiles: selectedFiles,
      });
      return;
    }

    if (!binders) {
      setStage({
        kind: "error",
        message: "Stream ended without a binders message",
        previousFiles: selectedFiles,
      });
      return;
    }

    // D-05 / v1.4: Picker opens with every binder UNCHECKED on every
    // session. Select all is the recovery affordance (rendered in the
    // BinderPicker header below). Any prior `lastSelection` content is
    // intentionally ignored by the picker — `lastSelection` survives
    // only to drive the will-delete amber panel below.
    const initialSelection: Record<string, boolean> = {};
    for (const b of binders as BinderSummary[]) {
      initialSelection[b.name] = false;
    }
    setPickerSelection(initialSelection);

    const willDelete = computeMissingBinders(
      binders as BinderSummary[],
      knownBinders,
    );
    // Default-CHECKED per D-11.
    const initialWillDelete: Record<string, boolean> = {};
    for (const name of willDelete) initialWillDelete[name] = true;
    setWillDeleteSelection(initialWillDelete);

    setStage({
      kind: "picker",
      files: selectedFiles,
      binders: binders as BinderSummary[],
      willDelete,
    });
  }

  // ------------------------------------------------------------------------
  // Stage-2: operator clicks Continue → re-POST with selectedBinders
  // ------------------------------------------------------------------------
  async function handleConfirmPicker() {
    if (stage.kind !== "picker") return;
    const { files: selectedFiles, binders: bindersInUpload } = stage;
    const selectedBinders = Object.entries(pickerSelection)
      .filter(([, checked]) => checked)
      .map(([name]) => name);
    const willDeleteBinders = Object.entries(willDeleteSelection)
      .filter(([, checked]) => checked)
      .map(([name]) => name);

    if (selectedBinders.length === 0 && willDeleteBinders.length === 0) {
      // Stay on the picker; rely on the disabled state of the Continue
      // button (set below). Defensive guard only.
      return;
    }

    // We need the actual File objects but we only kept the SelectedFile
    // summary — we re-create the FormData with the operator's selection
    // and the files are required to be re-droppped if we got here without
    // them. Files are NOT cached on the client; the DropZone passes them
    // through handleFiles directly.
    //
    // SOLUTION: handleFiles passes the original files array via closure
    // to handleConfirmPicker. Since picker is a separate render branch,
    // we need to thread the files through state. We use a ref instead
    // of state because the files are non-serializable.
    const filesRef = filesByStageRef.current;
    if (!filesRef) {
      setStage({
        kind: "error",
        message:
          "Internal: files reference lost between picker and stage-2 upload. Please re-drop the CSV.",
        previousFiles: selectedFiles,
      });
      return;
    }

    setStage({
      kind: "uploading",
      files: selectedFiles,
      done: 0,
      total: 0,
      indeterminate: true,
    });

    const fd = new FormData();
    for (const file of filesRef) fd.append(IMPORT_FILE_FIELD, file);
    fd.append(
      "selectedBinders",
      JSON.stringify(selectedBinders),
    );
    fd.append("knownBinders", JSON.stringify(knownBinderNamesFn()));

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let res: Response;
    try {
      res = await fetch("/api/admin/import/preview", {
        method: "POST",
        body: fd,
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      setStage({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
      return;
    }

    if (!res.ok) {
      try {
        const body = await res.json();
        setStage({
          kind: "error",
          message: body?.error ?? `Upload failed (${res.status})`,
          previousFiles: selectedFiles,
        });
      } catch {
        setStage({
          kind: "error",
          message: `Upload failed (${res.status})`,
          previousFiles: selectedFiles,
        });
      }
      return;
    }

    let finalPreview: PreviewPayload | null = null;
    try {
      await consumeNdjsonStream(res, (msg) => {
        if (msg.type === "progress") {
          setStage({
            kind: "uploading",
            files: selectedFiles,
            done: msg.done,
            total: msg.total,
            indeterminate: msg.total === 0,
          });
        } else if (msg.type === "result") {
          finalPreview = msg.preview;
        } else if (msg.type === "error") {
          throw new Error(msg.message);
        }
        // The second-call stream also emits a binders message FIRST (server
        // sends it unconditionally for picker re-render symmetry); we
        // ignore it here.
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      setStage({
        kind: "error",
        message: err instanceof Error ? err.message : "Stream error",
        previousFiles: selectedFiles,
      });
      return;
    }

    if (!finalPreview) {
      setStage({
        kind: "error",
        message: "Stream ended without a preview result",
        previousFiles: selectedFiles,
      });
      return;
    }

    setStage({
      kind: "preview",
      files: selectedFiles,
      payload: finalPreview,
      binders: bindersInUpload,
      selectedBinders,
      willDeleteBinders,
    });
  }

  // ------------------------------------------------------------------------
  // Stage-3: typed REPLACE confirm → POST to /commit
  // ------------------------------------------------------------------------
  async function handleConfirmCommit() {
    if (stage.kind !== "preview") return;
    const { payload, files, binders, selectedBinders, willDeleteBinders } =
      stage;
    setStage({
      kind: "committing",
      files,
      payload,
      binders,
      selectedBinders,
      willDeleteBinders,
    });

    // Union of operator-selected binders in the upload AND will-delete
    // entries that remained CHECKED. Server will DELETE WHERE binder IN
    // (this list), then INSERT cards from the upload.
    const commitSelectedBinders = [
      ...selectedBinders,
      ...willDeleteBinders,
    ];

    let res: Response;
    try {
      res = await fetch("/api/admin/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: payload.cards,
          selectedBinders: commitSelectedBinders,
          knownBinders: knownBinderNamesFn(),
          summary: {
            sourceFiles: payload.sourceFiles,
            toImport: payload.toImport,
            parseSkipped: payload.parseSkipped,
            scryfallSkipped: payload.scryfallSkipped,
            missingPrices: payload.missingPrices,
          },
        }),
      });
    } catch (err) {
      setStage({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
        previousFiles: files,
      });
      return;
    }

    if (!res.ok) {
      let errMsg = `Import failed (${res.status})`;
      try {
        const body = await res.json();
        if (body?.error) errMsg = body.error;
      } catch {}
      setStage({ kind: "error", message: errMsg, previousFiles: files });
      return;
    }

    const body = (await res.json()) as { success: true; inserted: number };

    // Record the new selection — ONLY the binders that were INCLUDED in
    // the upload (will-delete entries are NOT preserved; they are GONE
    // from inventory, so a future import shouldn't surface them as
    // missing-and-checkable).
    const newSelection: Record<string, boolean> = {};
    for (const b of selectedBinders) newSelection[b] = true;
    recordCommit(newSelection);
    // Mirror into setLastSelection too (recordCommit handles this, but
    // we set explicitly so a future store schema change doesn't drift).
    setLastSelection(newSelection);

    const totalSkipped = payload.parseSkipped + payload.scryfallSkipped;
    const message =
      totalSkipped > 0
        ? `Imported ${body.inserted} cards from ${files.length} file${
            files.length === 1 ? "" : "s"
          } (${totalSkipped} skipped)`
        : `Imported ${body.inserted} cards from ${files.length} file${
            files.length === 1 ? "" : "s"
          }`;
    try {
      window.sessionStorage.setItem(
        "admin-toast",
        JSON.stringify({ message, variant: "success" }),
      );
    } catch {}
    router.push("/admin");
  }

  function handleCancel() {
    // Abort any in-flight request and return to idle.
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStage({ kind: "idle" });
    setPickerSelection({});
    setWillDeleteSelection({});
    filesByStageRef.current = null;
  }

  // Ref holds the actual File objects between handleFiles (stage 1) and
  // handleConfirmPicker (stage 2). The DropZone passes File[] to
  // handleFiles; we store them here so we can re-build FormData without
  // requiring the operator to re-drop.
  const filesByStageRef = useRef<File[] | null>(null);

  // Wrap the public handleFiles to capture the File[] in the ref.
  async function onFilesFromDropZone(files: File[]) {
    filesByStageRef.current = files;
    await handleFiles(files);
  }

  // ---------- Render ----------

  if (stage.kind === "idle") {
    return (
      <div>
        {stage.invalidExtension && (
          <div
            role="alert"
            className="mb-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md p-3 text-sm text-red-600 dark:text-red-400"
          >
            Only .csv files are supported. Please export CSV files from Manabox and try again.
          </div>
        )}
        <DropZone
          onFiles={onFilesFromDropZone}
          onInvalidExtension={() => setStage({ kind: "idle", invalidExtension: true })}
        />
      </div>
    );
  }

  if (stage.kind === "uploading-binders") {
    return (
      <div className="space-y-4">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {fileSummary(stage.files)}
        </p>
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Reading binders…
        </p>
        <ProgressBar done={0} total={0} indeterminate={true} />
        <button
          type="button"
          onClick={handleCancel}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline"
        >
          Cancel upload
        </button>
      </div>
    );
  }

  if (stage.kind === "picker") {
    const selectedCount = Object.values(pickerSelection).filter(Boolean).length;
    const willDeleteCount =
      Object.values(willDeleteSelection).filter(Boolean).length;
    const canContinue = selectedCount > 0 || willDeleteCount > 0;
    return (
      <div className="space-y-4">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {fileSummary(stage.files)} · ✓ Parsed binders
        </p>

        {stage.willDelete.length > 0 && (
          <section
            aria-labelledby="will-delete-heading"
            className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-4"
          >
            <p
              id="will-delete-heading"
              className="text-sm font-semibold text-amber-700 dark:text-amber-300"
            >
              {stage.willDelete.length === 1
                ? "1 binder is missing from this upload but was selected last time:"
                : `${stage.willDelete.length} binders are missing from this upload but were selected last time:`}
            </p>
            <ul className="space-y-1 mt-2">
              {stage.willDelete.map((name) => {
                const checked = willDeleteSelection[name] ?? true;
                return (
                  <li key={name} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setWillDeleteSelection({
                          ...willDeleteSelection,
                          [name]: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-zinc-300"
                      aria-label={`Delete binder ${name}`}
                    />
                    <span className="text-sm">{name}</span>
                    <span className="text-xs text-amber-700 dark:text-amber-400 ml-auto">
                      {checked
                        ? "will be DELETED if you commit"
                        : "will be KEPT"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              Uncheck to keep the existing rows intact.
            </p>
          </section>
        )}

        <BinderPicker
          binders={stage.binders}
          knownBinderNames={knownBinderNamesFn()}
          selection={pickerSelection}
          onToggle={(name, checked) =>
            setPickerSelection((prev) => ({ ...prev, [name]: checked }))
          }
          onBulkSet={(names, checked) =>
            // D-15: SINGLE setPickerSelection — one parent render flips
            // every binder, regardless of count. Do NOT loop onToggle.
            setPickerSelection((prev) => {
              const next = { ...prev };
              for (const name of names) next[name] = checked;
              return next;
            })
          }
        />

        {/* IMPORT-UX-04 / PITFALLS Pitfall 8: helper text + aria-describedby
            so the disabled Continue button is announced with actionable copy. */}
        {!canContinue && (
          <p
            id="continue-disabled-helper"
            className="text-xs text-zinc-500 dark:text-zinc-400 text-right"
          >
            Select at least one binder to continue. Use Select all to start
            with everything checked.
          </p>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-semibold rounded-md border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmPicker}
            disabled={!canContinue}
            aria-describedby={!canContinue ? "continue-disabled-helper" : undefined}
            className="px-4 py-2 text-sm font-semibold rounded-md bg-zinc-900 text-white hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (stage.kind === "uploading") {
    return (
      <div className="space-y-4">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {fileSummary(stage.files)}
        </p>
        {stage.files.length > 1 && (
          <ul className="text-xs text-zinc-500 dark:text-zinc-400 list-disc pl-5 space-y-0.5">
            {stage.files.map((file, index) => (
              <li key={`${file.name}-${index}`}>{file.name}</li>
            ))}
          </ul>
        )}
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Fetching prices from Scryfall
        </p>
        <ProgressBar
          done={stage.done}
          total={stage.total}
          indeterminate={stage.indeterminate}
        />
        <button
          type="button"
          onClick={handleCancel}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline"
        >
          Cancel upload
        </button>
      </div>
    );
  }

  if (stage.kind === "preview" || stage.kind === "committing") {
    const committing = stage.kind === "committing";
    const payload = stage.payload;

    return (
      <div className="space-y-6">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {fileSummary(stage.files)} · ✓ Parsed
        </p>

        <PreviewPanel preview={payload} currentTotal={currentTotal} />

        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
          <p className="font-semibold">Backup reminder</p>
          <p className="mt-1">
            This replaces inventory in the selected binders. Export the current CSV first if you need a rollback reference; successful imports are recorded in Audit.
          </p>
        </div>

        <BinderConfirm
          binders={stage.binders}
          selection={Object.fromEntries(
            stage.selectedBinders.map((b) => [b, true]),
          )}
          willDeleteSelection={Object.fromEntries(
            stage.willDeleteBinders.map((b) => [b, true]),
          )}
          knownBinderNames={knownBinderNamesFn()}
          committing={committing}
          onConfirm={handleConfirmCommit}
          onCancel={handleCancel}
        />
      </div>
    );
  }

  // stage.kind === "error"
  const errStage: Extract<Stage, { kind: "error" }> = stage;
  return (
    <div className="space-y-4">
      <div
        role="alert"
        className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md p-4 text-sm text-red-600 dark:text-red-400"
      >
        <p className="font-semibold mb-1">Import failed — your inventory was not changed.</p>
        <p>{errStage.message}</p>
      </div>
      <button
        type="button"
        onClick={handleCancel}
        className="px-4 py-2 text-sm font-semibold rounded-md border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
