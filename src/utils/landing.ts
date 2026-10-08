import { readUrlToken } from "./urlToken";

/** Static marketing/welcome page shipped in public/. */
export const LANDING_PATH = "/welcome.html";

/** Query flag the welcome page's Sign in buttons use to ask for the login screen. */
export const SIGN_IN_PARAM = "signin";

/**
 * True when a visitor with no session should see the welcome page first.
 * Not for password-reset / email-verification links (they must reach the auth
 * screen), not once Sign in was chosen on the welcome page, and not in tests.
 * Set VITE_LANDING=off to disable (for example for a kiosk or a dev setup).
 */
export function shouldShowLanding(hasSession: boolean): boolean {
  if (hasSession) return false;
  if (import.meta.env.MODE === "test") return false;
  if (String(import.meta.env.VITE_LANDING ?? "").toLowerCase() === "off") return false;
  if (readUrlToken()) return false;
  return !new URLSearchParams(window.location.search).has(SIGN_IN_PARAM);
}
