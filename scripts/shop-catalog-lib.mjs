import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MANIFEST_PATH = path.join(PROJECT_ROOT, "catalog", "demo-products.json");
export const ASSET_DIRECTORY = path.join(PROJECT_ROOT, "public", "catalog", "phase-2");
export const MIGRATION_PATH = path.join(
  PROJECT_ROOT,
  "supabase",
  "migrations",
  "20260728110000_shop_phase_2_curated_catalog.sql",
);

const COLOR_PALETTES = {
  black: ["#171717", "#a3a3a3"],
  bone: ["#e7e0d0", "#6b665c"],
  moss: ["#62724a", "#d2e5a8"],
  cobalt: ["#2157d5", "#b9d0ff"],
  graphite: ["#4b5056", "#c4c8cc"],
  olive: ["#6d7143", "#d7d4a1"],
  indigo: ["#273d68", "#9bb2dc"],
  sand: ["#cbb991", "#685e49"],
  clay: ["#a96147", "#f0c1aa"],
  "fog gray": ["#aeb5bc", "#f2f5f7"],
  "ash gray": ["#7f8589", "#e4e7e9"],
  "black and lime": ["#171717", "#c7ff32"],
  oxblood: ["#681f2a", "#e7a2ab"],
  taupe: ["#8e7d6e", "#e1d4c7"],
  silver: ["#b8c0c8", "#f6f8fa"],
  "gold and amber": ["#d49a2a", "#ffdf84"],
  "honey tortoise": ["#a86621", "#f4cb72"],
  smoke: ["#4a5057", "#a7b0bb"],
  amber: ["#ba6d24", "#ffcb72"],
  rust: ["#a44727", "#efb18f"],
  gunmetal: ["#4c555d", "#b6c0c7"],
  navy: ["#243756", "#9fb2d1"],
  khaki: ["#a4936d", "#e7ddbf"],
  espresso: ["#4b2d23", "#c39a7f"],
  "chalk white": ["#e7e7df", "#74746d"],
  "cobalt gradient": ["#1b42bc", "#31b7d5"],
  "clay and cream": ["#a45f48", "#f2dfc9"],
  "aqua blue": ["#45a9c0", "#c9f2f6"],
  green: ["#365e46", "#b9d9ad"],
  burgundy: ["#6c263d", "#ddb3be"],
  gold: ["#c9962c", "#ffe39a"],
  "silver and cream": ["#aeb7c2", "#f1e4c7"],
};

const ACCESSORY_CATEGORIES = new Set([
  "earrings",
  "glasses",
  "sunglasses",
  "chain",
  "necklace",
  "bracelet",
  "ring",
  "watch",
  "cap",
  "beanie",
  "hat",
  "belt",
  "bag",
  "socks",
  "scarf",
  "wallet",
  "grill",
]);

const FRAGRANCE_CATEGORIES = new Set(["edt", "edp", "parfum"]);
const TOP_CATEGORIES = new Set(["tee", "polo", "hoodie"]);
const BOTTOM_CATEGORIES = new Set(["trousers", "cargos", "denim", "joggers"]);
const OUTERWEAR_CATEGORIES = new Set(["bomber", "jacket", "coat"]);
const SHOE_CATEGORIES = new Set(["sneaker", "runner", "loafer", "boot"]);

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function paletteFor(color) {
  return COLOR_PALETTES[color.toLowerCase()] ?? ["#6f7680", "#d7dde4"];
}

function shirtShape(product, primary, accent) {
  const isHoodie = product.category === "hoodie";
  const isPolo = product.category === "polo";
  return `
    <path d="M274 274 352 234h96l78 40 82 124-86 48-38-62v228H316V384l-38 62-86-48 82-124Z"
      fill="${primary}" stroke="#f7f7f2" stroke-width="10" stroke-linejoin="round"/>
    <path d="M354 238q46 68 92 0" fill="none" stroke="${accent}" stroke-width="12" stroke-linecap="round"/>
    ${
      isHoodie
        ? `<path d="M349 245q51-96 102 0l-18 76h-66l-18-76Z" fill="${accent}" fill-opacity=".28" stroke="#f7f7f2" stroke-width="8"/>
           <path d="M400 316v210M340 514h120l22 56H318l22-56Z" fill="none" stroke="${accent}" stroke-width="9"/>`
        : ""
    }
    ${
      isPolo
        ? `<path d="m350 239 50 69-48 34-24-92m122-11-50 69 48 34 24-92" fill="${accent}" stroke="#f7f7f2" stroke-width="7"/>
           <circle cx="400" cy="350" r="7" fill="${accent}"/><circle cx="400" cy="382" r="7" fill="${accent}"/>`
        : ""
    }`;
}

