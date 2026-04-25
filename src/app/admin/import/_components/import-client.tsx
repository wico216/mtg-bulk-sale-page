"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IMPORT_FILE_FIELD,
  type ImportStreamMessage,
  type PreviewPayload,
} from "@/lib/import-contract";
import { DropZone } from "./drop-zone";
import { ProgressBar } from "./progress-bar";
import { PreviewPanel } from "./preview-panel";

type Stage =
  | { kind: "idle"; invalidExtension?: boolean }
  | {
      kind: "uploading";
      filenames: string[];
      totalSize: number;
      done: number;
      total: number;
      indeterminate: boolean;
    }
  | {
      kind: "preview";
      filenames: string[];
      totalSize: number;
      payload: PreviewPayload;
    }
  | {
      kind: "committing";
      filenames: string[];
      totalSize: number;
      payload: PreviewPayload;
    }
  | { kind: "error"; message: string; previousFilenames?: string[] };

function fileLabel(filenames: string[], totalSize: number): string {
  const sizeKb = Math.max(1, Math.round(totalSize / 1024));
  if (filenames.length === 1) return `${filenames[0]} · ${sizeKb} KB`;
  return `${filenames.length} files · ${sizeKb} KB`;
}

export function ImportClient({ currentTotal }: { currentTotal: number }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "idle" });

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    const filenames = files.map((f) => f.name);
    const totalSize = files.reduce((acc, f) => acc + f.size, 0);

    setStage({
      kind: "uploading",
      filenames,
      totalSize,
      done: 0,
      total: 0,
      indeterminate: true,
    });

    const fd = new FormData();
    // 10.1 D-01: append every file under the SAME field name; server uses
    // formData.getAll(IMPORT_FILE_FIELD) to collect them all.
    for (const f of files) {
      fd.append(IMPORT_FILE_FIELD, f);
    }

    let res: Response;
    try {
      res = await fetch("/api/admin/import/preview", { method: "POST", body: fd });
    } catch (err) {
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
        });
      } catch {
        setStage({ kind: "error", message: `Upload failed (${res.status})` });
      }
      return;
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalPreview: PreviewPayload | null = null;

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
          if (msg.type === "progress") {
            setStage({
              kind: "uploading",
              filenames,
              totalSize,
              done: msg.done,
              total: msg.total,
              indeterminate: msg.total === 0,
            });
          } else if (msg.type === "result") {
            finalPreview = msg.preview;
          } else if (msg.type === "error") {
            throw new Error(msg.message);
          }
        }
      }
      if (!finalPreview) throw new Error("Stream ended without a preview result");
      setStage({
        kind: "preview",
        filenames,
        totalSize,
        payload: finalPreview,
      });
    } catch (err) {
      setStage({
        kind: "error",
        message: err instanceof Error ? err.message : "Stream error",
      });
    }
  }

  async function handleConfirm() {
    if (stage.kind !== "preview") return;
    const { payload, filenames, totalSize } = stage;
    setStage({ kind: "committing", filenames, totalSize, payload });

    let res: Response;
    try {
      res = await fetch("/api/admin/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards: payload.cards }),
      });
    } catch (err) {
      setStage({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
      return;
    }

    if (!res.ok) {
      let errMsg = `Import failed (${res.status})`;
      try {
        const body = await res.json();
        if (body?.error) errMsg = body.error;
      } catch {}
      setStage({ kind: "error", message: errMsg, previousFilenames: filenames });
      return;
    }

    const body = (await res.json()) as { success: true; inserted: number };
    const totalSkipped = payload.parseSkipped + payload.scryfallSkipped;
    const message =
      totalSkipped > 0
        ? `Imported ${body.inserted} cards (${totalSkipped} skipped)`
        : `Imported ${body.inserted} cards`;
    try {
      window.sessionStorage.setItem(
        "admin-toast",
        JSON.stringify({ message, variant: "success" }),
      );
    } catch {}
    router.push("/admin");
  }

  function handleCancel() {
    setStage({ kind: "idle" });
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
            Only .csv files are supported. Please export a CSV from Manabox and try again.
          </div>
        )}
        <DropZone
          onFiles={handleFiles}
          onInvalidExtension={() => setStage({ kind: "idle", invalidExtension: true })}
        />
      </div>
    );
  }

  if (stage.kind === "uploading") {
    return (
      <div className="space-y-4">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {fileLabel(stage.filenames, stage.totalSize)}
        </p>
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
    const canConfirm = payload.toImport > 0;
    const confirmLabel = canConfirm
      ? `Confirm import — replace all ${currentTotal} current cards with ${payload.toImport} new cards`
      : `Confirm import`;

    return (
      <div className="space-y-6">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {fileLabel(stage.filenames, stage.totalSize)} · ✓ Parsed
        </p>

        {!canConfirm && (
          <div
            role="alert"
            className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md p-4 text-sm text-red-600 dark:text-red-400"
          >
            <p className="font-semibold mb-1">No valid cards parsed</p>
            <p>
              This CSV did not contain any importable Manabox rows. Check that you exported
              directly from Manabox and try again.
            </p>
          </div>
        )}

        <PreviewPanel preview={payload} currentTotal={currentTotal} />

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={handleCancel}
            disabled={committing}
            className="px-4 py-2 text-sm font-semibold rounded-md border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm || committing}
            className="px-4 py-2 text-sm font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {committing ? (
              <span className="flex items-center gap-2">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="animate-spin"
                  aria-hidden="true"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeOpacity="0.25"
                  />
                  <path
                    d="M4 12a8 8 0 018-8"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                </svg>
                Importing…
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    );
  }

  // stage.kind === "error"
  return (
    <div className="space-y-4">
      <div
        role="alert"
        className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md p-4 text-sm text-red-600 dark:text-red-400"
      >
        <p className="font-semibold mb-1">Import failed — your inventory was not changed.</p>
        <p>{stage.message}</p>
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
