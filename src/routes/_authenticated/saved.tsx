import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bookmark, Pin, Trash2, Copy, Globe, Lock, CheckCircle2, Shirt } from "lucide-react";
import { StyleTabs } from "@/components/StyleTabs";
import { getSignedUrlsByItem } from "@/lib/closet-storage";
import { PublishDialog } from "@/components/PublishDialog";


export const Route = createFileRoute("/_authenticated/saved")({
  head: () => ({
    meta: [{ title: "Saved Outfits — DRIP" }, { name: "robots", content: "noindex" }],
  }),
  component: SavedPage,
});

type Outfit = {
  id: string;
  name: string | null;
  occasion: string | null;
  vibe: string | null;
  visibility: "private" | "public" | "friends";
  score: number | null;
  worn_at: string | null;
  pinned: boolean;
  share_slug: string | null;
  comments_enabled: boolean;
  created_at: string;
};


type OutfitPieceRef = {
  outfit_id: string;
  closet_item_id: string;
  role: string | null;
  closet_items: { id: string; name: string; image_url: string | null } | null;
};

const FILTERS = [
  { v: "all", l: "All" },
  { v: "pinned", l: "Pinned" },
  { v: "private", l: "Private" },
  { v: "shared", l: "Shared" },
  { v: "recent", l: "Recently worn" },
  { v: "never", l: "Never worn" },
] as const;
type FilterKey = (typeof FILTERS)[number]["v"];

