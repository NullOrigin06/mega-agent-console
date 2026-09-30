import { applyRuntimeApiBaseUrl } from "./api/realApi";

const RUNTIME_CONFIG_TIMEOUT_MS = 3000;

/**
 * Reads public/runtime-config.json (the same file the Local Agent reads to
 * find the server) and, if it names an API address, uses it instead of the
 * build-time VITE_API_BASE_URL. Never throws and never blocks startup for
 * long: on any failure the build-time value simply stays in effect.
 */
export async function loadRuntimeConfig(): Promise<void> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), RUNTIME_CONFIG_TIMEOUT_MS);
  try {
    const res = await fetch(`/runtime-config.json?t=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return;
    const config = (await res.json()) as { apiBaseUrl?: unknown };
    if (typeof config.apiBaseUrl === "string" && /^https?:\/\//i.test(config.apiBaseUrl.trim())) {
      applyRuntimeApiBaseUrl(config.apiBaseUrl.trim());
    }
  } catch {
    // Missing/invalid file or timeout - keep the build-time API address.
  } finally {
    window.clearTimeout(timer);
  }
}
