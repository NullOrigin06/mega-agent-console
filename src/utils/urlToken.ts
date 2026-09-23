export type UrlTokenMode = "reset-password" | "verify-email";

/**
 * Reads a password-reset or email-verification token off the URL
 * ("/?resetToken=..." / "/?verifyToken=..." - see mega-agent-api's email
 * link construction). Checked at the top of the app, above the logged-in/
 * logged-out gate, because clicking one of these links needs to work
 * regardless of whether the browser already has a session (e.g. right
 * after signup, which auto-logs in, but the verification email still
 * needs to be actionable).
 */
export function readUrlToken(): { mode: UrlTokenMode; token: string } | null {
  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get("resetToken");
  const verifyToken = params.get("verifyToken");
  if (resetToken) return { mode: "reset-password", token: resetToken };
  if (verifyToken) return { mode: "verify-email", token: verifyToken };
  return null;
}

export function clearUrlToken(): void {
  window.history.replaceState({}, "", window.location.pathname);
}
