import { useEffect, useMemo, useState } from "react";
import {
  catalogFallbackFor,
  catalogImagePresentation,
  resolveCatalogImageSource,
} from "@/lib/catalog-image";

type Props = {
  src?: string | null;
  alt: string;
  category?: string | null;
  isDemo?: boolean;
  className?: string;
  eager?: boolean;
};

function Placeholder({ alt, category }: { alt: string; category?: string | null }) {
  const p = useMemo(() => catalogFallbackFor(category), [category]);
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
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(198,255,61,.5) 0 1px, transparent 1px 8px)",
        }}
      />
    </div>
  );
}

export function CatalogImage({ src, alt, category, isDemo, className, eager }: Props) {
  const [errored, setErrored] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const fallbackHint = `${category ?? ""} ${alt}`;
  const resolvedSource = useMemo(
    () => resolveCatalogImageSource({ src, category, isDemo }),
    [src, category, isDemo],
  );
  const showImg = catalogImagePresentation(resolvedSource, errored) === "image";

  useEffect(() => {
    setErrored(false);
    setLoaded(false);
  }, [resolvedSource]);

  return (
    <div className={`relative overflow-hidden bg-surface-2 ${className ?? ""}`}>
      {showImg && (
        <>
          {!loaded && (
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-surface-2 to-surface" />
          )}
          <img
            src={resolvedSource as string}
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
      {(!showImg || errored) && <Placeholder alt={alt} category={fallbackHint} />}
    </div>
  );
}
