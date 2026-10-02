import { describe, expect, it } from "vitest";
import { createGovernor, effectiveDpr, isSoftwareRenderer, startTier, type TierEnv } from "../tiers";

const env = (over: Partial<TierEnv> = {}): TierEnv => ({
  reducedMotion: false,
  hardwareConcurrency: 8,
  deviceMemory: 8,
  coarsePointer: false,
  saveData: false,
  canvasW: 1208,
  battery: null,
  ...over,
});

describe("start tier", () => {
  it("picks T3 on a capable fine-pointer machine, T2 in between", () => {
    expect(startTier(env())).toBe(3);
    expect(startTier(env({ deviceMemory: null }))).toBe(3);
    expect(startTier(env({ hardwareConcurrency: 6 }))).toBe(2);
  });

  it("drops to T1 on weak or constrained devices", () => {
    expect(startTier(env({ hardwareConcurrency: 4 }))).toBe(1);
    expect(startTier(env({ deviceMemory: 4 }))).toBe(1);
    expect(startTier(env({ coarsePointer: true }))).toBe(1);
    expect(startTier(env({ saveData: true }))).toBe(1);
    expect(startTier(env({ canvasW: 800 }))).toBe(1);
    expect(startTier(env({ battery: { level: 0.25, charging: false } }))).toBe(1);
  });

  it("goes static (T0) for reduced motion and a nearly flat battery", () => {
    expect(startTier(env({ reducedMotion: true }))).toBe(0);
    expect(startTier(env({ battery: { level: 0.1, charging: false } }))).toBe(0);
    expect(startTier(env({ battery: { level: 0.1, charging: true } }))).toBe(3);
  });

  it("recognises software renderers", () => {
    expect(isSoftwareRenderer("Google SwiftShader")).toBe(true);
    expect(isSoftwareRenderer("llvmpipe (LLVM 15.0.7, 256 bits)")).toBe(true);
    expect(isSoftwareRenderer("ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11)")).toBe(true);
    expect(isSoftwareRenderer("ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)")).toBe(false);
    expect(isSoftwareRenderer(null)).toBe(false);
  });
});

describe("pixel-budget DPR", () => {
  it("is min(tier cap, devicePixelRatio, sqrt(budget / cssPx))", () => {
    expect(effectiveDpr(3, 2, 1440, 809)).toBe(1.5);
    expect(effectiveDpr(2, 2, 1440, 809)).toBe(1.25);
    expect(effectiveDpr(1, 2, 1440, 809)).toBe(1);
    expect(effectiveDpr(3, 1, 1440, 809)).toBe(1);
    // 4K: the 3.0 MP budget caps it below the tier cap.
    expect(effectiveDpr(3, 2, 3840, 2000)).toBeCloseTo(Math.sqrt(3e6 / (3840 * 2000)), 6);
  });
});

describe("governor", () => {
  const feed = (g: ReturnType<typeof createGovernor>, frames: number, interval: number, tick: number, t0: number, target = 33.3) => {
    let t = t0;
    for (let i = 0; i < frames; i++) {
      t += interval;
      g.sample(interval, tick, target, t);
    }
    return t;
  };

  it("steps down after two slow windows and locks after two downgrades", () => {
    const g = createGovernor(3, 0);
    let t = feed(g, 60, 50, 50, 0);
    expect(g.tier).toBe(3);
    t = feed(g, 60, 50, 50, t);
    expect(g.tier).toBe(2);
    t = feed(g, 120, 50, 50, t);
    expect(g.tier).toBe(1);
    expect(g.locked).toBe(true);
  });

  it("steps up after 10 s of headroom, at most detected + 1, then T1 failing for 5 s goes static", () => {
    const g = createGovernor(2, 0);
    let t = feed(g, 60 * 7, 33.3, 16.7, 0);
    expect(g.tier).toBe(3);
    t = feed(g, 60 * 10, 33.3, 16.7, t);
    expect(g.tier).toBe(3);

    const low = createGovernor(1, 0);
    feed(low, 60 * 4, 60, 60, 0);
    expect(low.tier).toBe(0);
  });

  it("ignores resume gaps", () => {
    const g = createGovernor(3, 0);
    for (let i = 0; i < 200; i++) g.sample(5000, 5000, 33.3, i * 5000);
    expect(g.tier).toBe(3);
  });
});
