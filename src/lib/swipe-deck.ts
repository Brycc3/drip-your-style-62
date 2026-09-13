/** The visible deck is filtered by signatures; removing a card is the advance. */
export function recordSeen(seen: ReadonlySet<string>, signature: string): Set<string> {
  return new Set([...seen, signature]);
}
export function undoSeen(seen: ReadonlySet<string>, signature: string): Set<string> {
  const next = new Set(seen);
  next.delete(signature);
  return next;
}
