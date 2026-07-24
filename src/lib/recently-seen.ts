// LocalStorage-backed ring buffer of "recently seen" IDs per user + kind.
// Used to diversify Shop refresh, fragrance pairing, and swipe deck.

const MAX = 40;

function key(kind: string, uid?: string | null) {
  return `drip.seen.${kind}.${uid ?? "anon"}`;
}

export function getRecentlySeen(kind: string, uid?: string | null): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key(kind, uid));
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function pushRecentlySeen(
  kind: string,
  ids: string[],
  uid?: string | null,
): Set<string> {
  if (typeof window === "undefined") return new Set(ids);
  const existing = getRecentlySeen(kind, uid);
  for (const id of ids) existing.add(id);
  const trimmed = Array.from(existing).slice(-MAX);
  try {
    window.localStorage.setItem(key(kind, uid), JSON.stringify(trimmed));
  } catch { /* ignore quota */ }
  return new Set(trimmed);
}

export function clearRecentlySeen(kind: string, uid?: string | null) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(kind, uid));
  } catch { /* ignore */ }
}
