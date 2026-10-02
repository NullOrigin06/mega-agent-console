import { describe, expect, it } from "vitest";
import { FLOW_LUT } from "../constants";
import { buildFlowLut, desaturate, hexToRgb, oklchToSrgb, relativeLuminance, sampleFlowLut, srgbToOklch, tintToward } from "../lut";
import { buildValueNoise } from "../noise";

const TOL = 2 / 255;
const W = FLOW_LUT.width;

function texel(lut: Uint8Array, row: number, i: number): number[] {
  const o = (row * W + i) * 4;
  return [lut[o] / 255, lut[o + 1] / 255, lut[o + 2] / 255];
}

function expectNear(actual: readonly number[], hex: string) {
  const want = hexToRgb(hex);
  for (let k = 0; k < 3; k++) expect(Math.abs(actual[k] - want[k])).toBeLessThanOrEqual(TOL);
}

describe("oklchToSrgb", () => {
  it("reproduces the spec stops", () => {
    FLOW_LUT.cold.forEach(([l, c, h], i) => expectNear(oklchToSrgb(l, c, h), FLOW_LUT.coldHex[i]));
    FLOW_LUT.hot.forEach(([l, c, h], i) => expectNear(oklchToSrgb(l, c, h), FLOW_LUT.hotHex[i]));
  });

  it("gamut-clips by chroma, keeping channels in 0..1", () => {
    const rgb = oklchToSrgb(0.7, 0.4, 140);
    for (const v of rgb) expect(v >= 0 && v <= 1).toBe(true);
    expect(Math.abs(srgbToOklch(rgb)[0] - 0.7)).toBeLessThan(0.02);
  });
});

describe("buildFlowLut", () => {
  const lut = buildFlowLut();

  it("is 64 x 2 RGBA8, opaque", () => {
    expect(lut.length).toBe(W * 2 * 4);
    for (let i = 3; i < lut.length; i += 4) expect(lut[i]).toBe(255);
  });

  it("hits the hex stops within 2/255", () => {
    expectNear(texel(lut, 0, 0), FLOW_LUT.coldHex[0]);
    expectNear(texel(lut, 0, W - 1), FLOW_LUT.coldHex[2]);
    expectNear(texel(lut, 1, 0), FLOW_LUT.hotHex[0]);
    expectNear(texel(lut, 1, W - 1), FLOW_LUT.hotHex[2]);
    expectNear(sampleFlowLut(0, 0.5), FLOW_LUT.coldHex[1]);
    expectNear(sampleFlowLut(1, 0.5), FLOW_LUT.hotHex[1]);
  });

  it("caps hot chroma at 0.075 and keeps both rows at flat luminance", () => {
    for (let i = 0; i <= 256; i++) {
      const u = i / 256;
      expect(srgbToOklch(sampleFlowLut(1, u))[1]).toBeLessThanOrEqual(FLOW_LUT.hotChromaMax + 1e-4);
      const yc = relativeLuminance(sampleFlowLut(0, u));
      const yh = relativeLuminance(sampleFlowLut(1, u));
      expect(yc).toBeGreaterThanOrEqual(0.34);
      expect(yc).toBeLessThanOrEqual(0.4);
      expect(yh).toBeGreaterThanOrEqual(0.385);
      expect(yh).toBeLessThanOrEqual(0.42);
    }
  });

  it("never lets the two ramps meet (hue gap)", () => {
    for (let i = 0; i < W; i++) {
      const hc = srgbToOklch(texel(lut, 0, i))[2];
      const hh = srgbToOklch(texel(lut, 1, i))[2];
      expect(hc).toBeGreaterThan(240);
      expect(hh).toBeLessThan(95);
    }
  });
});

describe("tints", () => {
  it("desaturates at equal lightness", () => {
    const base = hexToRgb("#06b6d4");
    const d = desaturate(base, 0.85);
    expect(srgbToOklch(d)[1]).toBeLessThan(srgbToOklch(base)[1] * 0.2);
    expect(Math.abs(srgbToOklch(d)[0] - srgbToOklch(base)[0])).toBeLessThan(0.01);
  });

  it("shifts hue toward a module colour at equal L", () => {
    const base = hexToRgb("#0b1a33");
    const t = tintToward(base, "#199e70", 0.25);
    expect(Math.abs(srgbToOklch(t)[0] - srgbToOklch(base)[0])).toBeLessThan(0.01);
    expect(t).not.toEqual(base);
  });
});

describe("buildValueNoise", () => {
  it("is 128^2, deterministic, full-range and tileable", () => {
    const a = buildValueNoise();
    const b = buildValueNoise();
    expect(a.length).toBe(128 * 128);
    expect(a).toEqual(b);
    expect(Math.min(...a)).toBe(0);
    expect(Math.max(...a)).toBe(255);
    // Wrap seam: last column vs first column differs no more than any interior neighbour step.
    let interior = 0;
    let seam = 0;
    for (let y = 0; y < 128; y++) {
      interior = Math.max(interior, Math.abs(a[y * 128 + 64] - a[y * 128 + 63]));
      seam = Math.max(seam, Math.abs(a[y * 128] - a[y * 128 + 127]));
    }
    expect(seam).toBeLessThanOrEqual(Math.max(interior, 40));
  });
});
