import { describe, it, expect, afterEach } from "vitest";
import { readUrlToken, clearUrlToken } from "./urlToken";

function setSearch(search: string) {
  window.history.replaceState({}, "", `/${search}`);
}

describe("readUrlToken", () => {
  afterEach(() => {
    setSearch("");
  });

  it("reads a resetToken as reset-password mode", () => {
    setSearch("?resetToken=abc123");
    expect(readUrlToken()).toEqual({ mode: "reset-password", token: "abc123" });
  });

  it("reads a verifyToken as verify-email mode", () => {
    setSearch("?verifyToken=xyz789");
    expect(readUrlToken()).toEqual({ mode: "verify-email", token: "xyz789" });
  });

  it("prefers resetToken when both are somehow present", () => {
    setSearch("?resetToken=abc&verifyToken=xyz");
    expect(readUrlToken()).toEqual({ mode: "reset-password", token: "abc" });
  });

  it("returns null when neither token param is present", () => {
    setSearch("");
    expect(readUrlToken()).toBeNull();
  });

  it("returns null for an unrelated query string", () => {
    setSearch("?foo=bar");
    expect(readUrlToken()).toBeNull();
  });
});

describe("clearUrlToken", () => {
  it("strips query params from the URL without changing the path", () => {
    setSearch("?resetToken=abc123");
    clearUrlToken();
    expect(window.location.search).toBe("");
  });
});
