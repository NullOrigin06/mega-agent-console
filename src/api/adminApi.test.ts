import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { adminListUsers, applyRuntimeApiBaseUrl, openAdminSession } from "./realApi";
import { AdminSessionExpiredError } from "./errors";
import { clearAuthSession, getAuthSession, setAuthSession } from "../utils/authSession";

const ORIGIN = "https://api.example.test";

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      calls.push({ url: input, init });
      return handler(input, init);
    })
  );
  return calls;
}

describe("admin mode never signs the user out of the console", () => {
  beforeEach(() => {
    applyRuntimeApiBaseUrl(ORIGIN);
    setAuthSession({ userId: "usr-1", apiKey: "mak_normal_key", email: "boss@example.com" });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    clearAuthSession();
  });

  it("a wrong password is shown as a message and the login stays", async () => {
    stubFetch(() => new Response(JSON.stringify({ error: "Wrong password." }), { status: 403 }));

    await expect(openAdminSession("nope")).rejects.toThrow("Wrong password.");
    expect(getAuthSession()?.apiKey).toBe("mak_normal_key");
  });

  it("an expired admin session asks for the password again instead of logging out", async () => {
    stubFetch(() => new Response(JSON.stringify({ error: "Admin session missing or expired." }), { status: 401 }));

    await expect(adminListUsers("mas_old", "pending")).rejects.toBeInstanceOf(AdminSessionExpiredError);
    expect(getAuthSession()?.apiKey).toBe("mak_normal_key");
  });

  it("sends both the normal key and the admin session, and only the admin token in its own header", async () => {
    const calls = stubFetch(() => new Response("[]", { status: 200 }));

    await adminListUsers("mas_session_token", "pending");

    expect(calls[0].url).toBe(`${ORIGIN}/api/admin/users?status=pending`);
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["X-Api-Key"]).toBe("mak_normal_key");
    expect(headers["X-Admin-Session"]).toBe("mas_session_token");
  });

  it("the admin session token is never written to browser storage", async () => {
    stubFetch(
      () => new Response(JSON.stringify({ adminToken: "mas_secret_session", expiresInSeconds: 1800 }), { status: 200 })
    );

    await openAdminSession("StrongPassword123");

    const stored = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(stored).not.toContain("mas_secret_session");
  });
});
