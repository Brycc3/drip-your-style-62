export const BACKEND_CONFIGURATION_ERROR =
  "Sign-in is temporarily unavailable because the backend configuration is missing.";

type Environment = Record<string, string | undefined>;

export type BackendConfigurationStatus =
  | { ok: true }
  | { ok: false; missing: readonly ("url" | "publishable_key")[] };

export type PublicBackendConfiguration = {
  url: string;
  publishableKey: string;
};

function firstPresent(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
}

function isHttpsUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function jwtRole(value: string): string | undefined {
  const payload = value.split(".")[1];
  if (!payload) return undefined;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const normalized = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(atob(normalized))?.role;
  } catch {
    return undefined;
  }
}

function isSafePublishableKey(value: string | undefined): boolean {
  if (!value) return false;
  return !value.startsWith("sb_secret_") && jwtRole(value) !== "service_role";
}

/**
 * Pure, value-safe configuration check. It reports only which logical setting
 * is missing and never includes a URL or key in logs or user-facing errors.
 */
export function backendConfigurationStatus(env: Environment): BackendConfigurationStatus {
  const url = firstPresent(env.VITE_SUPABASE_URL, env.SUPABASE_URL);
  const publishableKey = firstPresent(
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
    env.SUPABASE_PUBLISHABLE_KEY,
  );
  const missing: Array<"url" | "publishable_key"> = [];
  if (!isHttpsUrl(url)) missing.push("url");
  if (!isSafePublishableKey(publishableKey)) missing.push("publishable_key");
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

export function resolvePublicBackendConfiguration(env: Environment): PublicBackendConfiguration {
  const status = backendConfigurationStatus(env);
  if (!status.ok) throw new Error(BACKEND_CONFIGURATION_ERROR);

  return {
    url: firstPresent(env.VITE_SUPABASE_URL, env.SUPABASE_URL) as string,
    publishableKey: firstPresent(
      env.VITE_SUPABASE_PUBLISHABLE_KEY,
      env.SUPABASE_PUBLISHABLE_KEY,
    ) as string,
  };
}

export function publicBackendEnvironment(): Environment {
  const serverEnvironment = typeof process === "undefined" ? {} : process.env;
  return {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_URL: serverEnvironment.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: serverEnvironment.SUPABASE_PUBLISHABLE_KEY,
  };
}

export function currentBackendConfigurationStatus(): BackendConfigurationStatus {
  return backendConfigurationStatus(publicBackendEnvironment());
}
