// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ImportStreamMessage } from "@/lib/import-contract";
import { useBinderImportStore } from "@/lib/store/binder-import-store";

// Mock next/navigation — the component calls router.push on success.
const routerPushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

import { ImportClient } from "@/app/admin/import/_components/import-client";

/**
 * Build a Response whose body streams NDJSON messages. The server writes
 * each `JSON.stringify(msg) + "\n"`; we mirror that exactly.
 */
function ndjsonResponse(
  messages: ImportStreamMessage[],
  status = 200,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const msg of messages) {
        controller.enqueue(encoder.encode(JSON.stringify(msg) + "\n"));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Drop a CSV File into the DropZone. The component receives an array of
 * Files via the DropZone's `onFiles` callback. The DropZone renders a
 * hidden <input type="file"> we address via querySelector since it has
 * no accessible label.
 */
async function dropFile(user: ReturnType<typeof userEvent.setup>) {
  const input = document.querySelector(
    "input[type=file]",
  ) as HTMLInputElement | null;
  if (!input) throw new Error("file input not found in DropZone");
  const file = new File(["dummy"], "binder-a.csv", { type: "text/csv" });
  await user.upload(input, file);
}

beforeEach(() => {
  routerPushMock.mockReset();
  useBinderImportStore.setState({ lastSelection: {}, lastUsedAt: null });
  vi.restoreAllMocks();
});

describe("ImportClient — Phase 19 picker flow", () => {
  it("happy path: upload → picker → preview → commit updates the store", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        // Stage 1: binders message then close. (Client aborts so the
        // server-side never gets to emit progress/result for this stream.)
        ndjsonResponse([
          {
            type: "binders",
            binders: [
              {
                name: "a02",
                rowCount: 12,
                sampleNames: ["Lightning Bolt"],
                isNew: false,
              },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(
        // Stage 2: progress + result, scoped enrichment.
        ndjsonResponse([
          { type: "binders", binders: [] }, // server re-emits; client ignores
          { type: "progress", done: 12, total: 12, stage: "enrich" },
          {
            type: "result",
            preview: {
              toImport: 12,
              parseSkipped: 0,
              scryfallSkipped: 0,
              missingPrices: 0,
              sample: [],
              skippedRows: [],
              sourceFiles: [],
              cards: [],
            },
          },
        ]),
      )
      .mockResolvedValueOnce(
        // Stage 3: commit success.
        jsonResponse({ success: true, inserted: 12 }),
      );

    render(<ImportClient currentTotal={100} />);
    await dropFile(user);

    // Wait for picker stage.
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /Select binders to import/ }),
      ).toBeInTheDocument(),
    );

    // a02 is "isNew: false" and lastSelection is empty → defaultCheckedFor
    // returns false. The picker checkbox should be unchecked. The operator
    // must check it before Continue.
    const a02Checkbox = screen.getByRole("checkbox", {
      // The picker's checkbox is inside a label that wraps the binder name.
    });
    await user.click(a02Checkbox);

    await user.click(screen.getByRole("button", { name: /Continue/ }));

    // Wait for preview stage.
    await waitFor(() =>
      expect(screen.getByLabelText(/Type REPLACE/)).toBeInTheDocument(),
    );

    await user.type(screen.getByLabelText(/Type REPLACE/), "REPLACE");
    await user.click(screen.getByRole("button", { name: /Commit import/ }));

    await waitFor(() => expect(routerPushMock).toHaveBeenCalledWith("/admin"));

    expect(useBinderImportStore.getState().lastSelection).toEqual({
      a02: true,
    });
    // 3 fetches: stage 1 (binders), stage 2 (enrichment), commit.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const commitCall = fetchMock.mock.calls[2];
    const commitBody = JSON.parse((commitCall[1] as RequestInit).body as string);
    expect(commitBody.selectedBinders).toEqual(["a02"]);
  });

  it("will-delete panel renders when prior selection includes a binder missing from upload", async () => {
    const user = userEvent.setup();
    // Pre-seed the store with a binder NOT in the upload.
    act(() => {
      useBinderImportStore.setState({
        lastSelection: { a07: true },
        lastUsedAt: null,
      });
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      ndjsonResponse([
        {
          type: "binders",
          binders: [
            {
              name: "a02",
              rowCount: 12,
              sampleNames: [],
              isNew: false,
            },
          ],
        },
      ]),
    );

    render(<ImportClient currentTotal={100} />);
    await dropFile(user);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /Select binders to import/ }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/1 binder is missing/)).toBeInTheDocument();
    expect(screen.getByText("a07")).toBeInTheDocument();
    // Default-CHECKED per D-11.
    const willDeleteCheckbox = screen.getByLabelText(/Delete binder a07/);
    expect(willDeleteCheckbox).toBeChecked();
  });

  it("unchecking the will-delete entry preserves the existing rows on commit", async () => {
    const user = userEvent.setup();
    act(() => {
      useBinderImportStore.setState({
        lastSelection: { a07: true },
        lastUsedAt: null,
      });
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        ndjsonResponse([
          {
            type: "binders",
            binders: [
              {
                name: "a02",
                rowCount: 12,
                sampleNames: [],
                isNew: false,
              },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(
        ndjsonResponse([
          { type: "binders", binders: [] },
          {
            type: "result",
            preview: {
              toImport: 12,
              parseSkipped: 0,
              scryfallSkipped: 0,
              missingPrices: 0,
              sample: [],
              skippedRows: [],
              sourceFiles: [],
              cards: [],
            },
          },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true, inserted: 12 }));

    render(<ImportClient currentTotal={100} />);
    await dropFile(user);

    await waitFor(() =>
      expect(screen.getByText("a07")).toBeInTheDocument(),
    );
    // Uncheck the will-delete entry — keep a07 intact.
    await user.click(screen.getByLabelText(/Delete binder a07/));

    // Check the a02 row. After unchecking a07, both checkboxes are
    // currently unchecked; the first is the will-delete a07, the second
    // is the picker's a02.
    const allCb = screen.getAllByRole("checkbox");
    await user.click(allCb[1]);

    await user.click(screen.getByRole("button", { name: /Continue/ }));
    await waitFor(() =>
      expect(screen.getByLabelText(/Type REPLACE/)).toBeInTheDocument(),
    );
    await user.type(screen.getByLabelText(/Type REPLACE/), "REPLACE");
    await user.click(screen.getByRole("button", { name: /Commit import/ }));
    await waitFor(() => expect(routerPushMock).toHaveBeenCalled());

    const commitBody = JSON.parse(
      (fetchMock.mock.calls[2][1] as RequestInit).body as string,
    );
    expect(commitBody.selectedBinders).toEqual(["a02"]);
  });

  it("leaving the will-delete entry checked includes it in commit selectedBinders", async () => {
    const user = userEvent.setup();
    act(() => {
      useBinderImportStore.setState({
        lastSelection: { a07: true },
        lastUsedAt: null,
      });
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        ndjsonResponse([
          {
            type: "binders",
            binders: [
              {
                name: "a02",
                rowCount: 12,
                sampleNames: [],
                isNew: false,
              },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(
        ndjsonResponse([
          { type: "binders", binders: [] },
          {
            type: "result",
            preview: {
              toImport: 12,
              parseSkipped: 0,
              scryfallSkipped: 0,
              missingPrices: 0,
              sample: [],
              skippedRows: [],
              sourceFiles: [],
              cards: [],
            },
          },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true, inserted: 12 }));

    render(<ImportClient currentTotal={100} />);
    await dropFile(user);

    await waitFor(() =>
      expect(screen.getByText("a07")).toBeInTheDocument(),
    );
    // Leave a07 will-delete CHECKED (default state).
    // Check the a02 picker row.
    const allCb = screen.getAllByRole("checkbox");
    await user.click(allCb[1]); // picker a02

    await user.click(screen.getByRole("button", { name: /Continue/ }));
    await waitFor(() =>
      expect(screen.getByLabelText(/Type REPLACE/)).toBeInTheDocument(),
    );
    await user.type(screen.getByLabelText(/Type REPLACE/), "REPLACE");
    await user.click(screen.getByRole("button", { name: /Commit import/ }));
    await waitFor(() => expect(routerPushMock).toHaveBeenCalled());

    const commitBody = JSON.parse(
      (fetchMock.mock.calls[2][1] as RequestInit).body as string,
    );
    expect(new Set(commitBody.selectedBinders)).toEqual(
      new Set(["a02", "a07"]),
    );
  });

  it("unsorted is not pre-checked even if lastSelection had it true (D-08)", async () => {
    const user = userEvent.setup();
    act(() => {
      useBinderImportStore.setState({
        lastSelection: { unsorted: true },
        lastUsedAt: null,
      });
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      ndjsonResponse([
        {
          type: "binders",
          binders: [
            {
              name: "unsorted",
              rowCount: 5,
              sampleNames: [],
              isNew: false,
            },
          ],
        },
      ]),
    );

    render(<ImportClient currentTotal={100} />);
    await dropFile(user);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /Select binders to import/ }),
      ).toBeInTheDocument(),
    );
    const cb = screen.getByRole("checkbox") as HTMLInputElement;
    expect(cb.checked).toBe(false);
  });

  it("continue button is disabled when no binders are selected and no will-delete entries", async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      ndjsonResponse([
        {
          type: "binders",
          binders: [
            {
              name: "a02",
              rowCount: 12,
              sampleNames: [],
              isNew: false,
            },
          ],
        },
      ]),
    );

    render(<ImportClient currentTotal={100} />);
    await dropFile(user);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /Select binders to import/ }),
      ).toBeInTheDocument(),
    );
    // No selection, no will-delete → Continue disabled.
    expect(screen.getByRole("button", { name: /Continue/ })).toBeDisabled();
  });

  it("cancel from picker returns to idle", async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      ndjsonResponse([
        {
          type: "binders",
          binders: [
            {
              name: "a02",
              rowCount: 12,
              sampleNames: [],
              isNew: false,
            },
          ],
        },
      ]),
    );

    render(<ImportClient currentTotal={100} />);
    await dropFile(user);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /Select binders to import/ }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    // Idle stage renders DropZone — we can't easily address by role, so
    // we assert the picker heading is gone.
    expect(
      screen.queryByRole("heading", { name: /Select binders to import/ }),
    ).not.toBeInTheDocument();
  });

  it("stage-1 NDJSON error transitions to error stage with the message", async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      ndjsonResponse([{ type: "error", message: "parse failure" }]),
    );

    render(<ImportClient currentTotal={100} />);
    await dropFile(user);
    await waitFor(() =>
      expect(screen.getByText(/parse failure/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Import failed/)).toBeInTheDocument();
  });
});
