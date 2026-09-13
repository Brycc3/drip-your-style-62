const TRACKING_PARAMETER_NAMES = new Set(["ref", "affiliate", "aff"]);

function encodeQueryComponent(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Canonical product identity URL shared conceptually with
 * public.catalog_canonical_product_url in the Phase 4A migration.
 *
 * The identity keeps path and meaningful query data case-sensitive. It removes
 * only fragments and the documented tracking keys (utm_*, ref, affiliate,
 * aff), then sorts and RFC 3986-encodes the remaining key/value pairs.
 */
export function canonicalizeProductUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return "";
  }
  if (url.protocol !== "https:" || url.username || url.password) return "";

  const query = [...url.searchParams.entries()]
    .filter(([key]) => {
      const normalizedKey = key.toLowerCase();
      return !normalizedKey.startsWith("utm_") && !TRACKING_PARAMETER_NAMES.has(normalizedKey);
    })
    .map(
      ([key, queryValue]) => [encodeQueryComponent(key), encodeQueryComponent(queryValue)] as const,
    )
    .sort(
      ([leftKey, leftValue], [rightKey, rightValue]) =>
        compareText(leftKey, rightKey) || compareText(leftValue, rightValue),
    );

  const path = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
  const queryString = query.map(([key, queryValue]) => `${key}=${queryValue}`).join("&");
  return `https://${url.host.toLowerCase()}${path}${queryString ? `?${queryString}` : ""}`;
}
