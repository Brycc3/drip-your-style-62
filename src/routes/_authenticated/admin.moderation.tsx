import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  adminListOpenReports,
  adminHideOutfit,
  adminDeleteComment,
  adminSetSuspension,
  adminUpdateReport,
} from "@/lib/moderation.functions";
import { toast } from "sonner";
import { Shield, EyeOff, Trash2, UserX, Check, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/moderation")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Moderation — DRIP" }, { name: "robots", content: "noindex" }],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: prof } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!prof?.is_admin) throw redirect({ to: "/home" });
  },
  component: AdminModerationPage,
});

type Report = {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  resolution_note: string | null;
};

const STATUS_FILTERS = ["open", "reviewed", "actioned", "dismissed", "all"] as const;

function AdminModerationPage() {
  const listFn = useServerFn(adminListOpenReports);
  const hideOutfitFn = useServerFn(adminHideOutfit);
  const delCommentFn = useServerFn(adminDeleteComment);
  const suspendFn = useServerFn(adminSetSuspension);
  const updateFn = useServerFn(adminUpdateReport);

  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("open");
  const [rows, setRows] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = await listFn({ data: { status } });
      setRows(r as Report[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function run<T>(id: string, fn: () => Promise<T>, ok: string) {
    setBusy(id);
    try {
      await fn();
      toast.success(ok);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="container-app py-6">
      <div className="mb-4 flex items-center gap-2">
        <Shield className="h-4 w-4 text-primary" />
        <h1 className="font-display text-2xl">Moderation</h1>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-widest ${
              status === s ? "border-primary bg-primary/10 text-primary" : "border-border"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reports.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const isBusy = busy === r.id;
            return (
              <li key={r.id} className="card-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()} · {r.status}
                    </p>
                    <p className="mt-1 text-sm">
                      <span className="text-primary">{r.target_type}</span>{" "}
                      <span className="text-muted-foreground">{r.target_id ?? "—"}</span>
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-widest text-foreground/80">
                      {r.reason}
                    </p>
                    {r.details && (
                      <p className="mt-2 text-sm text-foreground/90">{r.details}</p>
                    )}
                    {r.resolution_note && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Note: {r.resolution_note}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.target_type === "outfit" && r.target_id && (
                    <button
                      disabled={isBusy}
                      onClick={() =>
                        run(
                          r.id,
                          async () => {
                            await hideOutfitFn({ data: { outfit_id: r.target_id! } });
                            await updateFn({
                              data: { report_id: r.id, status: "actioned", note: "Outfit hidden" },
                            });
                          },
                          "Outfit hidden",
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] uppercase tracking-widest hover:bg-surface-2 disabled:opacity-50"
                    >
                      <EyeOff className="h-3 w-3" /> Hide outfit
                    </button>
                  )}
                  {r.target_type === "comment" && r.target_id && (
                    <button
                      disabled={isBusy}
                      onClick={() =>
                        run(
                          r.id,
                          async () => {
                            await delCommentFn({ data: { comment_id: r.target_id! } });
                            await updateFn({
                              data: { report_id: r.id, status: "actioned", note: "Comment deleted" },
                            });
                          },
                          "Comment deleted",
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] uppercase tracking-widest hover:bg-surface-2 disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" /> Delete comment
                    </button>
                  )}
                  {r.target_type === "user" && r.target_id && (
                    <>
                      <button
                        disabled={isBusy}
                        onClick={() =>
                          run(
                            r.id,
                            async () => {
                              await suspendFn({
                                data: { target_id: r.target_id!, suspend: true },
                              });
                              await updateFn({
                                data: {
                                  report_id: r.id,
                                  status: "actioned",
                                  note: "User suspended",
                                },
                              });
                            },
                            "User suspended",
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-destructive/50 px-3 py-1.5 text-[11px] uppercase tracking-widest text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        <UserX className="h-3 w-3" /> Suspend
                      </button>
                      <button
                        disabled={isBusy}
                        onClick={() =>
                          run(
                            r.id,
                            () =>
                              suspendFn({
                                data: { target_id: r.target_id!, suspend: false },
                              }),
                            "User un-suspended",
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] uppercase tracking-widest hover:bg-surface-2 disabled:opacity-50"
                      >
                        <Check className="h-3 w-3" /> Un-suspend
                      </button>
                    </>
                  )}
                  <button
                    disabled={isBusy}
                    onClick={() =>
                      run(
                        r.id,
                        () =>
                          updateFn({
                            data: { report_id: r.id, status: "dismissed" },
                          }),
                        "Dismissed",
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] uppercase tracking-widest hover:bg-surface-2 disabled:opacity-50"
                  >
                    <X className="h-3 w-3" /> Dismiss
                  </button>
                  <button
                    disabled={isBusy}
                    onClick={() =>
                      run(
                        r.id,
                        () =>
                          updateFn({
                            data: { report_id: r.id, status: "reviewed" },
                          }),
                        "Marked reviewed",
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] uppercase tracking-widest hover:bg-surface-2 disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" /> Mark reviewed
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
