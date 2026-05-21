// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  BinderPicker,
  computeMissingBinders,
  type BinderPickerProps,
} from "@/app/admin/import/_components/binder-picker";
import type { BinderSummary } from "@/lib/import-contract";

function makeBinder(overrides: Partial<BinderSummary> = {}): BinderSummary {
  return {
    name: "a02",
    rowCount: 12,
    sampleNames: ["Lightning Bolt", "Counterspell"],
    isNew: false,
    ...overrides,
  };
}

function renderPicker(overrides: Partial<BinderPickerProps> = {}) {
  const onToggle = vi.fn();
  const onBulkSet = vi.fn();
  const props: BinderPickerProps = {
    binders: [makeBinder()],
    knownBinderNames: [],
    selection: {},
    onToggle,
    onBulkSet,
    ...overrides,
  };
  render(<BinderPicker {...props} />);
  return { onToggle, onBulkSet };
}

/**
 * Plan 23-02 Task 3 helper — wrap the picker in a tiny stateful parent so
 * click handlers can drive the controlled `selection` prop. Used by the
 * Select all / Deselect all / live-counter tests where we must observe
 * the picker re-render with the new state in the same render cycle.
 *
 * Returns a `getSetStateCallCount` accessor so the D-15 single-render
 * test can assert the parent's setState fired exactly once per bulk click.
 */
function renderControlledPicker(
  binders: BinderSummary[],
  initialSelection: Record<string, boolean> = {},
) {
  let setStateCallCount = 0;
  function Wrapper() {
    const [selection, setSelection] = useState(initialSelection);
    return (
      <BinderPicker
        binders={binders}
        knownBinderNames={[]}
        selection={selection}
        onToggle={(name, checked) => {
          setStateCallCount += 1;
          setSelection((prev) => ({ ...prev, [name]: checked }));
        }}
        onBulkSet={(names, checked) => {
          setStateCallCount += 1;
          setSelection((prev) => {
            const next = { ...prev };
            for (const n of names) next[n] = checked;
            return next;
          });
        }}
      />
    );
  }
  render(<Wrapper />);
  return { getSetStateCallCount: () => setStateCallCount };
}

describe("BinderPicker", () => {
  it("renders one row per binder", () => {
    renderPicker({
      binders: [
        makeBinder({ name: "a02" }),
        makeBinder({ name: "a05" }),
        makeBinder({ name: "a07" }),
      ],
    });
    expect(screen.getAllByRole("checkbox").length).toBe(3);
  });

  it("sorts NEW binders first, then alphabetical existing, with unsorted last (D-05, D-08)", () => {
    renderPicker({
      binders: [
        makeBinder({ name: "a02", isNew: false }),
        makeBinder({ name: "unsorted", isNew: true }),
        makeBinder({ name: "a99", isNew: true }),
        makeBinder({ name: "a05", isNew: false }),
      ],
    });
    const labels = screen
      .getAllByRole("checkbox")
      .map((cb) => cb.parentElement?.textContent ?? "");
    // Expected order: a99 (NEW alpha), then a02 + a05 (existing alpha), unsorted last.
    // Labels are now display-formatted (A99 not a99, Unsorted not unsorted)
    // so the picker matches how the operator labels physical binders. The
    // picker's selection key still uses the canonical lowercase form
    // internally — display-only transform.
    expect(labels[0]).toMatch(/A99/);
    expect(labels[1]).toMatch(/A02/);
    expect(labels[2]).toMatch(/A05/);
    expect(labels[3]).toMatch(/Unsorted/);
  });

  it("formats row count with thousands separator (D-06)", () => {
    renderPicker({ binders: [makeBinder({ name: "a02", rowCount: 3576 })] });
    expect(screen.getByText("3,576")).toBeInTheDocument();
  });

  it("shows NEW pill for isNew binders (D-07)", () => {
    renderPicker({ binders: [makeBinder({ name: "a99", isNew: true })] });
    expect(screen.getByText("NEW")).toBeInTheDocument();
  });

  it("shows Legacy pill for unsorted binder regardless of isNew (D-08)", () => {
    renderPicker({
      binders: [makeBinder({ name: "unsorted", isNew: false })],
    });
    expect(screen.getByText("Legacy")).toBeInTheDocument();
    expect(screen.queryByText("NEW")).not.toBeInTheDocument();
  });

  it("reflects selection prop on checkboxes", () => {
    renderPicker({
      binders: [
        makeBinder({ name: "a02" }),
        makeBinder({ name: "a05" }),
      ],
      selection: { a02: true, a05: false },
    });
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    // Sort sets order: both are existing, alpha → [a02, a05]
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(false);
  });

  it("calls onToggle with the binder name and new checked state on click", async () => {
    const user = userEvent.setup();
    const { onToggle } = renderPicker({
      binders: [makeBinder({ name: "a02" })],
      selection: { a02: false },
    });
    const cb = screen.getByRole("checkbox");
    await user.click(cb);
    expect(onToggle).toHaveBeenCalledWith("a02", true);
  });

  it("renders sample names under the binder row, truncated to 5", () => {
    renderPicker({
      binders: [
        makeBinder({
          name: "a02",
          sampleNames: ["A", "B", "C", "D", "E", "F", "G"],
        }),
      ],
    });
    // Joined: "A, B, C, D, E"
    expect(screen.getByText(/A, B, C, D, E$/)).toBeInTheDocument();
  });

  it("header shows selected count of total", () => {
    renderPicker({
      binders: [
        makeBinder({ name: "a02" }),
        makeBinder({ name: "a05" }),
        makeBinder({ name: "a07" }),
        makeBinder({ name: "a09" }),
        makeBinder({ name: "a11" }),
      ],
      selection: { a02: true, a05: true },
    });
    const header = screen.getByRole("heading", {
      name: /Select binders to import/,
    });
    expect(within(header).getByText(/2 of 5/)).toBeInTheDocument();
  });

  it("does not render an empty sample-names paragraph when sampleNames is empty", () => {
    renderPicker({
      binders: [makeBinder({ name: "a02", sampleNames: [] })],
    });
    // The label text contains "a02" + "12" + maybe a pill; no separate paragraph.
    // We assert the structure: only ONE paragraph (or zero) within the row wrapper.
    const cb = screen.getByRole("checkbox");
    const wrapper = cb.closest("div");
    expect(wrapper?.querySelectorAll("p").length).toBe(0);
  });
});

