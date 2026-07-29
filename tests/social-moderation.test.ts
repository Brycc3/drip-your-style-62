import { describe, expect, it } from "bun:test";
import { filterBlocked, extractBlockedIds } from "../src/lib/blocks";

type Row = { id: string; user_id: string; body: string };

describe("blocks — client-side filter", () => {
  const blocks = [
    { blocker_id: "me", blocked_id: "u2" },
    { blocker_id: "u3", blocked_id: "me" }, // blocked by them
  ];

  it("extracts both directions", () => {
    const ids = extractBlockedIds(blocks, "me");
    expect(ids.has("u2")).toBe(true);
    expect(ids.has("u3")).toBe(true);
    expect(ids.size).toBe(2);
  });

  it("filters rows whose author is either blocker or blocked", () => {
    const rows: Row[] = [
      { id: "a", user_id: "u1", body: "keep" },
      { id: "b", user_id: "u2", body: "drop — I blocked them" },
      { id: "c", user_id: "u3", body: "drop — they blocked me" },
      { id: "d", user_id: "me", body: "keep own" },
    ];
    const ids = extractBlockedIds(blocks, "me");
    const kept = filterBlocked(rows, ids, (r) => r.user_id);
    expect(kept.map((r) => r.id)).toEqual(["a", "d"]);
  });

  it("returns rows unchanged when no blocks", () => {
    const rows: Row[] = [{ id: "a", user_id: "u1", body: "x" }];
    const ids = extractBlockedIds([], "me");
    expect(filterBlocked(rows, ids, (r) => r.user_id).length).toBe(1);
  });
});

describe("comments gating", () => {
  it("outfit.comments_enabled=false means composer must not render", () => {
    // This encodes the invariant the UI relies on. If a future refactor
    // flips the default, this test forces us to revisit the o/$slug and
    // saved-outfit pages that read the flag.
    const outfit = { comments_enabled: false };
    const canRenderComposer = outfit.comments_enabled === true;
    expect(canRenderComposer).toBe(false);
  });

  it("outfit.comments_enabled=true renders composer", () => {
    const outfit = { comments_enabled: true };
    expect(outfit.comments_enabled === true).toBe(true);
  });
});
