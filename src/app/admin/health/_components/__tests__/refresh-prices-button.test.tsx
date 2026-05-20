// @vitest-environment happy-dom
/**
 * Phase 23 Plan 23-01 Task 4 — RefreshPricesButton client component.
 *
 * Default-run: NOT env-gated and NOT skipped. Covers the seven D-03 UX
 * states (idle, refreshing, success+refresh, 409 inline error w/ 5s reset,
 * 5xx inline error w/ 5s reset, network-error inline error, re-click guard).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockRouterRefresh } = vi.hoisted(() => ({
  mockRouterRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

import { RefreshPricesButton } from "../refresh-prices-button";

function mockFetch(response: Partial<Response> | "reject") {
  if (response === "reject") {
    return vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network down"));
  }
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: async () => ({}),
    ...response,
  } as Response);
}

beforeEach(() => {
  mockRouterRefresh.mockReset();
  vi.useRealTimers();
});

afterEach(() => {
  // Restore any vi.spyOn(globalThis, "fetch") so test N+1 starts fresh.
  // Without this, the spies accumulate and earlier mocks leak into later
  // tests (their resolved values dequeue into later fetch calls and
  // throw off the call-count assertion in Case 7).
  vi.restoreAllMocks();
  cleanup();
});

describe("<RefreshPricesButton />", () => {
  it("Case 1: initial render shows 'Refresh now', enabled, no error alert", () => {
    render(<RefreshPricesButton />);
    const button = screen.getByRole("button", { name: "Refresh now" });
    expect(button).not.toBeDisabled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Case 2: click sets refreshing state and posts to the admin endpoint exactly once", async () => {
    const user = userEvent.setup();
    // Resolve only after we've observed the in-flight state.
    let resolveFetch!: (value: Response) => void;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
      );

    render(<RefreshPricesButton />);
    await user.click(screen.getByRole("button", { name: "Refresh now" }));

    const refreshing = screen.getByRole("button", { name: "Refreshing…" });
    expect(refreshing).toBeDisabled();
    expect(refreshing.getAttribute("aria-busy")).toBe("true");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith("/api/admin/prices/refresh", {
      method: "POST",
    });

    // Cleanup: resolve the in-flight fetch.
    await act(async () => {
      resolveFetch({ ok: true, status: 200, json: async () => ({}) } as Response);
    });
  });

  it("Case 3: 200 -> button returns to 'Refresh now' and router.refresh() is called once", async () => {
    const user = userEvent.setup();
    mockFetch({ ok: true, status: 200 });

    render(<RefreshPricesButton />);
    await user.click(screen.getByRole("button", { name: "Refresh now" }));

    expect(screen.getByRole("button", { name: "Refresh now" })).not.toBeDisabled();
    expect(mockRouterRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Case 4: 409 -> inline 'try again in a moment'; clears after 5s; router.refresh NOT called", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockFetch({ ok: false, status: 409 });

    render(<RefreshPricesButton />);
    await user.click(screen.getByRole("button", { name: "Refresh now" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Refresh in progress");
    expect(alert.textContent).toContain("try again in a moment");
    expect(mockRouterRefresh).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Case 5: 500 -> inline 'Refresh failed — check logs'; clears after 5s; router.refresh NOT called", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockFetch({ ok: false, status: 500 });

    render(<RefreshPricesButton />);
    await user.click(screen.getByRole("button", { name: "Refresh now" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Refresh failed");
    expect(alert.textContent).toContain("check logs");
    expect(mockRouterRefresh).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Case 6: network error (fetch rejects) -> inline 'check logs' message; router.refresh NOT called", async () => {
    const user = userEvent.setup();
    mockFetch("reject");

    render(<RefreshPricesButton />);
    await user.click(screen.getByRole("button", { name: "Refresh now" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("check logs");
    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it("Case 7: re-click while refreshing does NOT issue a second fetch", async () => {
    const user = userEvent.setup();
    let resolveFetch!: (value: Response) => void;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
      );

    render(<RefreshPricesButton />);
    const button = screen.getByRole("button", { name: "Refresh now" });
    await user.click(button);

    // The button is now disabled + showing "Refreshing…". The in-handler
    // `if (status.kind === "refreshing") return;` guard is the load-bearing
    // re-click protection; the `disabled` attribute is belt-and-suspenders.
    const refreshing = screen.getByRole("button", { name: "Refreshing…" });
    expect(refreshing).toBeDisabled();
    // userEvent.click on a disabled element throws ("...pointer-events: none
    // or disabled") — we catch and ignore. The contract under test is "no
    // additional fetch is issued", which is verified below regardless of
    // whether the click was dispatched at the DOM layer or rejected by
    // userEvent.
    await user.click(refreshing).catch(() => {
      /* expected when clicking a disabled button */
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch({ ok: true, status: 200, json: async () => ({}) } as Response);
    });
  });
});
