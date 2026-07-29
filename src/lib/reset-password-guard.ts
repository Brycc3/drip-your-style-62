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
export type RecoveryCallbackState =
  | { authorized: true; error: null }
  | { authorized: false; error: string | null };

export function parseRecoveryCallback(hash: string, search: string): RecoveryCallbackState {
  const strip = (s: string): string => (s.startsWith("#") || s.startsWith("?") ? s.slice(1) : s);
  const h = new URLSearchParams(strip(hash));
  const q = new URLSearchParams(strip(search));

  const errorCode = h.get("error_code") ?? q.get("error_code");
  const errorDescription = h.get("error_description") ?? q.get("error_description");
  if (errorCode || errorDescription) {
    const expired = `${errorCode ?? ""} ${errorDescription ?? ""}`
      .toLowerCase()
      .includes("expired");
    return {
      authorized: false,
      error: expired
        ? "This reset link has expired. Request a new password-reset email."
        : "This reset link is invalid. Request a new password-reset email.",
    };
  }

  const implicit =
    h.get("type") === "recovery" &&
    Boolean(h.get("access_token")) &&
    Boolean(h.get("refresh_token"));
  const pkce = q.get("type") === "recovery" && Boolean(q.get("code"));
  return { authorized: implicit || pkce, error: null };
}

export function isRecoveryUrl(hash: string, search: string): boolean {
  return parseRecoveryCallback(hash, search).authorized;
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