function bottomShape(product, primary, accent) {
  const utility = product.category === "cargos";
  const sporty = product.category === "joggers";
  return `
    <path d="M302 215h196l28 389-105 8-21-244-21 244-105-8 28-389Z"
      fill="${primary}" stroke="#f7f7f2" stroke-width="10" stroke-linejoin="round"/>
    <path d="M305 264h190M400 220v148" fill="none" stroke="${accent}" stroke-width="9"/>
    <path d="M330 282q18 28 48 32M470 282q-18 28-48 32" fill="none" stroke="${accent}" stroke-width="8" stroke-linecap="round"/>
    ${
      utility
        ? `<rect x="286" y="360" width="92" height="104" rx="12" fill="${accent}" fill-opacity=".35" stroke="${accent}" stroke-width="8"/>
           <rect x="422" y="360" width="92" height="104" rx="12" fill="${accent}" fill-opacity=".35" stroke="${accent}" stroke-width="8"/>`
        : ""
    }
    ${
      sporty
        ? `<path d="M282 584h95M423 584h95" stroke="${accent}" stroke-width="16" stroke-linecap="round"/>`
        : ""
    }`;
}

function outerwearShape(product, primary, accent) {
  const long = product.category === "coat";
  const hem = long ? 646 : 584;
  return `
    <path d="M274 270 348 224h104l74 46 77 126-82 48-38-65v${hem - 224}H317V379l-38 65-82-48 77-126Z"
      fill="${primary}" stroke="#f7f7f2" stroke-width="10" stroke-linejoin="round"/>
    <path d="m354 228 46 96 46-96M400 324v${hem - 324}" fill="none" stroke="${accent}" stroke-width="10"/>
    <path d="M334 402h58v78h-58zm74 0h58v78h-58z" fill="${accent}" fill-opacity=".25" stroke="${accent}" stroke-width="7"/>
    <path d="M318 ${hem}h164" stroke="#f7f7f2" stroke-width="11" stroke-linecap="round"/>`;
}

function shoeShape(product, primary, accent) {
  const boot = product.category === "boot";
  const loafer = product.category === "loafer";
  return `
    ${
      boot
        ? `<path d="M282 220h181l15 224 134 64q30 15 16 74H188q-8-72 46-88l70-24-22-250Z" fill="${primary}" stroke="#f7f7f2" stroke-width="11"/>`
        : `<path d="M176 442q94-8 146-92l46-76h92l44 92q43 44 116 80 30 15 20 92H166q-12-58 10-96Z" fill="${primary}" stroke="#f7f7f2" stroke-width="11"/>`
    }
    <path d="M182 526h438" stroke="${accent}" stroke-width="19" stroke-linecap="round"/>
    ${
      loafer
        ? `<path d="M320 365h157l-22 75H300l20-75Z" fill="${accent}" fill-opacity=".42" stroke="${accent}" stroke-width="8"/>`
        : `<path d="m322 362 132 1M307 398h168M290 435h205" stroke="${accent}" stroke-width="10" stroke-linecap="round"/>`
    }`;
}

function eyewearShape(product, primary, accent) {
  const dark = product.category === "sunglasses";
  return `
    <path d="M146 292q100-55 221-3l33 30 33-30q121-52 221 3" fill="none" stroke="${accent}" stroke-width="13" stroke-linecap="round"/>
    <path d="M160 306q102-44 205 0l-12 139q-86 78-172 0l-21-139Zm275 0q102-44 205 0l-21 139q-86 78-172 0l-12-139Z"
      fill="${dark ? primary : "#dceeff"}" fill-opacity="${dark ? ".9" : ".42"}" stroke="#f7f7f2" stroke-width="11"/>
    <path d="M359 326q41-31 82 0" fill="none" stroke="${accent}" stroke-width="13" stroke-linecap="round"/>`;
}

