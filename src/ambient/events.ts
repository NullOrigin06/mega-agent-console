/**
 * Job/agent event transients as a fixed timeline the shader evaluates on its
 * own: every event gets its start time when it is pushed, so pack() just
 * copies <= 8 vec4s into the UBO (typeId, startTimeSec, param0, param1) and
 * the GPU animates t - start. No per-frame CPU work beyond that copy.
 *
 * Limits (spec layer 9 / WCAG 2.3.1): <= 3 concurrent; extras wait for a free
 * slot and start >= 700 ms apart; <= 6 waiting (oldest dropped); the same
 * transition (type + job/agent) within 1.5 s coalesces; a diff of > 6
 * transitions becomes one batch ring (coalesceBatch).
 *
 * param0 = link index (from setLinkResolver) or -1 for broadcast / hub-local.
 * param1 = landing region (REGION_* of the module) for dispatch/complete/fail,
 *          the coalesced count for batch, 0 otherwise.
 */
import { EVENTS, EVENT_TYPE_ID } from "./constants";
import { REGION_BONNET, REGION_NEUTRAL, REGION_SHELL, REGION_TUBESHEET } from "./types";
import type { AmbientEvent, TwinRegion } from "./types";
import type { ModuleKind } from "../types/engineering";

export interface EventPool {
  push(ev: AmbientEvent, nowSec: number): void;
  /** Writes up to EVENTS.poolSize vec4s (earliest start first, unused slots zeroed); returns how many were written. */
  pack(nowSec: number, out: Float32Array): number;
  clear(): void;
  /** Maps an event's agentId to a link index (-1 = broadcast). Applied at push time. */
  setLinkResolver(resolve: ((agentId: string | undefined) => number) | null): void;
  /** Events not yet finished (running + waiting) at nowSec. */
  liveCount(nowSec: number): number;
}

interface Entry {
  typeId: number;
  key: string;
  pushedAt: number;
  start: number;
  end: number;
  duration: number;
  param0: number;
  param1: number;
}

const REGION_OF: Record<ModuleKind, TwinRegion> = {
  TubeSheet: REGION_TUBESHEET,
  BonnetFlange: REGION_BONNET,
  HeatExchangerFab: REGION_SHELL,
  ShopTank: REGION_NEUTRAL,
  SiteTank: REGION_NEUTRAL,
};

/** Twin region a module's completion lands on (VesselViewport3D ownership). */
export function regionForModule(module: ModuleKind | undefined | null): TwinRegion {
  return module ? REGION_OF[module] : REGION_NEUTRAL;
}

/** Lifetime of one transient in seconds (always >= 0.9 s, one rise and fall). */
export function eventDuration(ev: AmbientEvent): number {
  const d =
    ev.type === "complete"
      ? EVENTS.completePulseSec + (ev.module && ev.module in EVENTS.landingSec ? EVENTS.landingSec[ev.module as keyof typeof EVENTS.landingSec] : EVENTS.landingSec.TubeSheet)
      : EVENTS.durationSec[ev.type];
  return Math.max(EVENTS.minTransientSec, d);
}

/** Batch ring radius in px: 18 + 6 * log2(n). */
export const batchRingRadius = (n: number) => EVENTS.batchRingBase + EVENTS.batchRingPerLog2 * Math.log2(Math.max(1, n));

/** More than 6 transitions in one diff become a single batch ring. */
export function coalesceBatch(events: AmbientEvent[]): AmbientEvent[] {
  if (events.length <= EVENTS.batchThreshold) return events;
  return [{ type: "batch", count: events.reduce((n, e) => n + (e.type === "batch" ? (e.count ?? 1) : 1), 0) }];
}

const keyOf = (ev: AmbientEvent) => `${ev.type}:${ev.jobId ?? ev.agentId ?? ev.module ?? ""}`;

export function createEventPool(): EventPool {
  // Kept sorted by start; mutated in place so pack() allocates nothing.
  const entries: Entry[] = [];
  let resolveLink: ((agentId: string | undefined) => number) | null = null;

  const prune = (now: number) => {
    let w = 0;
    for (let r = 0; r < entries.length; r++) if (entries[r].end > now) entries[w++] = entries[r];
    entries.length = w;
  };

  const overlapping = (t: number, upto: number): { count: number; firstEnd: number } => {
    let count = 0;
    let firstEnd = Infinity;
    for (let i = 0; i < upto; i++) {
      const e = entries[i];
      if (e.start <= t && e.end > t) {
        count++;
        if (e.end < firstEnd) firstEnd = e.end;
      }
    }
    return { count, firstEnd };
  };

  /** Re-times every event that has not started yet, in push order. */
  const reschedule = (now: number) => {
    entries.sort((a, b) => (a.start <= now ? 0 : 1) - (b.start <= now ? 0 : 1) || (a.start <= now && b.start <= now ? a.start - b.start : a.pushedAt - b.pushedAt));
    let fixed = 0;
    while (fixed < entries.length && entries[fixed].start <= now) fixed++;
    let lastExtra = -Infinity;
    for (let i = fixed; i < entries.length; i++) {
      const e = entries[i];
      let t = Math.max(now, e.pushedAt, lastExtra + EVENTS.spacingSec);
      for (let guard = 0; guard < 64; guard++) {
        const o = overlapping(t, i);
        if (o.count < EVENTS.maxConcurrent) break;
        t = Math.max(o.firstEnd, lastExtra + EVENTS.spacingSec);
      }
      e.start = t;
      e.end = t + e.duration;
      if (t > now) lastExtra = t;
    }
    entries.sort((a, b) => a.start - b.start);
  };

  const waiting = (now: number) => entries.reduce((n, e) => n + (e.start > now ? 1 : 0), 0);

  return {
    push(ev, now) {
      prune(now);
      const key = keyOf(ev);
      if (entries.some((e) => e.key === key && now - e.pushedAt < EVENTS.coalesceSec)) return;
      const duration = eventDuration(ev);
      entries.push({
        typeId: EVENT_TYPE_ID[ev.type],
        key,
        pushedAt: now,
        start: Infinity,
        end: Infinity,
        duration,
        param0: resolveLink && ev.type !== "batch" ? resolveLink(ev.agentId) : -1,
        param1: ev.type === "batch" ? (ev.count ?? 1) : ev.type === "dispatch" || ev.type === "complete" || ev.type === "fail" ? regionForModule(ev.module) : 0,
      });
      reschedule(now);
      // Queue cap: drop the oldest waiting event until <= 6 wait.
      while (waiting(now) > EVENTS.maxQueued) {
        let oldest = -1;
        for (let i = 0; i < entries.length; i++) if (entries[i].start > now && (oldest < 0 || entries[i].pushedAt < entries[oldest].pushedAt)) oldest = i;
        entries.splice(oldest, 1);
        reschedule(now);
      }
    },
    pack(now, out) {
      prune(now);
      const n = Math.min(EVENTS.poolSize, entries.length, Math.floor(out.length / 4));
      for (let i = 0; i < n; i++) {
        const e = entries[i];
        out[i * 4] = e.typeId;
        out[i * 4 + 1] = e.start;
        out[i * 4 + 2] = e.param0;
        out[i * 4 + 3] = e.param1;
      }
      out.fill(0, n * 4, Math.min(out.length, EVENTS.poolSize * 4));
      return n;
    },
    clear() {
      entries.length = 0;
    },
    setLinkResolver(fn) {
      resolveLink = fn;
    },
    liveCount(now) {
      prune(now);
      return entries.length;
    },
  };
}
