import { describe, expect, it } from "vitest";
import { EVENTS, EVENT_TYPE_ID } from "../constants";
import { batchRingRadius, coalesceBatch, createEventPool, eventDuration } from "../events";
import type { AmbientEvent } from "../types";

const OUT = () => new Float32Array(EVENTS.poolSize * 4);

/** Steps the pool and records, at every tick, how many events have started and not ended. */
function concurrency(pool: ReturnType<typeof createEventPool>, from: number, to: number) {
  const out = OUT();
  let max = 0;
  const starts = new Set<number>();
  for (let t = from; t <= to; t += 0.05) {
    const n = pool.pack(t, out);
    let running = 0;
    for (let i = 0; i < n; i++) {
      if (out[i * 4 + 1] <= t) running++;
      starts.add(Math.round(out[i * 4 + 1] * 1000) / 1000);
    }
    max = Math.max(max, running);
  }
  return { max, starts: [...starts].sort((a, b) => a - b) };
}

const dispatch = (i: number): AmbientEvent => ({ type: "dispatch", jobId: `job-${i}`, module: "TubeSheet" });

describe("event pool", () => {
  it("runs at most 3 at once and spaces the extras >= 700 ms apart", () => {
    const pool = createEventPool();
    for (let i = 0; i < 6; i++) pool.push(dispatch(i), 0);
    const { max, starts } = concurrency(pool, 0, 20);
    expect(max).toBeLessThanOrEqual(EVENTS.maxConcurrent);
    const extras = starts.filter((s) => s > 0);
    expect(extras.length).toBe(3);
    for (let i = 1; i < extras.length; i++) expect(extras[i] - extras[i - 1]).toBeGreaterThanOrEqual(EVENTS.spacingSec - 1e-6);
  });

  it("keeps at most 6 waiting, dropping the oldest", () => {
    const pool = createEventPool();
    for (let i = 0; i < 15; i++) pool.push(dispatch(i), 0);
    // 3 running + 6 waiting.
    expect(pool.liveCount(0)).toBe(EVENTS.maxConcurrent + EVENTS.maxQueued);
    const out = OUT();
    expect(pool.pack(0, out)).toBe(EVENTS.poolSize);
    expect(concurrency(pool, 0, 30).max).toBeLessThanOrEqual(EVENTS.maxConcurrent);
  });

  it("coalesces the same transition within 1.5 s", () => {
    const pool = createEventPool();
    pool.push(dispatch(1), 0);
    pool.push(dispatch(1), 1.0);
    expect(pool.liveCount(1.0)).toBe(1);
    pool.push(dispatch(1), 1.6);
    expect(pool.liveCount(1.6)).toBe(2);
    pool.push({ type: "complete", jobId: "job-1", module: "TubeSheet" }, 1.7);
    expect(pool.liveCount(1.7)).toBe(3);
  });

  it("packs typeId, start, link and landing region; zeroes unused slots", () => {
    const pool = createEventPool();
    pool.setLinkResolver((id) => (id === "agent-a" ? 4 : -1));
    pool.push({ type: "complete", jobId: "j", module: "BonnetFlange", agentId: "agent-a" }, 2);
    pool.push({ type: "fail", jobId: "k", module: "HeatExchangerFab" }, 2);
    const out = OUT().fill(9);
    expect(pool.pack(2.5, out)).toBe(2);
    expect(Array.from(out.slice(0, 4))).toEqual([EVENT_TYPE_ID.complete, 2, 4, 2]);
    expect(Array.from(out.slice(4, 8))).toEqual([EVENT_TYPE_ID.fail, 2, -1, 3]);
    expect(Array.from(out.slice(8))).toEqual(new Array(24).fill(0));
  });

  it("expires events after their single rise and fall", () => {
    const pool = createEventPool();
    pool.push({ type: "fail", jobId: "x" }, 0);
    expect(pool.liveCount(eventDuration({ type: "fail" }) - 0.01)).toBe(1);
    expect(pool.liveCount(eventDuration({ type: "fail" }) + 0.01)).toBe(0);
    pool.push(dispatch(2), 10);
    pool.clear();
    expect(pool.liveCount(10)).toBe(0);
  });

  it("gives every transient >= 0.9 s and module-specific completion landings", () => {
    for (const type of ["dispatch", "complete", "fail", "batch", "agentOnline", "agentOffline"] as const) {
      expect(eventDuration({ type })).toBeGreaterThanOrEqual(EVENTS.minTransientSec);
    }
    expect(eventDuration({ type: "complete", module: "HeatExchangerFab" })).toBeCloseTo(1.6 + 2.4, 6);
    expect(eventDuration({ type: "complete", module: "BonnetFlange" })).toBeCloseTo(1.6 + 1.2, 6);
  });
});

describe("batch coalescing", () => {
  it("turns > 6 transitions in one diff into a single batch ring", () => {
    const six = Array.from({ length: 6 }, (_, i) => dispatch(i));
    expect(coalesceBatch(six)).toBe(six);
    const many = Array.from({ length: 20 }, (_, i) => dispatch(i));
    expect(coalesceBatch(many)).toEqual([{ type: "batch", count: 20 }]);
    expect(batchRingRadius(16)).toBeCloseTo(18 + 6 * 4, 6);
  });
});
