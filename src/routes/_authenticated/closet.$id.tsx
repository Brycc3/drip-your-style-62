import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrl, deleteClosetImage } from "@/lib/closet-storage";
import { toast } from "sonner";
import { Trash2, Pencil, Archive, ArchiveRestore, Undo2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type ClosetItem = Tables<"closet_items">;
type Wear = { id: string; worn_on: string; source: "item" | "outfit" };

export const Route = createFileRoute("/_authenticated/closet/$id")({
  head: () => ({
    meta: [{ title: "Piece — DRIP" }, { name: "robots", content: "noindex" }],
  }),
  component: ItemPage,
});

function ItemPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<ClosetItem | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [wears, setWears] = useState<Wear[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function loadWears() {
    const [{ data: iw }, { data: oi }] = await Promise.all([
      supabase
        .from("item_wears")
        .select("id, worn_on")
        .eq("closet_item_id", id)
        .order("worn_on", { ascending: false })
        .limit(30),
      supabase
        .from("outfit_items")
        .select("outfit_id")
        .eq("closet_item_id", id),
    ]);
    const outfitIds = (oi ?? []).map((r) => r.outfit_id);
    let outfitWears: Wear[] = [];
    if (outfitIds.length) {
      const { data: wh } = await supabase
        .from("wear_history")
        .select("id, worn_on")
        .in("outfit_id", outfitIds)
        .order("worn_on", { ascending: false })
        .limit(30);
      outfitWears = (wh ?? []).map((r) => ({
        id: r.id,
        worn_on: r.worn_on,
        source: "outfit" as const,
      }));
    }
    const itemWears: Wear[] = (iw ?? []).map((r) => ({
      id: r.id,
      worn_on: r.worn_on,
      source: "item" as const,
    }));
    const combined = [...itemWears, ...outfitWears].sort((a, b) =>
      a.worn_on < b.worn_on ? 1 : -1,
    );
    setWears(combined);
  }

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("closet_items")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) {
        toast.error("Not found");
        navigate({ to: "/closet" });
        return;
      }
      setItem(data);
      if (data.image_url) setUrl(await getSignedUrl(data.image_url));
      await loadWears();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function remove() {
    if (!item) return;
    if (
      !confirm(
        "Delete this piece? Outfits that reference it will lose this item.",
      )
    )
      return;
    setBusy(true);
    try {
      if (item.image_url) await deleteClosetImage(item.image_url);
      const { error } = await supabase.from("closet_items").delete().eq("id", id);
      if (error) throw error;
      toast.success("Deleted");
      navigate({ to: "/closet" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
      setBusy(false);
    }
  }

  async function toggleArchive() {
    if (!item) return;
    setBusy(true);
    const { error } = await supabase
      .from("closet_items")
      .update({ archived: !item.archived })
      .eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setItem({ ...item, archived: !item.archived });
    toast.success(item.archived ? "Restored" : "Archived");
  }

  async function markWorn() {
    if (!item) return;
    setBusy(true);
    const { data: wearId, error } = await supabase.rpc("record_item_wear", {
      _item_id: id,
      _worn_on: new Date().toISOString().slice(0, 10),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Marked worn today", {
      action: {
        label: "Undo",
        onClick: async () => {
          if (!wearId) return;
          const { error: rerr } = await supabase.rpc("remove_item_wear", {
            _wear_id: wearId as string,
          });
          if (rerr) return toast.error(rerr.message);
          toast.success("Undone");
          const { data: fresh } = await supabase
            .from("closet_items")
            .select("*")
            .eq("id", id)
            .maybeSingle();
          if (fresh) setItem(fresh);
          void loadWears();
        },
      },
    });
    const { data: fresh } = await supabase
      .from("closet_items")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (fresh) setItem(fresh);
    void loadWears();
  }

  async function removeWear(w: Wear) {
    if (!confirm(`Remove wear on ${w.worn_on}?`)) return;
    const rpc = w.source === "item" ? "remove_item_wear" : "remove_outfit_wear";
    const { error } = await supabase.rpc(rpc, { _wear_id: w.id });
    if (error) return toast.error(error.message);
    toast.success("Wear removed");
    const { data: fresh } = await supabase
      .from("closet_items")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (fresh) setItem(fresh);
    void loadWears();
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!item) return null;

  const fields: Array<[string, string]> = [
    ["Category", item.category],
    ["Subcategory", item.subcategory ?? "—"],
    ["Kind", item.kind],
    ["Brand", item.brand ?? "—"],
    ["Color", item.color ?? "—"],
    [
      "Also",
      (item.secondary_colors ?? []).length ? item.secondary_colors!.join(", ") : "—",
    ],
    ["Material", item.material ?? "—"],
    ["Fit", item.fit ?? "—"],
    ["Size", item.size ?? "—"],
    ["Price", item.price ? `$${item.price}` : "—"],
    ["Formality", item.formality],
    ["Season", item.season],
    ["Times worn", String(item.times_worn ?? 0)],
  ];

  return (
    <div className="space-y-5 max-w-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl truncate">{item.name}</h1>
          {item.archived && (
            <span className="mt-1 inline-block rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
              Archived
            </span>
          )}
        </div>
        <Link
          to="/closet/$id/edit"
          params={{ id }}
          className="shrink-0 inline-flex items-center gap-1 rounded-full border border-primary/60 px-3 py-1.5 text-xs uppercase tracking-widest text-primary"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Link>
      </div>

      <div className="card-surface aspect-square overflow-hidden">
        {url ? (
          <img src={url} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs uppercase tracking-widest text-muted-foreground">
            No photo
          </div>
        )}
      </div>

      <dl className="card-surface divide-y divide-border">
        {fields.map(([k, v]) => (
          <div key={k} className="flex justify-between px-4 py-3 text-sm gap-3">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-foreground/90 text-right min-w-0 truncate">{v}</dd>
          </div>
        ))}
      </dl>

      {item.notes && (
        <div className="card-surface p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Notes</p>
          <p className="mt-1 text-sm whitespace-pre-wrap">{item.notes}</p>
        </div>
      )}

      <button
        onClick={markWorn}
        disabled={busy}
        className="btn-lime w-full disabled:opacity-60"
      >
        Mark worn today
      </button>

      <div className="card-surface p-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Wear history
        </p>
        {wears.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No wears recorded yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {wears.map((w) => (
              <li
                key={`${w.source}-${w.id}`}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span>
                  {w.worn_on}
                  <span className="ml-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                    {w.source === "outfit" ? "Outfit" : "Piece"}
                  </span>
                </span>
                <button
                  onClick={() => removeWear(w)}
                  className="inline-flex items-center gap-1 text-[11px] uppercase tracking-widest text-muted-foreground hover:text-destructive"
                  aria-label="Remove wear"
                >
                  <Undo2 className="h-3 w-3" /> Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        onClick={toggleArchive}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-border py-3 text-sm uppercase tracking-widest hover:bg-surface-2 disabled:opacity-60"
      >
        {item.archived ? (
          <>
            <ArchiveRestore className="h-4 w-4" /> Unarchive
          </>
        ) : (
          <>
            <Archive className="h-4 w-4" /> Archive
          </>
        )}
      </button>

      <button
        onClick={remove}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-destructive/50 py-3 text-sm uppercase tracking-widest text-destructive"
      >
        <Trash2 className="h-4 w-4" /> {busy ? "…" : "Delete"}
      </button>
    </div>
  );
}
