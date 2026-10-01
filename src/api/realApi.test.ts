import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listAgents, applyRuntimeApiBaseUrl, API_RELOCATION_WINDOW_MS } from "./realApi";

const OLD = "https://old-tunnel.example";
const NEW = "https://new-tunnel.example";
const AGENTS = JSON.stringify([{ id: "agent-1", isOnline: true }]);

/**
 * Fake network: `failures[origin]` requests to that origin throw like a
 * dead tunnel before it starts answering; runtime-config.json publishes
 * `published()`.
 */
function stubNetwork(published: () => string, failures: Record<string, number>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      calls.push(input);
      if (input.startsWith("/runtime-config.json")) {
        return new Response(JSON.stringify({ apiBaseUrl: published() }), { status: 200 });
      }
      const origin = new URL(input).origin;
      if ((failures[origin] ?? 0) > 0) {
        failures[origin]--;
        throw new TypeError("Failed to fetch");
      }
      return new Response(AGENTS, { status: 200 });
    })
  );
  return calls;
}

describe("API outages and relocation while the page is open", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    applyRuntimeApiBaseUrl(OLD);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("switches to a newly published address when the old tunnel is gone", async () => {
    const calls = stubNetwork(() => NEW, { [OLD]: Infinity });

    const result = listAgents();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(await result).toEqual([expect.objectContaining({ agentId: "agent-1", online: true })]);
    expect(calls.at(-1)).toBe(`${NEW}/api/agents`);
  });

  it("keeps retrying while the new address hasn't been published yet", async () => {
    // Watchdog still replacing the tunnel: config keeps naming the dead one for a while.
    let published = OLD;
    const calls = stubNetwork(() => published, { [OLD]: Infinity });

    const result = listAgents();
    await vi.advanceTimersByTimeAsync(20_000);
    published = NEW;
    await vi.advanceTimersByTimeAsync(15_000);

    expect(await result).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith(OLD)).length).toBeGreaterThan(2);
    expect(calls.at(-1)).toBe(`${NEW}/api/agents`);
  });

  it("recovers on the same address when the server comes back", async () => {
    const calls = stubNetwork(() => OLD, { [OLD]: 2 });

    const result = listAgents();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await result).toHaveLength(1);
    expect(calls.filter((c) => c === `${OLD}/api/agents`)).toHaveLength(3);
  });

  it("gives up once the outage outlasts the relocation window", async () => {
    stubNetwork(() => OLD, { [OLD]: Infinity });

    const result = listAgents();
    const assertion = expect(result).rejects.toThrow("Failed to fetch");
    await vi.advanceTimersByTimeAsync(API_RELOCATION_WINDOW_MS + 15_000);
    await assertion;
  });
});
