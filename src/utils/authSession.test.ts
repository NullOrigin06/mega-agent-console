import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getAuthSession,
  setAuthSession,
  clearAuthSession,
  subscribeAuth,
} from "./authSession";

describe("authSession", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores a session with a 30-day expiry and reads it back", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    setAuthSession({ userId: "u1", apiKey: "key1", email: "a@b.com" });

    const session = getAuthSession();
    expect(session?.userId).toBe("u1");
    expect(session?.apiKey).toBe("key1");
    expect(session?.expiresAt).toBe(now + 30 * 24 * 60 * 60 * 1000);
  });

  it("treats an expired session as logged out and clears it from storage", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    setAuthSession({ userId: "u1", apiKey: "key1", email: "a@b.com" });

    vi.setSystemTime(now + 31 * 24 * 60 * 60 * 1000);
    expect(getAuthSession()).toBeNull();
    expect(localStorage.getItem("mega-agent-console:auth-session")).toBeNull();
  });

  it("returns null when nothing is stored", () => {
    expect(getAuthSession()).toBeNull();
  });

  it("returns null for corrupted JSON instead of throwing", () => {
    localStorage.setItem("mega-agent-console:auth-session", "{not json");
    expect(getAuthSession()).toBeNull();
  });

  it("clearAuthSession removes the stored session", () => {
    setAuthSession({ userId: "u1", apiKey: "key1", email: "a@b.com" });
    clearAuthSession();
    expect(getAuthSession()).toBeNull();
  });

  it("notifies subscribers on set and clear", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAuth(listener);

    setAuthSession({ userId: "u1", apiKey: "key1", email: "a@b.com" });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", apiKey: "key1" })
    );

    clearAuthSession();
    expect(listener).toHaveBeenCalledWith(null);

    unsubscribe();
  });
});
