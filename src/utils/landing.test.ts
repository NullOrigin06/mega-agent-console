import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestedAuthMode, shouldShowLanding } from "./landing";

function visit(search: string) {
  window.history.replaceState({}, "", `/${search}`);
}

describe("shouldShowLanding", () => {
  beforeEach(() => {
    vi.stubEnv("MODE", "production");
    vi.stubEnv("VITE_LANDING", "");
    visit("");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    visit("");
  });

  it("shows the welcome page to a visitor with no session", () => {
    expect(shouldShowLanding(false)).toBe(true);
  });

  it("never redirects a signed-in user", () => {
    expect(shouldShowLanding(true)).toBe(false);
  });

  it("lets Sign in on the welcome page through to the login screen", () => {
    visit("?signin=1");
    expect(shouldShowLanding(false)).toBe(false);
  });

  it("keeps password-reset and verification links on the auth screen", () => {
    visit("?resetToken=abc");
    expect(shouldShowLanding(false)).toBe(false);
    visit("?verifyToken=abc");
    expect(shouldShowLanding(false)).toBe(false);
  });

  it("can be switched off with VITE_LANDING=off", () => {
    vi.stubEnv("VITE_LANDING", "off");
    expect(shouldShowLanding(false)).toBe(false);
  });

  it("lets Request access (?signin=signup) through to the auth screen", () => {
    visit("?signin=signup");
    expect(shouldShowLanding(false)).toBe(false);
  });

  it("is disabled in the test environment", () => {
    vi.stubEnv("MODE", "test");
    expect(shouldShowLanding(false)).toBe(false);
  });
});

describe("requestedAuthMode", () => {
  afterEach(() => window.history.replaceState({}, "", "/"));

  it("opens Create Account for ?signin=signup", () => {
    window.history.replaceState({}, "", "/?signin=signup");
    expect(requestedAuthMode()).toBe("signup");
  });

  it("defaults to Sign in", () => {
    window.history.replaceState({}, "", "/?signin=1");
    expect(requestedAuthMode()).toBe("login");
    window.history.replaceState({}, "", "/");
    expect(requestedAuthMode()).toBe("login");
  });
});
