import { hasValidBuyUrl, type CatalogItem } from "./shop-gap";

export type ProductAction =
  | { kind: "retailer"; label: "Shop now"; href: string }
  | { kind: "sample"; label: "View Sample"; href: null };

function normalizeIdentityPart(value?: string | null): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function catalogIdentityKey(item: CatalogItem): string {
  if (item.external_id?.trim()) {
    return ["external", item.retailer, item.external_id].map(normalizeIdentityPart).join("|");
  }

  return [item.brand, item.name, item.category, item.color, item.condition]
    .map(normalizeIdentityPart)
    .join("|");
}

export function dedupeCatalog(items: CatalogItem[]): CatalogItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = catalogIdentityKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function productActionFor(item: CatalogItem): ProductAction {
  return hasValidBuyUrl(item)
    ? { kind: "retailer", label: "Shop now", href: item.buy_url as string }
    : { kind: "sample", label: "View Sample", href: null };
}
