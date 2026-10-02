/**
 * Quality tiers for the Duty Field engine: the start-tier heuristic, the
 * pixel-budget DPR and the p90 frame-interval governor. Pure logic (the
 * navigator probe is isolated in readTierEnv) so it is unit-testable in jsdom.
 *
 * T0 = one composed still per change (no loop); T1..T3 = live tiers.
 */

import { GOVERNOR, TIERS, type TierDef } from "./constants";

export type Tier = 0 | 1 | 2 | 3;

/** Spec performance table, by tier; T0 (one still per change) renders with T1's counts. */
export function tierDef(tier: Tier): TierDef {
  return TIERS[tier === 0 ? 1 : tier];
}

/** RDP / VM / CI software rasterisers: these go straight to the Canvas2D still. */
export const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|basic render|microsoft basic/i;

export function isSoftwareRenderer(renderer: string | null): boolean {
  return renderer !== null && SOFTWARE_RENDERER.test(renderer);
}

export interface TierEnv {
  reducedMotion: boolean;
  hardwareConcurrency: number | null;
  /** navigator.deviceMemory (Chromium only), null when absent. */
  deviceMemory: number | null;
  coarsePointer: boolean;
  saveData: boolean;
  canvasW: number;
  battery: { level: number; charging: boolean } | null;
}

/** Spec "Starting tier". (Software renderer / caveat / no WebGL2 are handled before, as fallbacks.) */
export function startTier(env: TierEnv): Tier {
  const lowBattery = env.battery !== null && !env.battery.charging;
  if (env.reducedMotion || (lowBattery && env.battery!.level < 0.2)) return 0;
  const cores = env.hardwareConcurrency;
  const mem = env.deviceMemory;
  if (
    (cores !== null && cores <= 4) ||
    (mem !== null && mem <= 4) ||
    env.coarsePointer ||
    env.saveData ||
    env.canvasW < 900 ||
    (lowBattery && env.battery!.level < 0.3)
  ) {
    return 1;
  }
  if (cores !== null && cores >= 8 && (mem === null || mem >= 8)) return 3;
  return 2;
}

interface NavigatorHints {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
  getBattery?: () => Promise<{ level: number; charging: boolean }>;
}

/** Reads the navigator hints, each guarded (Chromium-only APIs, privacy shims that throw). */
export function readTierEnv(canvasW: number, coarsePointer: boolean, reducedMotion: boolean): TierEnv {
  const nav = (typeof navigator === "undefined" ? {} : navigator) as Navigator & NavigatorHints;
  let cores: number | null = null;
  let mem: number | null = null;
  let saveData = false;
  try {
    cores = typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null;
  } catch {
    // ignore
  }
  try {
    mem = typeof nav.deviceMemory === "number" ? nav.deviceMemory : null;
  } catch {
    // ignore
  }
  try {
    saveData = nav.connection?.saveData === true;
  } catch {
    // ignore
  }
  return { reducedMotion, hardwareConcurrency: cores, deviceMemory: mem, coarsePointer, saveData, canvasW, battery: null };
}

/** Resolves the battery state (Chromium, secure context) or null. Never rejects. */
export function readBattery(): Promise<{ level: number; charging: boolean } | null> {
  try {
    const nav = navigator as Navigator & NavigatorHints;
    if (!nav.getBattery) return Promise.resolve(null);
    return nav.getBattery().then(
      (b) => ({ level: b.level, charging: b.charging }),
      () => null,
    );
  } catch {
    return Promise.resolve(null);
  }
}

/** Effective DPR = min(tierCap, devicePixelRatio, sqrt(pixelBudget / cssPx)). */
export function effectiveDpr(tier: Tier, devicePixelRatio: number, cssW: number, cssH: number): number {
  const p = tierDef(tier);
  const css = Math.max(1, cssW * cssH);
  return Math.max(0.5, Math.min(p.dprCap, devicePixelRatio || 1, Math.sqrt(p.pixelBudget / css)));
}

export interface Governor {
  readonly tier: Tier;
  readonly locked: boolean;
  /**
   * Feeds one rendered frame: its interval, the longest raw rAF tick since the
   * previous rendered frame, and the interval the pacer was aiming for. With
   * integer-divisor pacing the render interval never drops below the target, so
   * headroom (step up) is judged from the raw ticks and misses (step down) from
   * the render interval. Returns the (possibly changed) tier.
   */
  sample(intervalMs: number, worstTickMs: number, targetMs: number, nowMs: number): Tier;
  /** Drops the current window (call after a pause, so resume gaps never count). */
  reset(): void;
}

const WINDOW = GOVERNOR.windowFrames;

/** 90th percentile without allocating (sorts a scratch copy in place). */
function p90(values: Float32Array, scratch: Float32Array): number {
  scratch.set(values);
  scratch.sort();
  return scratch[Math.floor(values.length * 0.9)];
}

/**
 * Spec governor: step down one tier when p90 > 1.25x target in 2 consecutive
 * 60-frame windows; step up after 10 s with p90 < 0.7x, at most once per 8 s,
 * never above detected + 1; two downgrades lock the tier; T1 failing for 5 s -> T0.
 */
export function createGovernor(detected: Tier, nowMs: number): Governor {
  const ratios = new Float32Array(WINDOW);
  const ticks = new Float32Array(WINDOW);
  const scratch = new Float32Array(WINDOW);
  const maxTier = Math.min(3, detected + 1) as Tier;
  let tier: Tier = detected;
  let n = 0;
  let badWindows = 0;
  let downgrades = 0;
  let locked = false;
  let lastChange = nowMs;
  let goodSince = -1;
  let t1FailSince = -1;

  return {
    get tier() {
      return tier;
    },
    get locked() {
      return locked;
    },
    reset() {
      n = 0;
      badWindows = 0;
      goodSince = -1;
    },
    sample(intervalMs, worstTickMs, targetMs, nowMs) {
      if (tier === 0 || targetMs <= 0 || intervalMs > 250) return tier;
      ratios[n] = intervalMs / targetMs;
      ticks[n++] = worstTickMs / targetMs;
      if (n < WINDOW) return tier;
      n = 0;
      if (p90(ratios, scratch) > GOVERNOR.downP90) {
        badWindows++;
        goodSince = -1;
        if (tier === 1) {
          if (t1FailSince < 0) t1FailSince = nowMs;
          else if (nowMs - t1FailSince >= GOVERNOR.t1FailSec * 1000) tier = 0;
        } else if (badWindows >= GOVERNOR.downWindows && !locked) {
          tier = (tier - 1) as Tier;
          badWindows = 0;
          lastChange = nowMs;
          if (++downgrades >= GOVERNOR.lockAfterDowngrades) locked = true;
        }
        return tier;
      }
      badWindows = 0;
      t1FailSince = -1;
      if (p90(ticks, scratch) < GOVERNOR.upP90) {
        if (goodSince < 0) goodSince = nowMs;
        if (!locked && tier < maxTier && nowMs - goodSince >= GOVERNOR.upAfterSec * 1000 && nowMs - lastChange >= GOVERNOR.upMinGapSec * 1000) {
          tier = (tier + 1) as Tier;
          lastChange = nowMs;
          goodSince = -1;
        }
      } else {
        goodSince = -1;
      }
      return tier;
    },
  };
}
