import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrl, deleteClosetImage } from "@/lib/closet-storage";
import { toast } from "sonner";
import { Trash2, ArrowLeft } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type ClosetItem = Tables<"closet_items">;

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
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

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
      setLoading(false);
    })();
  }, [id, navigate]);

  async function remove() {
    if (!item) return;
    if (!confirm("Delete this piece?")) return;
    setDeleting(true);
    try {
      if (item.image_url) await deleteClosetImage(item.image_url);
      const { error } = await supabase.from("closet_items").delete().eq("id", id);
      if (error) throw error;
      toast.success("Deleted");
      navigate({ to: "/closet" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
    }
  }

  async function markWorn() {
    if (!item) return;
    const { error } = await supabase
      .from("closet_items")
      .update({
        times_worn: (item.times_worn ?? 0) + 1,
        last_worn_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Marked worn today");
      setItem({
        ...item,
        times_worn: (item.times_worn ?? 0) + 1,
        last_worn_at: new Date().toISOString(),
      });
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!item) return null;

  const fields: Array<[string, string]> = [
    ["Category", item.category],
    ["Kind", item.kind],
    ["Brand", item.brand ?? "—"],
    ["Color", item.color ?? "—"],
    ["Material", item.material ?? "—"],
    ["Fit", item.fit ?? "—"],
    ["Size", item.size ?? "—"],
    ["Price", item.price ? `$${item.price}` : "—"],
    ["Formality", item.formality],
    ["Season", item.season],
    ["Times worn", String(item.times_worn ?? 0)],
  ];

  return (
    <div className="space-y-5">
      <button
        onClick={() => navigate({ to: "/closet" })}
        className="inline-flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Closet
      </button>

      <div className="card-surface aspect-square overflow-hidden">
        {url ? (
          <img src={url} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs uppercase tracking-widest text-muted-foreground">
            No photo
          </div>
        )}
      </div>

      <div>
        <h1 className="font-display text-3xl">{item.name}</h1>
      </div>

      <dl className="card-surface divide-y divide-border">
        {fields.map(([k, v]) => (
          <div key={k} className="flex justify-between px-4 py-3 text-sm">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-foreground/90">{v}</dd>
          </div>
        ))}
      </dl>

      {item.notes && (
        <div className="card-surface p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Notes</p>
          <p className="mt-1 text-sm">{item.notes}</p>
        </div>
      )}

      <button onClick={markWorn} className="btn-lime w-full">
        Mark worn today
      </button>
      <button
        onClick={remove}
        disabled={deleting}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-destructive/50 py-3 text-sm uppercase tracking-widest text-destructive"
      >
        <Trash2 className="h-4 w-4" /> {deleting ? "…" : "Delete"}
      </button>
    </div>
  );
}
