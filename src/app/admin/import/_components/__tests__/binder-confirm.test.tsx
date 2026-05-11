// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  BinderConfirm,
  computeBreakdown,
  type BinderConfirmProps,
} from "@/app/admin/import/_components/binder-confirm";
import type { BinderSummary } from "@/lib/import-contract";

function makeBinder(overrides: Partial<BinderSummary> = {}): BinderSummary {
  return {
    name: "a02",
    rowCount: 12,
    sampleNames: ["Lightning Bolt"],
    isNew: false,
    ...overrides,
  };
}

function renderConfirm(overrides: Partial<BinderConfirmProps> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const props: BinderConfirmProps = {
    binders: [makeBinder()],
    selection: { a02: true },
    willDeleteSelection: {},
    knownBinderNames: ["a02"],
    committing: false,
    onConfirm,
    onCancel,
    ...overrides,
  };
  render(<BinderConfirm {...props} />);
  return { onConfirm, onCancel };
}

describe("computeBreakdown", () => {
  it("classifies known binders as REPLACE and unknown as ADD", () => {
    const result = computeBreakdown(
      [
        makeBinder({ name: "a02", isNew: false }),
        makeBinder({ name: "a99", isNew: true }),
      ],
      { a02: true, a99: true },
      {},
      ["a02"],
    );
    expect(result).toEqual([
      { kind: "ADD", binderName: "a99", rowCount: 12 },
      { kind: "REPLACE", binderName: "a02", rowCount: 12 },
    ]);
  });

  it("emits DELETE entries for checked will-delete binders only", () => {
    const result = computeBreakdown(
      [],
      {},
      { a07: true, a08: false },
      ["a07", "a08"],
    );
    expect(result).toEqual([
      { kind: "DELETE", binderName: "a07", rowCount: 0 },
    ]);
  });

  it("sort order: ADD then REPLACE then DELETE, alpha within", () => {
    const result = computeBreakdown(
      [
        makeBinder({ name: "z02", isNew: true }),
        makeBinder({ name: "a02", isNew: true }),
        makeBinder({ name: "b02", isNew: false }),
      ],
      { z02: true, a02: true, b02: true },
      { z99: true, a99: true },
      ["b02", "z99", "a99"],
    );
    expect(result.map((e) => `${e.kind}:${e.binderName}`)).toEqual([
      "ADD:a02",
      "ADD:z02",
      "REPLACE:b02",
      "DELETE:a99",
      "DELETE:z99",
    ]);
  });
});

describe("BinderConfirm", () => {
  it("commit button is disabled until REPLACE is typed exactly", async () => {
    const user = userEvent.setup();
    renderConfirm();
    const commitBtn = screen.getByRole("button", { name: /Commit import/ });
    expect(commitBtn).toBeDisabled();

    const input = screen.getByLabelText(/Type REPLACE/);
    await user.type(input, "REPLAC");
    expect(commitBtn).toBeDisabled();

    await user.type(input, "E");
    expect(commitBtn).not.toBeDisabled();
  });

  it("commit button is disabled when entries are empty (no selection, no will-delete)", async () => {
    const user = userEvent.setup();
    renderConfirm({
      selection: {},
      willDeleteSelection: {},
    });
    const input = screen.getByLabelText(/Type REPLACE/);
    await user.type(input, "REPLACE");
    const commitBtn = screen.getByRole("button", { name: /Commit import/ });
    expect(commitBtn).toBeDisabled();
  });

  it("commit button is disabled while committing", async () => {
    const user = userEvent.setup();
    renderConfirm({ committing: true });
    // The commit button shows the "Importing…" spinner copy when committing.
    const commitBtn = screen.getByRole("button", { name: /Importing/ });
    expect(commitBtn).toBeDisabled();
    // Input is disabled too — typing is blocked.
    const input = screen.getByLabelText(/Type REPLACE/) as HTMLInputElement;
    expect(input).toBeDisabled();
    await user.click(commitBtn);
    // No-op (button is disabled).
  });

  it("Cancel button fires onCancel and is enabled until committing", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderConfirm();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).not.toBeDisabled();
    await user.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Cancel is disabled while committing", () => {
    renderConfirm({ committing: true });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toBeDisabled();
  });

  it("NEW badge appears on ADD entries only", () => {
    renderConfirm({
      binders: [
        makeBinder({ name: "a02", isNew: false }),
        makeBinder({ name: "a99", isNew: true }),
      ],
      selection: { a02: true, a99: true },
      knownBinderNames: ["a02"],
    });
    // Exactly one "NEW" badge (next to the ADD a99 entry).
    expect(screen.getAllByText("NEW")).toHaveLength(1);
  });

  it("rowCount renders with thousands separator for non-DELETE entries", () => {
    renderConfirm({
      binders: [
        makeBinder({ name: "a02", isNew: false, rowCount: 3576 }),
      ],
      selection: { a02: true },
      knownBinderNames: ["a02"],
    });
    expect(screen.getByText(/3,576 rows in "a02"/)).toBeInTheDocument();
  });

  it('DELETE entries render as "existing rows" not a count', () => {
    renderConfirm({
      binders: [],
      selection: {},
      willDeleteSelection: { a07: true },
      knownBinderNames: ["a07"],
    });
    expect(
      screen.getByText(/existing rows in "a07"/),
    ).toBeInTheDocument();
  });

  it("clicking Commit fires onConfirm when typed phrase matches", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderConfirm();
    await user.type(screen.getByLabelText(/Type REPLACE/), "REPLACE");
    await user.click(screen.getByRole("button", { name: /Commit import/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
