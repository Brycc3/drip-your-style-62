import { createFileRoute, Link } from "@tanstack/react-router";
import heroImage from "@/assets/landing-hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DRIP — Your Wardrobe, Weaponized" },
      {
        name: "description",
        content:
          "DRIP is a private wardrobe, outfit generator, shopping-gap finder, and fragrance shelf built for people who care what they wear.",
      },
      { property: "og:title", content: "DRIP — Your Wardrobe, Weaponized" },
      {
        property: "og:description",
        content:
          "Track every piece you own. Generate outfits from your closet. Only buy what fills a real gap.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="safe-t">
        <div className="container-app flex h-16 items-center justify-between">
          <span className="font-display text-2xl tracking-widest">
            DRIP<span className="text-primary">.</span>
          </span>
          <Link to="/auth" className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
        </div>
      </header>

      <section className="container-app pt-4 pb-10">
        <div className="relative overflow-hidden rounded-3xl border border-border">
          <img
            src={heroImage}
            alt="Moody flat lay of a black tee, olive cargos, black bomber, and Jordan sneakers"
            width={1536}
            height={1920}
            className="h-[420px] w-full object-cover sm:h-[520px]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-primary">Wardrobe · Outfits · Scents</p>
            <h1 className="mt-2 font-display text-5xl leading-[0.9] sm:text-6xl">
              Wear<br />what you<br />actually<br />own.
            </h1>
          </div>
        </div>

        <p className="mt-8 text-base leading-relaxed text-muted-foreground">
          DRIP is a private wardrobe, outfit generator, and shopping-gap finder for people who care what
          they wear. Log every piece. Get outfits built only from your closet. Stop buying the fifth black
          hoodie.
        </p>

        <div className="mt-8 space-y-3">
          <Link to="/auth" search={{ mode: "signup" }} className="btn-lime block w-full text-center">
            Start your closet
          </Link>
          <Link
            to="/auth"
            className="block w-full rounded-full border border-border py-3 text-center text-sm uppercase tracking-widest text-foreground/80 hover:bg-surface"
          >
            I have an account
          </Link>
        </div>

        <ul className="mt-12 grid gap-4">
          {FEATURES.map((f) => (
            <li key={f.title} className="card-surface p-5">
              <p className="text-xs uppercase tracking-[0.25em] text-primary">{f.tag}</p>
              <h3 className="mt-1 font-display text-xl">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </li>
          ))}
        </ul>

        <footer className="mt-16 pb-10 text-center text-xs uppercase tracking-widest text-muted-foreground">
          Built for the closet you already have.
        </footer>
      </section>
    </div>
  );
}

const FEATURES = [
  {
    tag: "Closet",
    title: "Every piece, tagged",
    body: "Clothing, shoes, accessories, and fragrances. Color, material, fit, season, formality, brand, price, and notes.",
  },
  {
    tag: "Outfit generator",
    title: "Built from what you own",
    body: "Tell it the vibe, the weather, and the dress code. It pulls only from your closet and explains why.",
  },
  {
    tag: "Shop with intent",
    title: "Fill gaps, not urges",
    body: "Recommendations come from what your wardrobe is missing. Includes new, vintage, thrift, and resale. Warns you before duplicates.",
  },
  {
    tag: "Scents",
    title: "Your fragrance shelf, paired",
    body: "Track your bottles by family, notes, projection, and longevity. Pair them to outfits with a real reason.",
  },
] as const;