function jewelryShape(product, primary, accent) {
  if (product.category === "earrings") {
    const drops = /drop/i.test(product.name);
    return drops
      ? `<path d="M286 230v170m228-170v170" stroke="${accent}" stroke-width="13"/>
         <path d="M286 380c-90 98-73 188 0 188s90-90 0-188Zm228 0c-90 98-73 188 0 188s90-90 0-188Z" fill="${primary}" stroke="#f7f7f2" stroke-width="10"/>`
      : `<circle cx="286" cy="390" r="132" fill="none" stroke="${primary}" stroke-width="42"/><circle cx="514" cy="390" r="132" fill="none" stroke="${accent}" stroke-width="42"/>`;
  }
  if (product.category === "ring") {
    return `<ellipse cx="327" cy="405" rx="126" ry="170" fill="none" stroke="${primary}" stroke-width="48"/>
      <ellipse cx="473" cy="405" rx="126" ry="170" fill="none" stroke="${accent}" stroke-width="48"/>
      <path d="m400 178 38 58-38 58-38-58 38-58Z" fill="#f7f7f2" stroke="${accent}" stroke-width="9"/>`;
  }
  if (product.category === "bracelet") {
    return `<ellipse cx="400" cy="398" rx="230" ry="160" fill="none" stroke="${primary}" stroke-width="52" stroke-dasharray="38 10"/>
      <circle cx="628" cy="398" r="36" fill="${accent}" stroke="#f7f7f2" stroke-width="9"/>`;
  }
  const pendant = /pendant/i.test(product.name);
  return `<path d="M178 250q40 348 222 348t222-348" fill="none" stroke="#f7f7f2" stroke-opacity=".58" stroke-width="${product.category === "chain" ? 38 : 27}" stroke-dasharray="${product.category === "chain" ? "22 9" : "none"}" stroke-linecap="round"/>
    <path d="M178 250q40 348 222 348t222-348" fill="none" stroke="${primary}" stroke-width="${product.category === "chain" ? 30 : 18}" stroke-dasharray="${product.category === "chain" ? "22 9" : "none"}" stroke-linecap="round"/>
    ${
      pendant
        ? `<path d="m400 442 62 64-62 64-62-64 62-64Z" fill="${accent}" stroke="#f7f7f2" stroke-width="9"/>`
        : `<circle cx="400" cy="586" r="30" fill="${accent}" stroke="#f7f7f2" stroke-width="9"/>`
    }`;
}

function watchShape(primary, accent) {
  return `
    <path d="M346 142h108l26 158-30 38H350l-30-38 26-158Zm4 320h100l30 38-26 158H346l-26-158 30-38Z" fill="${primary}" stroke="#f7f7f2" stroke-width="10"/>
    <rect x="284" y="272" width="232" height="252" rx="72" fill="${accent}" stroke="#f7f7f2" stroke-width="12"/>
    <circle cx="400" cy="398" r="86" fill="#17191c" stroke="${primary}" stroke-width="10"/>
    <path d="M400 330v74l54 36" fill="none" stroke="#f7f7f2" stroke-width="12" stroke-linecap="round"/>`;
}

function headwearShape(product, primary, accent) {
  if (product.category === "beanie") {
    return `<path d="M236 468q0-260 164-260t164 260H236Z" fill="${primary}" stroke="#f7f7f2" stroke-width="11"/>
      <rect x="218" y="430" width="364" height="104" rx="28" fill="${accent}" stroke="#f7f7f2" stroke-width="11"/>
      <path d="M310 236q90 70 180 0" fill="none" stroke="${accent}" stroke-width="10"/>`;
  }
  if (product.category === "cap") {
    return `<path d="M220 438q18-228 206-228 139 0 166 204-232 15-372 24Z" fill="${primary}" stroke="#f7f7f2" stroke-width="11"/>
      <path d="M392 418q208-18 240 54-181 81-322-14l82-40Z" fill="${accent}" stroke="#f7f7f2" stroke-width="11"/>`;
  }
  return `<path d="M236 424q20-220 164-220t164 220H236Z" fill="${primary}" stroke="#f7f7f2" stroke-width="11"/>
    <ellipse cx="400" cy="470" rx="250" ry="70" fill="${accent}" stroke="#f7f7f2" stroke-width="11"/>
    <path d="M250 405h300" stroke="${accent}" stroke-width="18"/>`;
}

function beltShape(primary, accent) {
  return `
    <path d="M120 340h560v126H120z" fill="${primary}" stroke="#f7f7f2" stroke-width="11"/>
    <rect x="494" y="304" width="172" height="198" rx="22" fill="#17191c" stroke="${accent}" stroke-width="28"/>
    <path d="M494 403h-66" stroke="${accent}" stroke-width="18"/>
    <circle cx="218" cy="403" r="8" fill="${accent}"/><circle cx="264" cy="403" r="8" fill="${accent}"/><circle cx="310" cy="403" r="8" fill="${accent}"/>`;
}

