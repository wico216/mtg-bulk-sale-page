// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Header from "../header";
import { useCartStore } from "@/lib/store/cart-store";

describe("Header logo link", () => {
  const originalReload = window.location.reload;

  beforeEach(() => {
    useCartStore.setState({ items: new Map(), version: "1.3" });
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    window.location.reload = originalReload;
    vi.restoreAllMocks();
  });

  it("refreshes the storefront when the logo is clicked on the home page", async () => {
    const reload = vi.fn();
    window.location.reload = reload;

    render(<Header />);

    await userEvent.click(
      screen.getByRole("link", { name: /wiko's spellbook home/i }),
    );

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
