/**
 * Luminance budget of the composite resolve (shaders/composite.frag.ts),
 * checked against the numbers in constants.ts. The GLSL helpers lum / capL /
 * softclip and the resolve chain are mirrored 1:1 below (same constants, same
 * order), then driven with adversarial inputs far above anything the passes
 * can produce. The mirror is pinned to the shader source by the string checks
 * in the first test, so a change to the resolve that this file doesn't follow fails here.
 */
import { describe, expect, it } from "vitest";
import { COLORS, HAZE, RESOLVE } from "../constants";
import { COMMON } from "../shaders/common.glsl";
import { COMPOSITE_FRAG } from "../shaders/composite.frag";

type V3 = [number, number, number];
const W3: V3 = [0.2126, 0.7152, 0.0722];
/** Same rounding as v3() in common.glsl.ts (3 decimals). */
const hex = (h: string): V3 => {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255].map((v) => +(v / 255).toFixed(3)) as V3;
};
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mix = (a: V3, b: V3, t: number): V3 => add(mul(a, 1 - t), mul(b, t));

const lum = (c: V3) => dot(c.map((v) => Math.pow(Math.max(v, 0), 2.2)) as V3, W3);
const capL = (c: V3, m: number): V3 => {
  const l = lum(c);
  return l > m ? mul(c, Math.pow(m / l, 1 / 2.2)) : c;
};
const softclip = (c: V3): V3 => {
  const k = RESOLVE.softclipKnee;
  const h = RESOLVE.softclipCeiling;
  const l = lum(c);
  if (l <= k) return c;
  return mul(c, Math.pow((k + (h - k) * (1 - Math.exp(-(l - k) / (h - k)))) / l, 1 / 2.2));
};

const BASE = hex(COLORS.base);

interface Px {
  /** quiet() at the pixel: 0 inside a quiet core, 1 outside the feather. */
  q: number;
  zone: "column" | "stage";
  /** haze term (already BASE-relative, as the haze target stores it) */
  haze: V3;
  /** lattice + glass field term */
  field: V3;
  /** accumulated lines / points (accum texture value) */
  acc: V3;
  /** signal-lost 0..1 (FX2.z) */
  lost: number;
  /** IGN dither 0..1 */
  ign: number;
}

/** composite.frag main() with dip = 0, no heat-map flag, top fade and vignette 1 (they scale c by <= 1, like q). */
function resolve(p: Px): { field: V3; out: V3 } {
  const col = p.zone === "column";
  const desat = (c: V3): V3 => mix(c, [dot(c, W3), dot(c, W3), dot(c, W3)], -HAZE.apiDownSaturation * p.lost);
  const field = capL(add(BASE, desat(add(p.haze, p.field))), col ? RESOLVE.capColumnL : RESOLVE.capStageL);
  let c = sub(field, BASE);
  const fld = c;
  c = add(c, desat(softclip(mul(p.acc, RESOLVE.accumGain * (col ? RESOLVE.lineColumnScale : 1)))));
  c = sub(capL(add(BASE, c), RESOLVE.softclipCeiling), BASE);
  c = mul(c, p.q);
  c = add(c, mul(fld, (1 - p.q) * RESOLVE.quietFieldFloor));
  const out = add(add(BASE, c), mul([1, 1, 1], ((p.ign - 0.5) / 255) * p.q));
  return { field, out };
}

/** Deterministic adversarial samples: zero, typical and absurd magnitudes per term, all hues. */
function* samples(zone: Px["zone"], q: number): Generator<Px> {
  const hues: V3[] = [hex(COLORS.wire), hex(COLORS.latticeRim), hex(COLORS.silhouette), hex(COLORS.failure), hex(COLORS.queued), [1, 1, 1]];
  const mags = [0, 0.02, 0.1, 0.4, 1, 4];
  for (const h of hues)
    for (const mf of mags)
      for (const ma of mags)
        for (const lost of [0, 1])
          yield { q, zone, haze: mul(hex(COLORS.hazeHigh), mf), field: mul(h, mf), acc: mul(h, ma), lost, ign: 1 };
}

/** Half an 8-bit step of dither on top of a near-black cap, in linear L. */
const ditherL = (capL: number) => {
  const s = Math.pow(capL, 1 / 2.2);
  return Math.pow(s + 0.5 / 255, 2.2) - capL;
};

