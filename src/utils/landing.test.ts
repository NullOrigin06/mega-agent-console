import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shouldShowLanding } from "./landing";

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

  it("is disabled in the test environment", () => {
    vi.stubEnv("MODE", "test");
    expect(shouldShowLanding(false)).toBe(false);
  });
});
