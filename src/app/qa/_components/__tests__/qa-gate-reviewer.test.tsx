// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { getQaGateRun } from "@/lib/qa-gates";
import { QaGateReviewer } from "../qa-gate-reviewer";

describe("QaGateReviewer", () => {
  it("explains the change, expected behavior, and agent-recorded evidence", () => {
    const run = getQaGateRun("demo-mobile-storefront-gate");
    expect(run).toBeDefined();

    const { container } = render(<QaGateReviewer run={run!} initialReview={null} />);

    expect(screen.getByRole("heading", { name: /what changed/i })).toBeInTheDocument();
    expect(screen.getByText(/human-in-the-loop/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /what to look for/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /agent-recorded evidence/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Playwright/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Video proof is visible/i).length).toBeGreaterThan(0);
    expect(container.querySelector("video")).not.toBeNull();
  });

  it("keeps approve disabled until required checklist rows pass but always lets Wiko request fixes", async () => {
    const user = userEvent.setup();
    const run = getQaGateRun("demo-mobile-storefront-gate");
    expect(run).toBeDefined();
    global.fetch = vi.fn();

    render(<QaGateReviewer run={run!} initialReview={null} />);

    const approve = screen.getByRole("button", { name: /approve/i });
    expect(approve).toBeDisabled();
    expect(screen.getByRole("button", { name: /fail|request fixes/i })).toBeEnabled();

    for (const item of run!.checklist.filter((check) => check.required)) {
      const group = screen.getByRole("group", { name: new RegExp(item.label, "i") });
      await user.click(within(group).getByLabelText(/^pass$/i));
    }

    expect(approve).toBeEnabled();
  });
});
