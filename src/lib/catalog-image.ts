export type CatalogFallback = {
  from: string;
  to: string;
  icon: string;
  label: string;
};

const UNRELIABLE_IMAGE_HOSTS = new Set([
  "loremflickr.com",
  "www.loremflickr.com",
  "picsum.photos",
  "source.unsplash.com",
]);

function normalizedCategory(category?: string | null): string {
  return (category ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function stableCatalogAssetFor(category?: string | null): string | null {
  const c = normalizedCategory(category);
  if (c === "hoodie") return "/catalog/hoodie-black.jpg";
  if (["tee", "top", "shirt", "polo"].includes(c)) return "/catalog/tee-heavyweight-black.jpg";
  if (c === "cargos") return "/catalog/cargos-olive.jpg";
  if (c === "joggers") return "/catalog/joggers-black.jpg";
  if (["bottom", "trousers", "pants", "denim", "shorts"].includes(c))
    return "/catalog/trousers-charcoal.jpg";
  if (["outerwear", "bomber", "chore", "jacket", "coat"].includes(c))
    return "/catalog/bomber-black.jpg";
  if (c === "jordan") return "/catalog/sneaker-jordan-black.jpg";
  if (c === "new_balance") return "/catalog/sneaker-nb-grey.jpg";
  if (c === "loafer") return "/catalog/loafer-brown.jpg";
  if (["shoes", "sneaker", "vomero", "runner", "boot"].includes(c))
    return "/catalog/sneaker-runner-black.jpg";
  if (["bag", "bags", "tote", "crossbody"].includes(c)) return "/catalog/bag-sling-black.jpg";
  if (c === "beanie") return "/catalog/beanie-black.jpg";
  if (["fragrance", "scent", "perfume", "cologne", "edt", "decant"].includes(c))
    return "/catalog/fragrance-fresh.jpg";
  if (["edp", "parfum"].includes(c)) return "/catalog/fragrance-amber.jpg";
  return null;
}

function isStableSupabaseAsset(src: string): boolean {
  try {
    const url = new URL(src);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".supabase.co") &&
      url.pathname.includes("/storage/v1/object/")
    );
  } catch {
    return false;
  }
}

function isUnreliableRemoteImage(src: string): boolean {
  try {
    return UNRELIABLE_IMAGE_HOSTS.has(new URL(src).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function resolveCatalogImageSource({
  src,
  category,
  isDemo,
}: {
  src?: string | null;
  category?: string | null;
  isDemo?: boolean;
}): string | null {
  const candidate = src?.trim() ?? "";
  const fallbackAsset = stableCatalogAssetFor(category);
  if (!candidate || isUnreliableRemoteImage(candidate)) return fallbackAsset;
  if (candidate.startsWith("/catalog/") || isStableSupabaseAsset(candidate)) return candidate;
  if (isDemo) return fallbackAsset;
  return candidate;
}

export function catalogImagePresentation(
  resolvedSource: string | null,
  failed: boolean,
): "image" | "fallback" {
  return resolvedSource && !failed ? "image" : "fallback";
}

export function catalogFallbackFor(category?: string | null): CatalogFallback {
  const c = normalizedCategory(category);
  if (/(tee|top|shirt|polo|hoodie)/.test(c))
    return { from: "#1a2418", to: "#0a0f08", icon: "👕", label: "TOP" };
  if (/(bottom|trouser|cargo|jogger|short|denim|pants)/.test(c))
    return { from: "#20211a", to: "#0d0e08", icon: "👖", label: "BOTTOM" };
  if (/(outerwear|bomber|chore|jacket|coat)/.test(c))
    return { from: "#221a1a", to: "#0e0808", icon: "🧥", label: "OUTER" };
  if (/(shoe|sneaker|jordan|vomero|new_?balance|runner|loafer|boot)/.test(c))
    return { from: "#1a1e24", to: "#08090d", icon: "👟", label: "SHOES" };
  if (/earring/.test(c)) return { from: "#241c22", to: "#0d080b", icon: "💎", label: "EARRINGS" };
  if (/(prescription|eyeglass|glasses)/.test(c))
    return { from: "#182126", to: "#070b0d", icon: "👓", label: "PRESCRIPTION" };
  if (/sunglass|shades/.test(c))
    return { from: "#12161a", to: "#050708", icon: "🕶️", label: "SUNGLASSES" };
  if (/necklace|pendant/.test(c))
    return { from: "#231d19", to: "#0d0907", icon: "📿", label: "NECKLACE" };
  if (/chain/.test(c)) return { from: "#202024", to: "#09090c", icon: "⛓️", label: "CHAIN" };
  if (/bracelet|bangle/.test(c))
    return { from: "#211b23", to: "#0b080d", icon: "◯", label: "BRACELET" };
  if (/ring/.test(c)) return { from: "#1f1a24", to: "#0a080d", icon: "💍", label: "RING" };
  if (/grill/.test(c)) return { from: "#242319", to: "#0d0c06", icon: "✦", label: "GRILL" };
  if (/(hat|cap|beanie)/.test(c))
    return { from: "#241f18", to: "#0d0a06", icon: "🧢", label: "HEADWEAR" };
  if (/belt/.test(c)) return { from: "#1c1710", to: "#0a0806", icon: "➰", label: "BELT" };
  if (/bag|tote|crossbody/.test(c))
    return { from: "#181a20", to: "#07080b", icon: "👜", label: "BAG" };
  if (/watch|timepiece/.test(c))
    return { from: "#161a1f", to: "#06080b", icon: "⌚", label: "WATCH" };
  if (/sock/.test(c)) return { from: "#181c1a", to: "#080a08", icon: "🧦", label: "SOCKS" };
  if (/scarf/.test(c)) return { from: "#1e1a1a", to: "#0a0808", icon: "🧣", label: "SCARF" };
  if (/wallet|cardholder/.test(c))
    return { from: "#1a1612", to: "#080605", icon: "👛", label: "WALLET" };
  if (/jewel/.test(c)) return { from: "#1f1a24", to: "#0a080d", icon: "💎", label: "JEWELRY" };
  if (/(fragrance|scent|perfume|cologne|edt|edp|decant|parfum)/.test(c))
    return { from: "#241d16", to: "#0d0906", icon: "🧴", label: "FRAGRANCE" };
  return { from: "#1a1d20", to: "#08090b", icon: "✦", label: "ACCESSORY" };
}