function bagShape(product, primary, accent) {
  const backpack = /backpack/i.test(product.name);
  const sling = /sling/i.test(product.name);
  if (backpack) {
    return `<path d="M244 330q0-116 156-116t156 116v274H244V330Z" fill="${primary}" stroke="#f7f7f2" stroke-width="11"/>
      <path d="M322 250q13-90 78-90t78 90M298 384h204v150H298z" fill="${accent}" fill-opacity=".35" stroke="${accent}" stroke-width="11"/>`;
  }
  if (sling) {
    return `<path d="M186 306q234-156 428 72" fill="none" stroke="${accent}" stroke-width="28"/>
      <path d="M218 330q176-74 360 20l-30 222q-166 79-330-16V330Z" fill="${primary}" stroke="#f7f7f2" stroke-width="11"/>
      <path d="M246 400h292" stroke="${accent}" stroke-width="12"/>`;
  }
  return `<path d="M202 326h396l40 284H162l40-284Z" fill="${primary}" stroke="#f7f7f2" stroke-width="11"/>
    <path d="M288 350q0-150 112-150t112 150" fill="none" stroke="${accent}" stroke-width="28"/>
    <path d="M224 432h352" stroke="${accent}" stroke-width="11"/>`;
}

function smallAccessoryShape(product, primary, accent) {
  if (product.category === "socks") {
    return `<path d="M226 190h156v260q-7 116-170 160l-62-116 120-76-44-228Z" fill="${primary}" stroke="#f7f7f2" stroke-width="11"/>
      <path d="M418 190h156v260q-7 116-170 160l-62-116 120-76-44-228Z" fill="${accent}" stroke="#f7f7f2" stroke-width="11"/>
      <path d="M226 268h156m36 0h156" stroke="#f7f7f2" stroke-width="15"/>`;
  }
  if (product.category === "scarf") {
    return `<path d="M284 178h232l-46 448-70-65-70 65-46-448Z" fill="${primary}" stroke="#f7f7f2" stroke-width="11"/>
      <path d="M308 254h184M296 340h196M286 426h196" stroke="${accent}" stroke-width="14"/>
      <path d="m312 618-16 50m62-56-8 56m138-50 16 50m-62-56 8 56" stroke="#f7f7f2" stroke-width="8"/>`;
  }
  if (product.category === "wallet") {
    return `<rect x="174" y="258" width="452" height="294" rx="45" fill="${primary}" stroke="#f7f7f2" stroke-width="11"/>
      <path d="M180 344h440" stroke="${accent}" stroke-width="12"/>
      <rect x="398" y="376" width="228" height="102" rx="26" fill="${accent}" stroke="#f7f7f2" stroke-width="9"/>
      <circle cx="454" cy="427" r="12" fill="#f7f7f2"/>`;
  }
  return `<path d="M170 350q230-170 460 0v112q-230 170-460 0V350Z" fill="${primary}" stroke="#f7f7f2" stroke-width="11"/>
    <path d="M210 368q190 114 380 0" fill="none" stroke="${accent}" stroke-width="22" stroke-dasharray="38 10"/>
    <path d="M224 444q176 80 352 0" fill="none" stroke="#f7f7f2" stroke-width="11"/>`;
}

function fragranceShape(product, primary, accent) {
  const tall = product.category === "parfum";
  return `
    <path d="M330 176h140v90H330z" fill="${accent}" stroke="#f7f7f2" stroke-width="10"/>
    <path d="M352 126h96v62h-96z" fill="#17191c" stroke="${accent}" stroke-width="10"/>
    <rect x="${tall ? 270 : 232}" y="258" width="${tall ? 260 : 336}" height="${tall ? 370 : 332}" rx="${tall ? 42 : 68}" fill="${primary}" fill-opacity=".85" stroke="#f7f7f2" stroke-width="12"/>
    <rect x="${tall ? 308 : 280}" y="352" width="${tall ? 184 : 240}" height="116" rx="16" fill="#17191c" fill-opacity=".72" stroke="${accent}" stroke-width="8"/>
    <circle cx="400" cy="410" r="28" fill="${accent}" fill-opacity=".8"/>
    <path d="M322 520q78 42 156 0" fill="none" stroke="${accent}" stroke-width="9"/>`;
}

