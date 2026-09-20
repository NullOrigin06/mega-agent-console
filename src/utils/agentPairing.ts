/**
 * Local Agent pairing state, stored per-browser (localStorage) — not a user
 * account. Matches the device-code pairing model (like a Chromecast):
 * whichever agent's pairing code was last entered in THIS browser is who
 * "Generate Drawing" routes to. See mega-agent-api's AgentRegistry.cs and
 * the "Local Agent endpoints" section of its Program.cs for the backend
 * half of this.
 */

const STORAGE_KEY = "mega-agent-console:paired-agent";

export interface PairedAgent {
  agentId: string;
  pairingCode: string;
  pairedAt: string; // ISO 8601
}

export function getPairedAgent(): PairedAgent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PairedAgent;
  } catch {
    return null;
  }
}

export function setPairedAgent(agent: PairedAgent): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(agent));
  } catch {
    // Private browsing / storage disabled — pairing just won't persist across reloads.
  }
}

export function clearPairedAgent(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore — nothing to clean up if storage was never accessible.
  }
}
