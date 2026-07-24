import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // If they haven't finished onboarding, push them there
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile?.onboarded) throw redirect({ to: "/onboarding" });
    return { userId: data.user.id };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
