import { useMemo, useState } from "react";

type Props = {
  src?: string | null;
  alt: string;
  category?: string | null;
  className?: string;
  eager?: boolean;
};

// Deterministic gradient + emoji per category — used when there is no
// image, when the URL is malformed, or when the network load fails.
function paletteFor(cat?: string | null): { from: string; to: string; icon: string; label: string } {
  const c = (cat ?? "").toLowerCase();
  if (/(tee|top|shirt|polo|hoodie)/.test(c))
    return { from: "#1a2418", to: "#0a0f08", icon: "👕", label: "TOP" };
  if (/(bottom|trouser|cargo|jogger|short|denim|pants)/.test(c))
    return { from: "#20211a", to: "#0d0e08", icon: "👖", label: "BOTTOM" };
  if (/(outerwear|bomber|chore|jacket|coat)/.test(c))
    return { from: "#221a1a", to: "#0e0808", icon: "🧥", label: "OUTER" };
  if (/(shoe|sneaker|jordan|vomero|new_?balance|runner|loafer|boot)/.test(c))
    return { from: "#1a1e24", to: "#08090d", icon: "👟", label: "SHOES" };
  if (/(hat|cap|beanie)/.test(c))
    return { from: "#241f18", to: "#0d0a06", icon: "🧢", label: "HEADWEAR" };
  if (/belt/.test(c)) return { from: "#1c1710", to: "#0a0806", icon: "➰", label: "BELT" };
  if (/bag/.test(c)) return { from: "#181a20", to: "#07080b", icon: "👜", label: "BAG" };
  if (/watch/.test(c)) return { from: "#161a1f", to: "#06080b", icon: "⌚", label: "WATCH" };
  if (/(chain|ring|bracelet|jewel|earring)/.test(c))
    return { from: "#1f1a24", to: "#0a080d", icon: "💍", label: "JEWELRY" };
  if (/sunglass|shades|eyewear/.test(c))
    return { from: "#12161a", to: "#050708", icon: "🕶️", label: "EYEWEAR" };
  if (/sock/.test(c)) return { from: "#181c1a", to: "#080a08", icon: "🧦", label: "SOCKS" };
  if (/scarf/.test(c)) return { from: "#1e1a1a", to: "#0a0808", icon: "🧣", label: "SCARF" };
  if (/wallet|cardholder/.test(c))
    return { from: "#1a1612", to: "#080605", icon: "👛", label: "WALLET" };
  if (/(fragrance|scent|perfume|cologne|edt|edp|decant|parfum)/.test(c))
    return { from: "#241d16", to: "#0d0906", icon: "🧴", label: "FRAGRANCE" };
  return { from: "#1a1d20", to: "#08090b", icon: "✦", label: "PIECE" };
}

function Placeholder({ alt, category }: { alt: string; category?: string | null }) {
  const p = useMemo(() => paletteFor(category), [category]);
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center"
      style={{ background: `linear-gradient(155deg, ${p.from} 0%, ${p.to} 100%)` }}
      aria-label={alt}
    >
      <div className="text-4xl opacity-90 select-none" aria-hidden>
        {p.icon}
      </div>
      <div className="px-3">
        <div className="text-[9px] uppercase tracking-[0.3em] text-primary/80">{p.label}</div>
        <div className="mt-1 line-clamp-2 text-[11px] text-foreground/70">{alt}</div>
      </div>
      <div className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(198,255,61,.5) 0 1px, transparent 1px 8px)",
        }}
      />
    </div>
  );
}

export function CatalogImage({ src, alt, category, className, eager }: Props) {
  const [errored, setErrored] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const valid = !!src && src.trim().length > 0;
  const showImg = valid && !errored;
  return (
    <div className={`relative overflow-hidden bg-surface-2 ${className ?? ""}`}>
      {showImg && (
        <>
          {!loaded && (
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-surface-2 to-surface" />
          )}
          <img
            src={src as string}
            alt={alt}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setErrored(true)}
            className={`h-full w-full object-cover transition-opacity duration-300 ${
              loaded ? "opacity-100" : "opacity-0"
            }`}
          />
        </>
      )}
      {(!showImg || errored) && <Placeholder alt={alt} category={category} />}
    </div>
  );
}
