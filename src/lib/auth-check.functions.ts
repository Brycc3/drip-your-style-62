import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public server fn: given an email that just failed password login, tell the
 * client which sign-in methods the account actually uses so we can show a
 * useful error instead of "invalid credentials". No secrets returned.
 */
export const checkEmailProviders = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ email: z.string().email() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Admin API: list users filtered by email. Cheap; small result.
    const { data: res, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 20,
    });
    if (error) return { exists: false, providers: [] as string[], confirmed: false };
    const user = res.users.find((u) => u.email?.toLowerCase() === data.email.toLowerCase());
    if (!user) return { exists: false, providers: [] as string[], confirmed: false };
    const providers = (user.identities ?? []).map((i) => i.provider);
    return {
      exists: true,
      providers,
      confirmed: Boolean(user.email_confirmed_at),
    };
  });
