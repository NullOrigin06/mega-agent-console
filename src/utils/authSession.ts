export interface AuthSession {
  userId: string;
  apiKey: string;
  email: string;
  // Epoch ms - the browser-side session expires even though the underlying
  // API key itself doesn't (Local Agents rely on that key staying valid
  // indefinitely for unattended polling). This just forces the *console* to
  // ask for a fresh login periodically instead of staying signed in forever
  // on a shared or unattended machine.
  expiresAt: number;
}

const AUTH_STORAGE_KEY = "mega-agent-console:auth-session";
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type AuthListener = (session: AuthSession | null) => void;
const listeners = new Set<AuthListener>();

export function getAuthSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Partial<AuthSession>;
    if (!session.expiresAt || Date.now() > session.expiresAt) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    return session as AuthSession;
  } catch {
    return null;
  }
}

export function setAuthSession(session: Omit<AuthSession, "expiresAt">): void {
  try {
    const withExpiry: AuthSession = { ...session, expiresAt: Date.now() + SESSION_LIFETIME_MS };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(withExpiry));
    notifyAuthChange(withExpiry);
  } catch (err) {
    console.error("Failed to save auth session to localStorage:", err);
  }
}

export function clearAuthSession(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    notifyAuthChange(null);
  } catch (err) {
    console.error("Failed to clear auth session from localStorage:", err);
  }
}

export function subscribeAuth(listener: AuthListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyAuthChange(session: AuthSession | null): void {
  for (const listener of listeners) {
    try {
      listener(session);
    } catch (err) {
      console.error("Error in auth session listener:", err);
    }
  }
}
