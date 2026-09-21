export interface AuthSession {
  userId: string;
  apiKey: string;
  email: string;
}

const AUTH_STORAGE_KEY = "mega-agent-console:auth-session";

type AuthListener = (session: AuthSession | null) => void;
const listeners = new Set<AuthListener>();

export function getAuthSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function setAuthSession(session: AuthSession): void {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    notifyAuthChange(session);
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