function SavedPage() {
  const [rows, setRows] = useState<Outfit[]>([]);
  const [pieces, setPieces] = useState<Record<string, OutfitPieceRef[]>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<FilterKey>("all");
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [publishing, setPublishing] = useState<Outfit | null>(null);


  async function load() {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const u = userData.user?.id ?? null;
    setUid(u);
    if (!u) {
      setLoading(false);
      return;
    }
    const { data: outfits } = await supabase
      .from("saved_outfits")
      .select("id,name,occasion,vibe,visibility,score,worn_at,pinned,share_slug,comments_enabled,created_at")

      .eq("user_id", u)
      .eq("is_shopping_idea", false)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    const list = (outfits ?? []) as Outfit[];
    setRows(list);
    setLoading(false);
    if (!list.length) return;
    const ids = list.map((o) => o.id);
    const { data: oi } = await supabase
      .from("outfit_items")
      .select("outfit_id, closet_item_id, role, closet_items(id,name,image_url)")
      .in("outfit_id", ids);
    const byOutfit: Record<string, OutfitPieceRef[]> = {};
    for (const r of (oi ?? []) as unknown as OutfitPieceRef[]) {
      byOutfit[r.outfit_id] = byOutfit[r.outfit_id] ?? [];
      byOutfit[r.outfit_id].push(r);
    }
    setPieces(byOutfit);
    const allItems = Object.values(byOutfit)
      .flat()
      .map((r) => r.closet_items)
      .filter((c): c is { id: string; name: string; image_url: string | null } => !!c);
    setUrls(await getSignedUrlsByItem(allItems));
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    switch (filter) {
      case "pinned":
        return rows.filter((r) => r.pinned);
      case "private":
        return rows.filter((r) => r.visibility === "private");
      case "shared":
        return rows.filter((r) => r.visibility !== "private");
      case "recent":
        return rows.filter((r) => !!r.worn_at);
      case "never":
        return rows.filter((r) => !r.worn_at);
      default:
        return rows;
    }
  }, [rows, filter]);

  async function rename(o: Outfit) {
    const val = renameVal.trim();
    if (!val) return setRenaming(null);
    const { error } = await supabase.from("saved_outfits").update({ name: val }).eq("id", o.id);
    if (error) return toast.error(error.message);
    setRows((rs) => rs.map((r) => (r.id === o.id ? { ...r, name: val } : r)));
    setRenaming(null);
    toast.success("Renamed");
  }

  async function togglePin(o: Outfit) {
    const { error } = await supabase
      .from("saved_outfits")
      .update({ pinned: !o.pinned })
      .eq("id", o.id);
    if (error) return toast.error(error.message);
    setRows((rs) => rs.map((r) => (r.id === o.id ? { ...r, pinned: !r.pinned } : r)));
  }

  function startPublish(o: Outfit) {
    setPublishing(o);
  }

  async function unpublish(o: Outfit) {
    if (!confirm("Unpublish this outfit? It stays saved privately.")) return;
    const { error } = await supabase
      .from("saved_outfits")
      .update({ visibility: "private" })
      .eq("id", o.id);
    if (error) return toast.error(error.message);
    setRows((rs) => rs.map((r) => (r.id === o.id ? { ...r, visibility: "private" as const } : r)));
    toast.success("Now private");
  }

  async function doPublish(v: { caption: string; vibe: string; occasion: string; comments_enabled: boolean }) {
    if (!publishing) return;
    const { error } = await supabase
      .from("saved_outfits")
      .update({
        name: v.caption.trim() || null,
        vibe: v.vibe.trim() || null,
        occasion: v.occasion.trim() || null,
        comments_enabled: v.comments_enabled,
        visibility: "public",
      })
      .eq("id", publishing.id);
    if (error) { toast.error(error.message); return; }

    setRows((rs) =>
      rs.map((r) =>
        r.id === publishing.id
          ? { ...r, name: v.caption.trim() || null, vibe: v.vibe.trim() || null, occasion: v.occasion.trim() || null, comments_enabled: v.comments_enabled, visibility: "public" as const }
          : r,
      ),
    );
    setPublishing(null);
    toast.success("Published — only this outfit is public");
  }


  async function markWorn(o: Outfit) {
    const { error } = await supabase.rpc("record_outfit_wear", { _outfit_id: o.id });
    if (error) return toast.error(error.message);
    setRows((rs) =>
      rs.map((r) => (r.id === o.id ? { ...r, worn_at: new Date().toISOString() } : r)),
    );
    toast.success("Marked as worn");
  }

  async function duplicate(o: Outfit) {
    if (!uid) return;
    const { data: dup, error } = await supabase
      .from("saved_outfits")
      .insert({
        user_id: uid,
        name: `${o.name ?? "Outfit"} (copy)`,
        occasion: o.occasion,
        vibe: o.vibe,
        visibility: "private",
      })
      .select("id")
      .single();
    if (error || !dup) return toast.error(error?.message ?? "Copy failed");
    const src = pieces[o.id] ?? [];
    if (src.length) {
      await supabase.from("outfit_items").insert(
        src.map((p) => ({
          outfit_id: dup.id,
          closet_item_id: p.closet_item_id,
          role: p.role,
        })),
      );
    }
    toast.success("Duplicated");
    void load();
  }

  async function del(o: Outfit) {
    if (!confirm("Delete this saved outfit?")) return;
    const { error } = await supabase.from("saved_outfits").delete().eq("id", o.id);
    if (error) return toast.error(error.message);
    setRows((rs) => rs.filter((r) => r.id !== o.id));
    toast.success("Deleted");
  }

  async function copyLink(o: Outfit) {
    if (!o.share_slug) return;
    const url = `${window.location.origin}/o/${o.share_slug}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  }

  return (
    <div className="space-y-5">
      <StyleTabs />
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Your looks</p>
        <h1 className="mt-1 font-display text-4xl">Saved Outfits</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything you've saved. Rename, pin, share or mark worn.
        </p>
      </div>

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 scrollbar-hide">
        {FILTERS.map((f) => (
          <button
            key={f.v}
            onClick={() => setFilter(f.v)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs uppercase tracking-widest ${
              filter === f.v
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-foreground/80"
            }`}
          >
            {f.l}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="card-surface p-6 text-center text-sm text-muted-foreground">
          Nothing here.{" "}
          <Link to="/generate" className="text-primary underline">
            Create a look
          </Link>{" "}
          or{" "}
          <Link to="/swipe" className="text-primary underline">
            swipe
          </Link>{" "}
          for ideas.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((o) => {
            const ps = pieces[o.id] ?? [];
            return (
              <li key={o.id} className="card-surface overflow-hidden">
                <div className="grid grid-cols-2 gap-1 bg-surface-2">
                  {ps.slice(0, 4).map((p) => (
                    <div key={p.closet_item_id} className="aspect-square bg-surface">
                      {p.closet_items && urls[p.closet_items.id] ? (
                        <img
                          src={urls[p.closet_items.id]}
                          alt={p.closet_items.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center p-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
                          <Shirt className="h-4 w-4 opacity-50 mr-1" />
                          {p.closet_items?.name ?? "Piece"}
                        </div>
                      )}
                    </div>
                  ))}
                  {ps.length === 0 && (
                    <div className="col-span-2 aspect-[2/1] flex items-center justify-center text-xs text-muted-foreground">
                      No pieces attached
                    </div>
                  )}
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {renaming === o.id ? (
                        <div className="flex gap-1">
                          <input
                            autoFocus
                            value={renameVal}
                            onChange={(e) => setRenameVal(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void rename(o);
                              if (e.key === "Escape") setRenaming(null);
                            }}
                            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
                          />
                          <button
                            onClick={() => rename(o)}
                            className="text-xs uppercase tracking-widest text-primary"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setRenaming(o.id);
                            setRenameVal(o.name ?? "");
                          }}
                          className="line-clamp-1 text-sm font-medium hover:underline text-left"
                          title="Rename"
                        >
                          {o.name || "Untitled look"}
                        </button>
                      )}
                      <p className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                        {[o.vibe, o.occasion].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {o.pinned && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-primary">
                          Pinned
                        </span>
                      )}
                      {o.worn_at && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                          <CheckCircle2 className="h-3 w-3" />
                          {new Date(o.worn_at).toISOString().slice(0, 10)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => togglePin(o)}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[10px] uppercase tracking-widest hover:bg-surface-2"
                    >
                      <Pin className="h-3 w-3" /> {o.pinned ? "Unpin" : "Pin"}
                    </button>
                    {o.visibility === "private" ? (
                      <button
                        onClick={() => startPublish(o)}
                        className="inline-flex items-center gap-1 rounded-full border border-primary/60 px-2.5 py-1 text-[10px] uppercase tracking-widest text-primary hover:bg-primary/10"
                      >
                        <Globe className="h-3 w-3" /> Publish
                      </button>
                    ) : (
                      <button
                        onClick={() => unpublish(o)}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[10px] uppercase tracking-widest hover:bg-surface-2"
                      >
                        <Lock className="h-3 w-3" /> Unpublish
                      </button>
                    )}

                    {o.visibility !== "private" && o.share_slug && (
                      <button
                        onClick={() => copyLink(o)}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[10px] uppercase tracking-widest hover:bg-surface-2"
                      >
                        <Copy className="h-3 w-3" /> Copy link
                      </button>
                    )}
                    <button
                      onClick={() => markWorn(o)}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/60 px-2.5 py-1 text-[10px] uppercase tracking-widest text-primary hover:bg-primary/10"
                    >
                      <Bookmark className="h-3 w-3" /> Mark worn
                    </button>
                    <button
                      onClick={() => duplicate(o)}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[10px] uppercase tracking-widest hover:bg-surface-2"
                    >
                      <Copy className="h-3 w-3" /> Duplicate
                    </button>
                    <button
                      onClick={() => del(o)}
                      className="inline-flex items-center gap-1 rounded-full border border-destructive/50 px-2.5 py-1 text-[10px] uppercase tracking-widest text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <PublishDialog
        open={!!publishing}
        initial={{
          caption: publishing?.name ?? "",
          vibe: publishing?.vibe ?? "",
          occasion: publishing?.occasion ?? "",
          comments_enabled: publishing?.comments_enabled ?? true,
        }}
        onCancel={() => setPublishing(null)}
        onConfirm={doPublish}
      />
    </div>
  );

}
