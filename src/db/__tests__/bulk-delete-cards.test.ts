import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const deleteBuilder = {
  where: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([
    { id: "lea-232-normal-near_mint" },
    { id: "mh2-45-normal-lightly_played" },
  ]),
};

vi.mock("@/db/client", () => ({
  db: {
    delete: vi.fn(() => deleteBuilder),
  },
}));

import { db } from "@/db/client";
import { deleteCardsByIds } from "../queries";

beforeEach(() => {
  vi.mocked(db.delete).mockClear();
  deleteBuilder.where.mockClear();
  deleteBuilder.returning.mockClear();
  deleteBuilder.returning.mockResolvedValue([
    { id: "lea-232-normal-near_mint" },
    { id: "mh2-45-normal-lightly_played" },
  ]);
});

describe("deleteCardsByIds", () => {
  it("deletes selected card IDs with one statement and returns actual deleted IDs", async () => {
    const result = await deleteCardsByIds([
      "lea-232-normal-near_mint",
      "mh2-45-normal-lightly_played",
      "lea-232-normal-near_mint",
    ]);

    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(deleteBuilder.where).toHaveBeenCalledTimes(1);
    expect(deleteBuilder.returning).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      deleted: 2,
      ids: ["lea-232-normal-near_mint", "mh2-45-normal-lightly_played"],
    });
  });

  it("returns without touching the database for empty input", async () => {
    const result = await deleteCardsByIds([]);

    expect(result).toEqual({ deleted: 0, ids: [] });
    expect(db.delete).not.toHaveBeenCalled();
  });
});