function productShape(product, primary, accent) {
  if (TOP_CATEGORIES.has(product.category)) return shirtShape(product, primary, accent);
  if (BOTTOM_CATEGORIES.has(product.category)) return bottomShape(product, primary, accent);
  if (OUTERWEAR_CATEGORIES.has(product.category)) return outerwearShape(product, primary, accent);
  if (SHOE_CATEGORIES.has(product.category)) return shoeShape(product, primary, accent);
  if (["glasses", "sunglasses"].includes(product.category))
    return eyewearShape(product, primary, accent);
  if (["earrings", "chain", "necklace", "bracelet", "ring"].includes(product.category))
    return jewelryShape(product, primary, accent);
  if (product.category === "watch") return watchShape(primary, accent);
  if (["cap", "beanie", "hat"].includes(product.category))
    return headwearShape(product, primary, accent);
  if (product.category === "belt") return beltShape(primary, accent);
  if (product.category === "bag") return bagShape(product, primary, accent);
  if (["socks", "scarf", "wallet", "grill"].includes(product.category))
    return smallAccessoryShape(product, primary, accent);
  if (FRAGRANCE_CATEGORIES.has(product.category)) return fragranceShape(product, primary, accent);
  throw new Error(`No illustration template for category: ${product.category}`);
}

export function loadProducts() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

export function productImagePath(product) {
  return `/catalog/phase-2/${product.slug}.svg`;
}

export function renderProductSvg(product, index) {
  const [primary, accent] = paletteFor(product.color);
  const variant = index % 4;
  const name = escapeXml(product.name);
  const category = escapeXml(product.category);
  const slug = escapeXml(product.slug);
  const title = `${name} — ${escapeXml(product.color)} ${category}`;
  const pattern =
    variant === 0
      ? `<path d="M86 118h628M86 682h628" stroke="#fff" stroke-opacity=".08" stroke-width="2"/>`
      : variant === 1
        ? `<circle cx="110" cy="110" r="70" fill="none" stroke="${accent}" stroke-opacity=".18" stroke-width="2"/><circle cx="690" cy="690" r="70" fill="none" stroke="${accent}" stroke-opacity=".18" stroke-width="2"/>`
        : variant === 2
          ? `<path d="m70 620 170 110M560 70l170 110" stroke="${accent}" stroke-opacity=".18" stroke-width="3"/>`
          : `<path d="M100 100h600v600H100z" fill="none" stroke="${accent}" stroke-opacity=".12" stroke-width="2" stroke-dasharray="12 14"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800" role="img" aria-labelledby="title description" data-product="${slug}" data-category="${category}">
  <title id="title">${title}</title>
  <desc id="description">Original project-owned illustration for the ${name} demo product.</desc>
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#101216"/>
      <stop offset="1" stop-color="#262a31"/>
    </linearGradient>
    <radialGradient id="glow" cx=".5" cy=".42" r=".62">
      <stop offset="0" stop-color="${primary}" stop-opacity=".34"/>
      <stop offset="1" stop-color="${primary}" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000" flood-opacity=".42"/>
    </filter>
  </defs>
  <rect width="800" height="800" rx="42" fill="url(#background)"/>
  <rect width="800" height="800" rx="42" fill="url(#glow)"/>
  ${pattern}
  <g filter="url(#shadow)">${productShape(product, primary, accent)}</g>
  <g font-family="ui-sans-serif, system-ui, sans-serif" text-anchor="middle">
    <text x="400" y="710" fill="#f7f7f2" font-size="24" font-weight="700" letter-spacing="2">${name}</text>
    <text x="400" y="746" fill="${accent}" font-size="15" font-weight="700" letter-spacing="4">${escapeXml(product.color.toUpperCase())} · ${category.toUpperCase()}</text>
  </g>
  <rect x="22" y="22" width="756" height="756" rx="30" fill="none" stroke="#fff" stroke-opacity=".15" stroke-width="2"/>
</svg>
`.replace(/[ \t]+$/gm, "");
}

export function toDatabaseRow(product, index) {
  return {
    id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name: product.name,
    brand: product.brand,
    kind: product.kind,
    category: product.category,
    color: product.color,
    material: product.material,
    fit: product.fit,
    season: product.season,
    formality: product.formality,
    vibe: product.vibe,
    price_tier: product.price_tier,
    accessory_subtype: product.accessory_subtype,
    fragrance_family: product.fragrance_family,
    price: product.price,
    current_price: product.price,
    original_price: null,
    condition: "new",
    image_url: productImagePath(product),
    retailer: null,
    buy_url: null,
    availability: "sample_only",
    last_checked_at: null,
    external_id: null,
    is_demo: true,
    source: "phase_2_curated_demo",
    description: product.description,
    tags: [
      product.vibe,
      product.price_tier,
      product.accessory_subtype,
      product.fragrance_family,
    ].filter(Boolean),
  };
}

