import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  authorizeAdminCredentials,
  constantTimeEqualString,
} from "@/lib/auth/credentials";

describe("constantTimeEqualString", () => {
  it("returns true for identical strings and false for different strings", () => {
    expect(constantTimeEqualString("secret", "secret")).toBe(true);
    expect(constantTimeEqualString("secret", "different")).toBe(false);
  });
});

describe("authorizeAdminCredentials", () => {
  beforeEach(() => {
    process.env.ADMIN_USERNAME = "seller";
    process.env.ADMIN_PASSWORD = "correct-password";
    process.env.ADMIN_EMAIL = "admin@example.com";
  });

  it("returns admin user when username and password match env", async () => {
    await expect(
      authorizeAdminCredentials({
        username: "seller",
        password: "correct-password",
      }),
    ).resolves.toEqual({
      id: "admin",
      name: "seller",
      email: "admin@example.com",
    });
  });

  it("returns null for wrong username or password", async () => {
    await expect(
      authorizeAdminCredentials({ username: "wrong", password: "correct-password" }),
    ).resolves.toBeNull();
    await expect(
      authorizeAdminCredentials({ username: "seller", password: "wrong" }),
    ).resolves.toBeNull();
  });

  it("returns null for missing or non-string inputs", async () => {
    await expect(authorizeAdminCredentials({})).resolves.toBeNull();
    await expect(
      authorizeAdminCredentials({ username: "seller", password: 123 }),
    ).resolves.toBeNull();
  });

  it("returns null when credential env is incomplete", async () => {
    delete process.env.ADMIN_PASSWORD;

    await expect(
      authorizeAdminCredentials({ username: "seller", password: "correct-password" }),
    ).resolves.toBeNull();
  });
});
