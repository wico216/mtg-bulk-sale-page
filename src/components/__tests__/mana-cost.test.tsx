// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ManaCost } from "../mana-cost";

/**
 * The mana-font webfont composes the actual glyph via ::before content,
 * which jsdom/happy-dom doesn't render. So these tests only assert on
 * the class composition (`.ms .ms-{token} .ms-cost`) — which is the
 * load-bearing contract between this component and `mana-font`.
 */

function collectSymbolClasses(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("i.ms")).map((el) =>
    (el.className || "").trim(),
  );
}

describe("ManaCost", () => {
  it("renders nothing when cost is null (Scryfall did not resolve)", () => {
    const { container } = render(<ManaCost cost={null} />);
    expect(container.querySelectorAll("i.ms").length).toBe(0);
  });

  it("renders nothing when cost is undefined", () => {
    const { container } = render(<ManaCost cost={undefined} />);
    expect(container.querySelectorAll("i.ms").length).toBe(0);
  });

  it("renders nothing for an empty cost string (lands have no cost)", () => {
    const { container } = render(<ManaCost cost="" />);
    expect(container.querySelectorAll("i.ms").length).toBe(0);
  });

  it("renders nothing for whitespace-only cost (defensive)", () => {
    const { container } = render(<ManaCost cost="   " />);
    expect(container.querySelectorAll("i.ms").length).toBe(0);
  });

  it("parses a single colored mana token {R} into one badge", () => {
    const { container } = render(<ManaCost cost="{R}" />);
    const classes = collectSymbolClasses(container);
    expect(classes).toEqual(["ms ms-r ms-cost"]);
  });

  it("parses a generic + colored cost {1}{R} into two badges in order", () => {
    const { container } = render(<ManaCost cost="{1}{R}" />);
    const classes = collectSymbolClasses(container);
    expect(classes).toEqual(["ms ms-1 ms-cost", "ms ms-r ms-cost"]);
  });

  it("handles variable cost {X}", () => {
    const { container } = render(<ManaCost cost="{X}{W}" />);
    const classes = collectSymbolClasses(container);
    expect(classes).toEqual(["ms ms-x ms-cost", "ms ms-w ms-cost"]);
  });

  it("handles the 5-color Jodah cost {1}{W}{U}{B}{R}{G}", () => {
    const { container } = render(<ManaCost cost="{1}{W}{U}{B}{R}{G}" />);
    const classes = collectSymbolClasses(container);
    expect(classes).toEqual([
      "ms ms-1 ms-cost",
      "ms ms-w ms-cost",
      "ms ms-u ms-cost",
      "ms ms-b ms-cost",
      "ms ms-r ms-cost",
      "ms ms-g ms-cost",
    ]);
  });

  it("renders both faces of a DFC mana cost joined with //", () => {
    const { container } = render(<ManaCost cost="{1}{W} // {2}{U}" />);
    const classes = collectSymbolClasses(container);
    expect(classes).toEqual([
      "ms ms-1 ms-cost",
      "ms ms-w ms-cost",
      "ms ms-2 ms-cost",
      "ms ms-u ms-cost",
    ]);
    // The visible separator is rendered between the faces.
    expect(container.textContent).toContain("//");
  });

  it("normalises hybrid tokens like {W/U} by dropping the slash and lowercasing", () => {
    const { container } = render(<ManaCost cost="{W/U}" />);
    const classes = collectSymbolClasses(container);
    expect(classes).toEqual(["ms ms-wu ms-cost"]);
  });

  it("renames {T} to ms-tap (mana-font's class for the tap symbol)", () => {
    const { container } = render(<ManaCost cost="{T}" />);
    const classes = collectSymbolClasses(container);
    expect(classes).toEqual(["ms ms-tap ms-cost"]);
  });

  it("exposes the raw cost via aria-label for screen readers by default", () => {
    const { container } = render(<ManaCost cost="{1}{R}" />);
    const wrapper = container.querySelector("[aria-label]");
    expect(wrapper?.getAttribute("aria-label")).toBe("Mana cost {1}{R}");
  });

  it("honors a custom ariaLabel override", () => {
    const { container } = render(
      <ManaCost cost="{1}{R}" ariaLabel="Lightning Bolt cost" />,
    );
    expect(container.querySelector("[aria-label]")?.getAttribute("aria-label")).toBe(
      "Lightning Bolt cost",
    );
  });
});