describe("luminance budget (composite resolve)", () => {
  it("mirrors the shader's resolve chain", () => {
    expect(COMMON).toContain("float lum(vec3 c){return dot(pow(max(c,0.),vec3(2.2)),W3);}");
    expect(COMMON).toContain("vec3 capL(vec3 c,float m){float l=lum(c);return l>m?c*pow(m/l,1./2.2):c;}");
    expect(COMMON).toContain("return c*pow((k+(h-k)*(1.-exp(-(l-k)/(h-k))))/l,1./2.2);");
    // Field cap per zone, then lines through softclip, then the global ceiling, then the quiet mask on everything.
    expect(COMPOSITE_FRAG).toMatch(/vec3 c=capL\(base\+desat\(hz\+\(lat\+g\)\*mix\([^;]*\)\),col\?[\d.]+:[\d.]+\)-base;/);
    expect(COMPOSITE_FRAG).toMatch(/c\+=desat\(softclip\(texture\(uAcc,uv\)\.rgb\*/);
    expect(COMPOSITE_FRAG).toMatch(/c=capL\(base\+c,[\d.]+\)-base;/);
    expect(COMPOSITE_FRAG).toMatch(/c\*=q\*top\*/);
    expect(COMPOSITE_FRAG).toContain("vec3 res=base+c+(ign(fc)-.5)/255.*q;");
  });

  it(`quiet cores keep only a dimmed field: max L <= ${RESOLVE.quietMaxL}`, () => {
    let max = 0;
    for (const zone of ["column", "stage"] as const) for (const p of samples(zone, 0)) max = Math.max(max, lum(resolve(p).out));
    expect(max).toBeLessThanOrEqual(RESOLVE.quietMaxL);
    // Lines and points add nothing inside a core.
    const lineOnly: Px = { q: 0, zone: "stage", haze: [0, 0, 0], field: [0, 0, 0], acc: [4, 4, 4], lost: 0, ign: 0.5 };
    expect(lum(resolve(lineOnly).out)).toBeCloseTo(lum(BASE), 9);
  });

  it(`column fields are capped at L ${RESOLVE.capColumnL}`, () => {
    let max = 0;
    for (const p of samples("column", 1)) if (p.acc.every((v) => v === 0)) max = Math.max(max, lum(resolve(p).out));
    let fieldMax = 0;
    for (const p of samples("column", 1)) fieldMax = Math.max(fieldMax, lum(resolve(p).field));
    expect(fieldMax).toBeLessThanOrEqual(RESOLVE.capColumnL * (1 + 1e-6));
    // The resolved pixel (no lines) adds at most half an 8-bit dither step on top of the cap.
    expect(max).toBeLessThanOrEqual(RESOLVE.capColumnL + ditherL(RESOLVE.capColumnL));
  });

  it(`stage fields are capped at L ${RESOLVE.capStageL}`, () => {
    let max = 0;
    let fieldMax = 0;
    for (const p of samples("stage", 1)) {
      const r = resolve(p);
      fieldMax = Math.max(fieldMax, lum(r.field));
      if (p.acc.every((v) => v === 0)) max = Math.max(max, lum(r.out));
    }
    expect(fieldMax).toBeLessThanOrEqual(RESOLVE.capStageL * (1 + 1e-6));
    expect(max).toBeLessThanOrEqual(RESOLVE.capStageL + ditherL(RESOLVE.capStageL));
    // A stage field that is under the cap passes through unchanged (the cap is not a dimmer).
    const small: Px = { q: 1, zone: "stage", haze: [0, 0, 0], field: mul(hex(COLORS.wire), 0.05), acc: [0, 0, 0], lost: 0, ign: 0.5 };
    expect(resolve(small).out[2]).toBeCloseTo(add(BASE, small.field)[2], 6);
  });

  it(`lines and points never exceed the soft-clip ceiling L ${RESOLVE.softclipCeiling} anywhere`, () => {
    let max = 0;
    // q < 1 covers the quiet feather (top fade and vignette scale c the same way).
    for (const zone of ["column", "stage"] as const) for (const q of [1, 0.5, 0.1]) for (const p of samples(zone, q)) max = Math.max(max, lum(resolve(p).out));
    expect(max).toBeLessThanOrEqual(RESOLVE.softclipCeiling + ditherL(RESOLVE.softclipCeiling));
    // Ordering of the budgets themselves.
    expect(RESOLVE.quietMaxL).toBeLessThanOrEqual(RESOLVE.capColumnL);
    expect(RESOLVE.capColumnL).toBeLessThan(RESOLVE.capStageL);
    expect(RESOLVE.capStageL).toBeLessThan(RESOLVE.softclipKnee);
    expect(HAZE.peakL).toBeLessThan(RESOLVE.capColumnL);
  });
});
