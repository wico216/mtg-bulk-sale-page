// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
  const props: BinderPickerProps = {
    binders: [makeBinder()],
    knownBinderNames: [],
    selection: {},
    onToggle,
    ...overrides,
  };
  render(<BinderPicker {...props} />);
  return { onToggle };
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
    expect(labels[0]).toMatch(/a99/);
    expect(labels[1]).toMatch(/a02/);
    expect(labels[2]).toMatch(/a05/);
    expect(labels[3]).toMatch(/unsorted/);
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
