import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listAgents, applyRuntimeApiBaseUrl } from "./realApi";

const OLD = "https://old-tunnel.example";
const NEW = "https://new-tunnel.example";

function stubFetch(runtimeApiBaseUrl: string) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      calls.push(input);
      if (input.startsWith(OLD)) throw new TypeError("Failed to fetch");
      if (input.startsWith("/runtime-config.json")) {
        return new Response(JSON.stringify({ apiBaseUrl: runtimeApiBaseUrl }), { status: 200 });
      }
      if (input === `${NEW}/api/agents`) {
        return new Response(JSON.stringify([{ id: "agent-1", isOnline: true }]), { status: 200 });
      }
      throw new Error(`unexpected request ${input}`);
    })
  );
  return calls;
}

describe("API relocation while the page is open", () => {
  beforeEach(() => applyRuntimeApiBaseUrl(OLD));
  afterEach(() => vi.unstubAllGlobals());

  it("retries at the newly published address when the old tunnel is gone", async () => {
    const calls = stubFetch(NEW);

    const agents = await listAgents();

    expect(agents).toEqual([expect.objectContaining({ agentId: "agent-1", online: true })]);
    expect(calls).toEqual([
      `${OLD}/api/agents`,
      expect.stringMatching(/^\/runtime-config\.json/),
      `${NEW}/api/agents`,
    ]);
  });

  it("does not retry when the published address hasn't changed", async () => {
    const calls = stubFetch(OLD);

    await expect(listAgents()).rejects.toThrow("Failed to fetch");
    expect(calls).toHaveLength(2);
  });
});
