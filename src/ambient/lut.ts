/**
 * Colour maths for the ambient: OKLab/OKLCH <-> sRGB, the 64 x 2 flow LUT
 * (row 0 cold tube-side, row 1 hot shell-side, explicit hue paths at flat
 * luminance so the two ramps never meet), equal-L module tints and the
 * "signal lost" desaturation. Pure TypeScript.
 */
import { FLOW_LUT } from "./constants";

export type RGB = [number, number, number];

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linearToSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/** '#rrggbb' -> [r, g, b] in 0..1 (sRGB-encoded). */
export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(rgb: readonly number[]): string {
  return "#" + rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");
}

/** WCAG relative luminance of an sRGB-encoded colour. */
export function relativeLuminance(rgb: readonly number[]): number {
  return 0.2126 * srgbToLinear(rgb[0]) + 0.7152 * srgbToLinear(rgb[1]) + 0.0722 * srgbToLinear(rgb[2]);
}

/** Linear-light sRGB -> OKLab. */
function linearToOklab(r: number, g: number, b: number): RGB {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** OKLab -> linear-light sRGB (unclipped). */
function oklabToLinear(L: number, a: number, b: number): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

export function srgbToOklab(rgb: readonly number[]): RGB {
  return linearToOklab(srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2]));
}

export function oklabToSrgb(lab: readonly number[]): RGB {
  const lin = oklabToLinear(lab[0], lab[1], lab[2]);
  return [linearToSrgb(Math.min(1, Math.max(0, lin[0]))), linearToSrgb(Math.min(1, Math.max(0, lin[1]))), linearToSrgb(Math.min(1, Math.max(0, lin[2])))];
}

/** sRGB -> [L, C, hueDeg]. */
export function srgbToOklch(rgb: readonly number[]): RGB {
  const [L, a, b] = srgbToOklab(rgb);
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}

const inGamut = (lin: RGB) => lin.every((v) => v >= -1e-5 && v <= 1 + 1e-5);

/** OKLCH -> sRGB 0..1. Out-of-gamut colours keep L and hue and lose chroma (bisection), then clamp. */
export function oklchToSrgb(l: number, c: number, hDeg: number): RGB {
  const h = (hDeg * Math.PI) / 180;
  const at = (cc: number) => oklabToLinear(l, cc * Math.cos(h), cc * Math.sin(h));
  let lin = at(c);
  if (!inGamut(lin)) {
    let lo = 0;
    let hi = c;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(at(mid))) lo = mid;
      else hi = mid;
    }
    lin = at(lo);
  }
  return [linearToSrgb(Math.min(1, Math.max(0, lin[0]))), linearToSrgb(Math.min(1, Math.max(0, lin[1]))), linearToSrgb(Math.min(1, Math.max(0, lin[2])))];
}

type Stops = ReadonlyArray<readonly [number, number, number]>;

/** Interpolates L, C and hue linearly between stops (the explicit hue path), u in 0..1. */
function lchAt(stops: Stops, u: number): RGB {
  const t = Math.min(1, Math.max(0, u)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  const f = t - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Float sample of a flow LUT row (0 cold, 1 hot) at u in 0..1, sRGB 0..1. */
export function sampleFlowLut(row: 0 | 1, u: number): RGB {
  const [l, c, h] = lchAt(row === 0 ? FLOW_LUT.cold : FLOW_LUT.hot, u);
  return oklchToSrgb(l, row === 1 ? Math.min(c, FLOW_LUT.hotChromaMax) : c, h);
}

/** 64 x 2 RGBA8 (row 0 cold #5aa3ec -> #86a1ed -> #a5a2e7, row 1 hot #c2a975 -> #c4a580 -> #c1a28a). */
export function buildFlowLut(): Uint8Array {
  const w = FLOW_LUT.width;
  const out = new Uint8Array(w * 2 * 4);
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < w; i++) {
      const rgb = sampleFlowLut(row as 0 | 1, i / (w - 1));
      const o = (row * w + i) * 4;
      out[o] = Math.round(rgb[0] * 255);
      out[o + 1] = Math.round(rgb[1] * 255);
      out[o + 2] = Math.round(rgb[2] * 255);
      out[o + 3] = 255;
    }
  }
  return out;
}

/**
 * Reduces chroma by `amount` (0..1) in OKLab at equal L - the apiOk=false
 * "colour drains out" (-85%). Returns sRGB 0..1.
 */
export function desaturate(rgb: readonly number[], amount: number): RGB {
  const [L, a, b] = srgbToOklab(rgb);
  const k = 1 - Math.min(1, Math.max(0, amount));
  return oklabToSrgb([L, a * k, b * k]);
}

/**
 * Shifts a colour's chroma toward a module hue at equal L (workspace tints:
 * 25% TubeSheet / HX Fab, 15% BonnetFlange; region tints <= 30%).
 */
export function tintToward(rgb: readonly number[], targetHex: string, amount: number): RGB {
  const [L, a, b] = srgbToOklab(rgb);
  const t = srgbToOklab(hexToRgb(targetHex));
  const k = Math.min(1, Math.max(0, amount));
  const tc = Math.hypot(t[1], t[2]) || 1;
  // Keep the source's chroma magnitude scale, steer its direction toward the target hue.
  const sc = Math.max(Math.hypot(a, b), tc * 0.15);
  return oklabToSrgb([L, a + ((t[1] / tc) * sc - a) * k, b + ((t[2] / tc) * sc - b) * k]);
}
