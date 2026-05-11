// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CartMigrationToast } from "../cart-migration-toast";

describe("CartMigrationToast (Phase 20 D-12)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the D-12 message verbatim", () => {
    render(<CartMigrationToast onDismiss={() => {}} />);
    expect(
      screen.getByText(
        /We updated your cart for our improved inventory system\. If anything looks off, give it a refresh\./,
      ),
    ).toBeInTheDocument();
  });

  it("fires onDismiss when the × button is clicked", () => {
    const onDismiss = vi.fn();
    render(<CartMigrationToast onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText(/dismiss/i));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("auto-dismisses after 6000ms", () => {
    const onDismiss = vi.fn();
    render(<CartMigrationToast onDismiss={onDismiss} />);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(6000);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("clears the timer on unmount (no leak)", () => {
    const onDismiss = vi.fn();
    const { unmount } = render(<CartMigrationToast onDismiss={onDismiss} />);
    unmount();
    vi.advanceTimersByTime(6000);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
