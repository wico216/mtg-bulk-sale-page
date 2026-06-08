import { describe, expect, it } from "vitest";
import { isPrivateWBinder, isPublicSaleBinder } from "../binder-scope";

describe("binder scope", () => {
  it("classifies normalized W folders as private personal binders", () => {
    expect(isPrivateWBinder("w01")).toBe(true);
    expect(isPrivateWBinder("W02")).toBe(true);
    expect(isPrivateWBinder(" w personal ")).toBe(true);
  });

  it("keeps non-W binders in the public sale scope", () => {
    expect(isPublicSaleBinder("a32")).toBe(true);
    expect(isPublicSaleBinder("trade-box")).toBe(true);
    expect(isPublicSaleBinder("unsorted")).toBe(true);
    expect(isPublicSaleBinder("w01")).toBe(false);
  });
});
