import { vi, describe, it, expect, beforeEach } from "vitest";

// Use vi.hoisted() to create mock functions available during vi.mock factory execution
const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}));

// Mock "server-only" to prevent it from throwing in test environment
vi.mock("server-only", () => ({}));

// Mock @/auth to control auth() return value
vi.mock("@/auth", () => ({
  auth: mockAuth,
}));

import { isAdminEmail } from "@/lib/auth/helpers";
import { requireAdmin } from "@/lib/auth/admin-check";

describe("isAdminEmail", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAIL = "admin@example.com";
  });

  it("returns true when email matches ADMIN_EMAIL env var", () => {
    expect(isAdminEmail("admin@example.com")).toBe(true);
  });

  it("returns false when email does not match ADMIN_EMAIL", () => {
    expect(isAdminEmail("other@example.com")).toBe(false);
  });

  it("returns false when email is null", () => {
    expect(isAdminEmail(null)).toBe(false);
  });

  it("returns false when email is undefined", () => {
    expect(isAdminEmail(undefined)).toBe(false);
  });
});

describe("requireAdmin", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    mockAuth.mockReset();
  });

  it("returns Response with status 401 and { error: 'Unauthorized' } when auth() returns null", async () => {
    mockAuth.mockResolvedValue(null);

    const result = await requireAdmin();
    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns Response with status 403 and { error: 'Forbidden' } when session email !== ADMIN_EMAIL", async () => {
    mockAuth.mockResolvedValue({
      user: { email: "other@example.com", name: "Other User" },
    });

    const result = await requireAdmin();
    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toEqual({ error: "Forbidden" });
  });

  it("returns AdminSession object when session email === ADMIN_EMAIL", async () => {
    mockAuth.mockResolvedValue({
      user: {
        email: "admin@example.com",
        name: "Admin User",
        image: "https://example.com/photo.jpg",
      },
    });

    const result = await requireAdmin();
    expect(result).not.toBeInstanceOf(Response);
    const session = result as {
      user: { email: string; name: string; image?: string };
    };
    expect(session.user.email).toBe("admin@example.com");
    expect(session.user.name).toBe("Admin User");
  });

  it("returns 401 when session exists but user.email is undefined", async () => {
    mockAuth.mockResolvedValue({
      user: { name: "No Email User" },
    });

    const result = await requireAdmin();
    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });
});
