/**
 * Pure helpers for the /auth/reset-password flow. These have no runtime
 * side effects so they can be unit-tested without a browser or Supabase.
 */

export type RecoveryCallbackState = {
  error: string | null;
  hasCallbackParameters: boolean;
};

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
      error: expired
        ? "This reset link has expired. Request a new password-reset email."
        : "This reset link is invalid. Request a new password-reset email.",
      hasCallbackParameters: true,
    };
  }

  return {
    error: null,
    hasCallbackParameters:
      h.has("access_token") ||
      h.has("refresh_token") ||
      h.has("type") ||
      q.has("code") ||
      q.has("type"),
  };
}

/**
 * Raw URL values are untrusted input. Only Supabase can verify a recovery
 * token/code and emit PASSWORD_RECOVERY after a successful provider exchange.
 */
export function recoveryEventAuthorizes(event: string): boolean {
  return event === "PASSWORD_RECOVERY";
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
