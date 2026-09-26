import { describe, it, expect } from "vitest";
import { validateEmail, validatePassword } from "./accountValidation";

describe("validateEmail", () => {
  it("accepts well-formed addresses", () => {
    const { normalized, error } = validateEmail("Engineer@MegaEPC.com");
    expect(error).toBeNull();
    expect(normalized).toBe("engineer@megaepc.com");
  });

  it("rejects malformed addresses", () => {
    expect(validateEmail("not-an-email").error).toBeTruthy();
    expect(validateEmail("").error).toBeTruthy();
    expect(validateEmail("missing-domain@").error).toBeTruthy();
  });

  it("rejects known disposable domains, case-insensitively", () => {
    expect(validateEmail("someone@mailinator.com").error).toMatch(/Disposable/);
    expect(validateEmail("SOMEONE@MAILINATOR.COM").error).toMatch(/Disposable/);
    expect(validateEmail("someone@10minutemail.com").error).toMatch(/Disposable/);
  });
});

describe("validatePassword", () => {
  it("accepts a reasonably strong password", () => {
    expect(validatePassword("Correcthorse42")).toBeNull();
  });

  it("rejects passwords under 8 characters", () => {
    expect(validatePassword("short1")).toMatch(/8 characters/);
  });

  it("rejects common weak passwords case-insensitively", () => {
    expect(validatePassword("password123")).toBeTruthy();
    expect(validatePassword("PASSWORD123")).toBeTruthy();
    expect(validatePassword("qwertyuiop")).toBeTruthy();
  });
});