function sqlString(value) {
  if (value == null) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlArray(values) {
  return `ARRAY[${values.map(sqlString).join(", ")}]::text[]`;
}

export function renderMigration(products) {
  const rows = products.map(toDatabaseRow);
  const values = rows
    .map(
      (row) =>
        `  (${[
          sqlString(row.id),
          sqlString(row.name),
          sqlString(row.brand),
          sqlString(row.kind),
          sqlString(row.category),
          sqlString(row.color),
          sqlString(row.material),
          sqlString(row.fit),
          sqlString(row.season),
          sqlString(row.formality),
          sqlString(row.vibe),
          sqlString(row.price_tier),
          sqlString(row.accessory_subtype),
          sqlString(row.fragrance_family),
          row.price,
          row.current_price,
          "NULL",
          sqlString(row.condition),
          sqlString(row.image_url),
          "NULL",
          "NULL",
          sqlString(row.availability),
          "NULL",
          "NULL",
          "TRUE",
          sqlString(row.source),
          sqlString(row.description),
          sqlArray(row.tags),
        ].join(", ")})`,
    )
    .join(",\n");

  return `-- Phase 2: replace the repetitive seed inventory with a small, rights-safe demo catalog.
-- Only demo rows are replaced. Any verified retailer inventory remains untouched.
ALTER TABLE public.shop_catalog
  ADD COLUMN IF NOT EXISTS vibe TEXT,
  ADD COLUMN IF NOT EXISTS price_tier TEXT,
  ADD COLUMN IF NOT EXISTS accessory_subtype TEXT,
  ADD COLUMN IF NOT EXISTS fragrance_family TEXT;

DELETE FROM public.shop_catalog
WHERE is_demo IS TRUE;

INSERT INTO public.shop_catalog (
  id,
  name,
  brand,
  kind,
  category,
  color,
  material,
  fit,
  season,
  formality,
  vibe,
  price_tier,
  accessory_subtype,
  fragrance_family,
  price,
  current_price,
  original_price,
  condition,
  image_url,
  retailer,
  buy_url,
  availability,
  last_checked_at,
  external_id,
  is_demo,
  source,
  description,
  tags
) VALUES
${values};
`;
}

export function validateManifest(products) {
  const errors = [];
  if (products.length < 40 || products.length > 60)
    errors.push(`Catalog must contain 40–60 products; found ${products.length}.`);

  const slugs = new Set();
  const identities = new Set();
  for (const product of products) {
    if (slugs.has(product.slug)) errors.push(`Duplicate slug: ${product.slug}`);
    slugs.add(product.slug);

    const identity = [product.brand, product.name, product.category, product.color]
      .map((value) => String(value).trim().toLowerCase())
      .join("|");
    if (identities.has(identity)) errors.push(`Duplicate identity: ${identity}`);
    identities.add(identity);

    const validKind =
      (product.kind === "clothing" &&
        (TOP_CATEGORIES.has(product.category) ||
          BOTTOM_CATEGORIES.has(product.category) ||
          OUTERWEAR_CATEGORIES.has(product.category))) ||
      (product.kind === "shoes" && SHOE_CATEGORIES.has(product.category)) ||
      (product.kind === "accessory" && ACCESSORY_CATEGORIES.has(product.category)) ||
      (product.kind === "fragrance" && FRAGRANCE_CATEGORIES.has(product.category));
    if (!validKind) errors.push(`Unsupported kind/category pair: ${product.slug}`);
    if (product.kind === "accessory" && !product.accessory_subtype)
      errors.push(`Missing accessory subtype: ${product.slug}`);
    if (product.kind !== "accessory" && product.accessory_subtype)
      errors.push(`Unexpected accessory subtype: ${product.slug}`);
    if (product.kind === "fragrance" && !product.fragrance_family)
      errors.push(`Missing fragrance family: ${product.slug}`);
    if (product.kind !== "fragrance" && product.fragrance_family)
      errors.push(`Unexpected fragrance family: ${product.slug}`);

    for (const field of [
      "name",
      "brand",
      "color",
      "material",
      "fit",
      "season",
      "formality",
      "vibe",
      "price_tier",
      "description",
    ]) {
      if (!String(product[field] ?? "").trim()) errors.push(`Missing ${field}: ${product.slug}`);
    }
  }
  return errors;
}
