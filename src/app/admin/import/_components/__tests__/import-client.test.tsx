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

    // D-05 / IMPORT-UX-03: picker opens UNCHECKED regardless of isNew or
    // prior lastSelection. The operator must check it (or click Select
    // all) before Continue activates.
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

  it("IMPORT-UX-03 (D-05): unsorted opens UNCHECKED even if lastSelection had it true (no per-binder memory)", async () => {
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

describe("ImportClient — Plan 23-02 picker UX (D-05, IMPORT-UX-01..05)", () => {
  /**
   * Two-binder stage-1 NDJSON response builder used by the Plan 23-02
   * tests. Mirrors the shape returned by `/api/admin/import/preview`
   * stage 1 (binders message only; client aborts the rest).
   */
  function twoBinderStream(): Response {
    return ndjsonResponse([
      {
        type: "binders",
        binders: [
          {
            name: "binder-a",
            rowCount: 12,
            sampleNames: [],
            isNew: false,
          },
          {
            name: "binder-b",
            rowCount: 8,
            sampleNames: [],
            isNew: true,
          },
        ],
      },
    ]);
  }

  it("IMPORT-UX-03: fresh session with no localStorage opens the picker with every binder UNCHECKED and Continue disabled", async () => {
    const user = userEvent.setup();
    // Fresh JSDOM: clear localStorage AND the in-memory store (the global
    // `beforeEach` already does this, but re-asserting fresh-session
    // semantics in-test makes the invariant explicit).
    localStorage.clear();
    act(() => {
      useBinderImportStore.setState({ lastSelection: {}, lastUsedAt: null });
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(twoBinderStream());

    render(<ImportClient currentTotal={0} />);
    await dropFile(user);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /Select binders to import/ }),
      ).toBeInTheDocument(),
    );

    // Every checkbox is UNCHECKED.
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    for (const cb of checkboxes) {
      expect(cb.checked).toBe(false);
    }
    // Header counter: 0 of 2.
    expect(screen.getByText(/0 of 2/)).toBeInTheDocument();
    // Continue is disabled (no selection, no will-delete).
    expect(screen.getByRole("button", { name: /Continue/ })).toBeDisabled();
  });

  it("IMPORT-UX-03 (D-05): returning session with prior lastSelection in localStorage STILL opens the picker UNCHECKED", async () => {
    const user = userEvent.setup();
    // Pre-populate localStorage with the EXACT key + version + state shape
    // that the zustand persist middleware writes. This proves the picker
    // ignores any per-binder memory (D-05 zero-memory invariant) — even
    // when the persisted shape pre-checks both binders, the picker still
    // opens unchecked.
    localStorage.setItem(
      "viki-binder-import-selection",
      JSON.stringify({
        state: {
          lastSelection: { "binder-a": true, "binder-b": true },
          lastUsedAt: "2026-05-19T00:00:00Z",
        },
        version: 1,
      }),
    );
    // Force the store to re-hydrate from localStorage. The persist
    // middleware reads localStorage on first access; we explicitly set
    // the in-memory state to match what hydration would produce.
    act(() => {
      useBinderImportStore.setState({
        lastSelection: { "binder-a": true, "binder-b": true },
        lastUsedAt: "2026-05-19T00:00:00Z",
      });
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(twoBinderStream());

    render(<ImportClient currentTotal={0} />);
    await dropFile(user);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /Select binders to import/ }),
      ).toBeInTheDocument(),
    );

    // D-05: BOTH checkboxes still UNCHECKED despite prior lastSelection
    // having both = true.
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    for (const cb of checkboxes) {
      expect(cb.checked).toBe(false);
    }
  });

  it("IMPORT-UX-04 + PITFALLS Pitfall 8: Continue disabled, helper text rendered with id 'continue-disabled-helper', button has aria-describedby pointing at it", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(twoBinderStream());

    render(<ImportClient currentTotal={0} />);
    await dropFile(user);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /Select binders to import/ }),
      ).toBeInTheDocument(),
    );

    // Helper text present.
    const helper = screen.getByText(
      /Select at least one binder to continue\. Use Select all to start with everything checked\./,
    );
    expect(helper).toBeInTheDocument();
    expect(helper).toHaveAttribute("id", "continue-disabled-helper");

    // Continue button is disabled AND aria-describedby points at the helper.
    const continueBtn = screen.getByRole("button", { name: /Continue/ });
    expect(continueBtn).toBeDisabled();
    expect(continueBtn).toHaveAttribute(
      "aria-describedby",
      "continue-disabled-helper",
    );
  });

  it("IMPORT-UX-04 + IMPORT-UX-01: clicking Select all enables Continue and removes the helper text", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(twoBinderStream());

    render(<ImportClient currentTotal={0} />);
    await dropFile(user);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /Select binders to import/ }),
      ).toBeInTheDocument(),
    );

    // Initial: disabled + helper visible.
    expect(screen.getByRole("button", { name: /Continue/ })).toBeDisabled();
    expect(
      screen.getByText(/Use Select all to start with everything checked/),
    ).toBeInTheDocument();

    // Click Select all (header button) — both binders flip checked in
    // one render via onBulkSet (D-15).
    await user.click(screen.getByRole("button", { name: /^Select all$/ }));

    // Continue is now enabled; helper text is gone.
    expect(screen.getByRole("button", { name: /Continue/ })).not.toBeDisabled();
    expect(
      screen.queryByText(/Use Select all to start with everything checked/),
    ).not.toBeInTheDocument();
  });

  it("IMPORT-UX-04: Continue stays ENABLED when picker selection is empty but a will-delete entry remains checked (D-05 will-delete UNCHANGED)", async () => {
    const user = userEvent.setup();
    // Pre-seed lastSelection with a binder that is NOT in the upload.
    // The will-delete amber panel will surface "binder-b" as a missing
    // prior-known binder, default-CHECKED per v1.3 D-11 (UNCHANGED in v1.4).
    act(() => {
      useBinderImportStore.setState({
        lastSelection: { "binder-a": true, "binder-b": true },
        lastUsedAt: null,
      });
    });
    // Upload contains only "binder-a"; "binder-b" is missing.
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      ndjsonResponse([
        {
          type: "binders",
          binders: [
            {
              name: "binder-a",
              rowCount: 5,
              sampleNames: [],
              isNew: false,
            },
          ],
        },
      ]),
    );

    render(<ImportClient currentTotal={0} />);
    await dropFile(user);
    await waitFor(() =>
      expect(screen.getByText("binder-b")).toBeInTheDocument(),
    );

    // Will-delete checkbox for binder-b is CHECKED by default (D-11 / D-05).
    const willDeleteCb = screen.getByLabelText(
      /Delete binder binder-b/,
    ) as HTMLInputElement;
    expect(willDeleteCb.checked).toBe(true);

    // The picker checkbox for binder-a is UNCHECKED (D-05).
    const allCheckboxes = screen.getAllByRole(
      "checkbox",
    ) as HTMLInputElement[];
    const pickerCb = allCheckboxes.find((cb) => cb !== willDeleteCb);
    expect(pickerCb?.checked).toBe(false);

    // Continue is ENABLED because willDeleteCount > 0 even though
    // selectedCount === 0.
    expect(screen.getByRole("button", { name: /Continue/ })).not.toBeDisabled();
    // Helper text is NOT rendered (canContinue is true).
    expect(
      screen.queryByText(/Use Select all to start with everything checked/),
    ).not.toBeInTheDocument();
  });

  // D-05 type-level guard test — see PITFALLS Pitfall 3 (removed)
  it("D-05 type-level guard: accessing the removed selector (defaultCheckedFor) // removed is a TypeScript error (prevents future re-introduction)", () => {
    const state = useBinderImportStore.getState();
    // @ts-expect-error — D-05 / Plan 23-02 Task 1: removed from BinderImportState. // removed
    const removed = state.defaultCheckedFor; // removed
    // Runtime secondary check: the property is undefined.
    expect(removed).toBeUndefined();
  });
});
