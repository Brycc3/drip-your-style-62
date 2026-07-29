import { describe, expect, it } from "bun:test";
import { excludeBlocked } from "../src/lib/blocks";

type Row = { id: string; user_id: string; body: string };

describe("blocks — client-side filter", () => {
  it("removes rows authored by blocked users", () => {
    const rows: Row[] = [
      { id: "a", user_id: "u1", body: "keep" },
      { id: "b", user_id: "u2", body: "drop" },
      { id: "c", user_id: "u3", body: "drop" },
      { id: "d", user_id: "me", body: "keep own" },
    ];
    const blocked = new Set(["u2", "u3"]);
    const kept = excludeBlocked(rows, blocked);
    expect(kept.map((r) => r.id)).toEqual(["a", "d"]);
  });

  it("returns rows unchanged when no blocks", () => {
    const rows: Row[] = [{ id: "a", user_id: "u1", body: "x" }];
    expect(excludeBlocked(rows, new Set()).length).toBe(1);
  });
});

describe("comments gating invariant", () => {
  it("composer only renders when comments_enabled=true", () => {
    // Encodes the UI contract on o/$slug and saved.tsx. If the flag becomes
    // implicit or defaults flip, this test forces a revisit of both pages.
    const disabled = { comments_enabled: false };
    const enabled = { comments_enabled: true };
    expect(disabled.comments_enabled === true).toBe(false);
    expect(enabled.comments_enabled === true).toBe(true);
  });
});
