/**
 * Pure helpers for the /auth/reset-password flow. These have no runtime
 * side effects so they can be unit-tested without a browser or Supabase.
 */

/**
 * Return true only when the URL carries an explicit recovery token from
 * Supabase's password reset email. We look at both the hash (implicit flow,
 * where Supabase historically posts tokens) and the query string (PKCE
 * flow). Any other URL — including one for a normal signed-in session — is
 * NOT a recovery URL and must not unlock the password form.
 */
export function isRecoveryUrl(hash: string, search: string): boolean {
  const strip = (s: string): string =>
    s.startsWith("#") || s.startsWith("?") ? s.slice(1) : s;
  const h = new URLSearchParams(strip(hash));
  const q = new URLSearchParams(strip(search));

  // Supabase implicit flow: #type=recovery&access_token=...
  if (h.get("type") === "recovery") return true;

  // Supabase PKCE flow: ?code=...&type=recovery (or just type=recovery)
  if (q.get("type") === "recovery") return true;

  // Explicit recovery error surfaces still count so we can render the
  // invalid-state UI instead of dropping the user on the sign-in page.
  if (h.get("error_code")?.includes("otp_expired")) return true;

  return false;
}

/**
 * Validate the new-password form. Kept pure so the reset page and tests can
 * share the exact same rules.
 */
export function validateNewPassword(
  password: string,
  confirm: string,
): { ok: true } | { ok: false; error: string } {
  if (typeof password !== "string" || password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters" };
  }
  if (password.length > 200) {
    return { ok: false, error: "Password is too long" };
  }
  if (password !== confirm) {
    return { ok: false, error: "Passwords do not match." };
  }
  return { ok: true };
}
