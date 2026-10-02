/**
 * Tileable value noise for the haze pass, baked once on the CPU (~1 ms) and
 * uploaded as an R8 REPEAT texture. Two periodic lattice octaves (cell 8 and
 * cell 4 texels) with quintic interpolation; the shader takes 3 taps per
 * octave of its own fBm on top. Deterministic (seeded), so stills match.
 */

/** mulberry32 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

function octave(size: number, cells: number, random: () => number, out: Float32Array, weight: number) {
  const lattice = new Float32Array(cells * cells);
  for (let i = 0; i < lattice.length; i++) lattice[i] = random();
  const cell = size / cells;
  for (let y = 0; y < size; y++) {
    const gy = y / cell;
    const y0 = Math.floor(gy);
    const fy = fade(gy - y0);
    const r0 = (y0 % cells) * cells;
    const r1 = ((y0 + 1) % cells) * cells;
    for (let x = 0; x < size; x++) {
      const gx = x / cell;
      const x0 = Math.floor(gx);
      const fx = fade(gx - x0);
      const c0 = x0 % cells;
      const c1 = (x0 + 1) % cells;
      const top = lattice[r0 + c0] + (lattice[r0 + c1] - lattice[r0 + c0]) * fx;
      const bottom = lattice[r1 + c0] + (lattice[r1 + c1] - lattice[r1 + c0]) * fx;
      out[y * size + x] += (top + (bottom - top) * fy) * weight;
    }
  }
}

/** size^2 R8 tileable value noise (size must be a multiple of 8; default 128). */
export function buildValueNoise(size = 128, seed = 0x5eed): Uint8Array {
  const n = Math.max(8, Math.round(size / 8) * 8);
  const acc = new Float32Array(n * n);
  const random = rng(seed);
  octave(n, n / 8, random, acc, 2 / 3);
  octave(n, n / 4, random, acc, 1 / 3);
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of acc) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const out = new Uint8Array(n * n);
  const span = hi - lo || 1;
  for (let i = 0; i < acc.length; i++) out[i] = Math.round(((acc[i] - lo) / span) * 255);
  return out;
}
