// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { SelectionDock } from "../selection-dock";

function renderDock(overrides: Partial<ComponentProps<typeof SelectionDock>> = {}) {
  const props: ComponentProps<typeof SelectionDock> = {
    count: 1,
    deleting: false,
    exporting: false,
    onRequestDelete: vi.fn(),
    onRequestEditVersion: vi.fn(),
    onExport: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
  render(<SelectionDock {...props} />);
  return props;
}

describe("SelectionDock", () => {
  it("shows an Edit version action for exactly one selected inventory row", async () => {
    const user = userEvent.setup();
    const props = renderDock({ count: 1 });

    await user.click(screen.getByRole("button", { name: /edit version/i }));

    expect(props.onRequestEditVersion).toHaveBeenCalledTimes(1);
  });

  it("hides Edit version when multiple inventory rows are selected", () => {
    renderDock({ count: 2 });

    expect(screen.queryByRole("button", { name: /edit version/i })).not.toBeInTheDocument();
  });
});