describe("BinderPicker — Plan 23-02 Select all / Deselect all (D-05, D-15)", () => {
  const twoBinders: BinderSummary[] = [
    { name: "a", rowCount: 10, sampleNames: [], isNew: false },
    { name: "b", rowCount: 5, sampleNames: [], isNew: true },
  ];

  it("IMPORT-UX-05: initial render header shows '0 of N' when nothing is selected", () => {
    renderPicker({
      binders: twoBinders,
      selection: { a: false, b: false },
    });
    const header = screen.getByRole("heading", {
      name: /Select binders to import/,
    });
    expect(within(header).getByText(/0 of 2/)).toBeInTheDocument();
  });

  it("IMPORT-UX-05: live counter updates from '0 of N' to '1 of N' within one click cycle", async () => {
    const user = userEvent.setup();
    renderControlledPicker(twoBinders, { a: false, b: false });
    // Before: 0 of 2
    expect(
      within(
        screen.getByRole("heading", { name: /Select binders to import/ }),
      ).getByText(/0 of 2/),
    ).toBeInTheDocument();
    // Click the first checkbox (a).
    const cbA = screen.getAllByRole("checkbox")[0] as HTMLInputElement;
    await user.click(cbA);
    // After: counter shows 1 of 2 within the same render flush
    expect(
      within(
        screen.getByRole("heading", { name: /Select binders to import/ }),
      ).getByText(/1 of 2/),
    ).toBeInTheDocument();
  });

  it("IMPORT-UX-01: Select all calls onBulkSet exactly once with (allNames, true) and updates the counter to 'N of N'", async () => {
    const user = userEvent.setup();
    const { onBulkSet } = renderPicker({
      binders: twoBinders,
      selection: { a: false, b: false },
    });
    await user.click(screen.getByRole("button", { name: /^Select all$/ }));
    expect(onBulkSet).toHaveBeenCalledTimes(1);
    // The bulk array reflects the INPUT `binders` prop order — the picker
    // maps over `binders` (NOT the locally-sorted display list), so the
    // names arrive in the order they were passed.
    expect(onBulkSet).toHaveBeenCalledWith(["a", "b"], true);

    // Now simulate the parent applying the bulk update.
    renderControlledPicker(twoBinders, { a: false, b: false });
    // Use the second render-tree's Select all button. There are now two
    // pickers in the DOM (the bare one above and the controlled one); the
    // second is the controlled wrapper.
    const allSelectAll = screen.getAllByRole("button", { name: /^Select all$/ });
    await user.click(allSelectAll[allSelectAll.length - 1]);
    // The controlled wrapper's picker shows '2 of 2' in its heading.
    const headings = screen.getAllByRole("heading", {
      name: /Select binders to import/,
    });
    expect(
      within(headings[headings.length - 1]).getByText(/2 of 2/),
    ).toBeInTheDocument();
  });

  it("IMPORT-UX-02: Deselect all calls onBulkSet exactly once with (allNames, false) and counter returns to '0 of N'", async () => {
    const user = userEvent.setup();
    const { onBulkSet } = renderPicker({
      binders: twoBinders,
      selection: { a: true, b: true },
    });
    await user.click(screen.getByRole("button", { name: /^Deselect all$/ }));
    expect(onBulkSet).toHaveBeenCalledTimes(1);
    expect(onBulkSet).toHaveBeenCalledWith(["a", "b"], false);

    // Controlled wrapper round-trip.
    renderControlledPicker(twoBinders, { a: true, b: true });
    const allDeselectAll = screen.getAllByRole("button", {
      name: /^Deselect all$/,
    });
    await user.click(allDeselectAll[allDeselectAll.length - 1]);
    const headings = screen.getAllByRole("heading", {
      name: /Select binders to import/,
    });
    expect(
      within(headings[headings.length - 1]).getByText(/0 of 2/),
    ).toBeInTheDocument();
  });

  it("IMPORT-UX-01 / D-15: Select all triggers exactly ONE parent setState call (single-render guarantee)", async () => {
    const user = userEvent.setup();
    const tenBinders: BinderSummary[] = Array.from({ length: 10 }, (_, i) => ({
      name: `binder-${String(i).padStart(2, "0")}`,
      rowCount: 1,
      sampleNames: [],
      isNew: false,
    }));
    const { getSetStateCallCount } = renderControlledPicker(tenBinders, {});
    await user.click(screen.getByRole("button", { name: /^Select all$/ }));
    // D-15: ONE setState call regardless of binder count (NOT 10).
    expect(getSetStateCallCount()).toBe(1);
  });

  it("PITFALLS Pitfall 15: Select all and Deselect all are native <button type='button'> with correct tab order", async () => {
    renderPicker({
      binders: twoBinders,
      selection: { a: false, b: false },
    });
    const selectAll = screen.getByRole("button", { name: /^Select all$/ });
    const deselectAll = screen.getByRole("button", { name: /^Deselect all$/ });

    // Native button element with the type="button" attribute (NOT a div /
    // span / anchor pretending to be a button).
    expect(selectAll.tagName).toBe("BUTTON");
    expect(deselectAll.tagName).toBe("BUTTON");
    expect(selectAll).toHaveAttribute("type", "button");
    expect(deselectAll).toHaveAttribute("type", "button");

    // Tab order: Select all → Deselect all → first checkbox.
    act(() => (selectAll as HTMLButtonElement).focus());
    expect(document.activeElement).toBe(selectAll);

    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(deselectAll);
    await user.tab();
    // Next focusable element is the first row's checkbox. Picker sorts
    // NEW binders first (b) then existing alpha (a) — the first checkbox
    // belongs to "b".
    const firstCheckbox = screen.getAllByRole("checkbox")[0];
    expect(document.activeElement).toBe(firstCheckbox);
  });

  it("IMPORT-UX-01: when binders includes 'unsorted', Select all checks it too (no special-case after D-05 dropped D-08 unsorted override)", async () => {
    const user = userEvent.setup();
    const bindersWithUnsorted: BinderSummary[] = [
      { name: "a02", rowCount: 5, sampleNames: [], isNew: false },
      { name: "unsorted", rowCount: 100, sampleNames: [], isNew: false },
    ];
    const { onBulkSet } = renderPicker({
      binders: bindersWithUnsorted,
      selection: { a02: false, unsorted: false },
    });
    await user.click(screen.getByRole("button", { name: /^Select all$/ }));
    expect(onBulkSet).toHaveBeenCalledTimes(1);
    // The bulk array MUST include "unsorted" — the operator can deselect
    // it via the row checkbox if they don't actually want to import it.
    const [names, checked] = onBulkSet.mock.calls[0];
    expect(new Set(names)).toEqual(new Set(["a02", "unsorted"]));
    expect(checked).toBe(true);
  });
});

describe("computeMissingBinders", () => {
  it("returns binders in known but not in upload", () => {
    const result = computeMissingBinders(
      [{ name: "a02", rowCount: 1, sampleNames: [], isNew: false }, { name: "a07", rowCount: 1, sampleNames: [], isNew: false }],
      ["a02", "a05", "a07"],
    );
    expect(result).toEqual(["a05"]);
  });

  it("returns empty when all known binders are in the upload", () => {
    const result = computeMissingBinders(
      [
        { name: "a02", rowCount: 1, sampleNames: [], isNew: false },
        { name: "a05", rowCount: 1, sampleNames: [], isNew: false },
      ],
      ["a02"],
    );
    expect(result).toEqual([]);
  });

  it("returns sorted output", () => {
    const result = computeMissingBinders([], ["a07", "a02", "a05"]);
    expect(result).toEqual(["a02", "a05", "a07"]);
  });
});
