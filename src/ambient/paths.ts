/**
 * Flow paths for the sprite pass, arclength-parametrised and packed into one
 * RGBA32F texture (PATH_SAMPLES texels per path, x,y,z twin-local + w = arclength
 * fraction). The vertex shader reads path(fract(seed + phase * speedScale)).
 *
 * - shell: hot serpentine streamlines from N1 (rear) to N2 (front), cosine
 *   peaks locked to the baffle stations, crossing each window at +-0.72R.
 * - tube: cold lanes (axis + hex ring at 0.45R), front -> rear.
 * - process: P1 supply, P2 return, P3/P4 risers (from twinGeometry.processPolylines).
 *
 * Pure TypeScript; rebuilt only on a spec or pose change.
 */
import { PATHS, PATH_KIND } from "./constants";
import { baffleStations, baffleWindowSign, nozzleDir, processPolylines, tubeFieldRadius, vesselLayout } from "./twinGeometry";
import type { PoseName, VesselModel } from "./types";

export const PATH_SAMPLES = PATHS.samples;

export interface Range {
  start: number;
  count: number;
}

export interface FlowPaths {
  /** PATH_SAMPLES * pathCount * 4: x,y,z twin-local, w = arclength fraction 0..1. */
  data: Float32Array;
  pathCount: number;
  /** Serpentine streamlines (12), rear N1 -> front N2. Empty in FACE and BONNET (hidden). PORTHOLE: vertical crossflow. */
  shell: Range;
  /** Tube lanes, front -> rear, ordered so any prefix is well spread (T2/T1 use the first 5). PORTHOLE: the cold annulus. */
  tube: Range;
  /** P1, P2, P3/P4 (whichever the pose keeps). PORTHOLE: the hot annulus. */
  process: Range;
  /** World arclength per path (twin-local units) for px/s -> phase/s conversion. */
  lengths: Float32Array;
  /** PATH_KIND per path (colour row, LUT end and speed for the sprite pass). */
  kinds: Uint8Array;
  /** 1 for closed loops (porthole annuli): sample w wraps, no end fade. */
  closed: Uint8Array;
}

type V3 = [number, number, number];

interface RawPath {
  kind: number;
  points: V3[];
  closed: boolean;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Cosine interpolation through (xs, ys): zero slope at every station, so peaks sit on the baffles. */
function cosineProfile(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) {
      const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1] || 1);
      return ys[i - 1] + ((ys[i] - ys[i - 1]) * (1 - Math.cos(Math.PI * t))) / 2;
    }
  }
  return ys[ys.length - 1];
}

function shellStreamlines(model: VesselModel): RawPath[] {
  const R = 0.5;
  const L = model.length;
  const h = L / 2;
  const n1 = model.nozzles[0];
  const n2 = model.nozzles[model.nozzles.length - 1];
  const xIn = n1 ? -h + n1.xFrac * L : -h + PATHS.nozzleFrac * L;
  const xOut = n2 && model.nozzles.length > 1 ? -h + n2.xFrac * L : h - PATHS.nozzleFrac * L;
  const dIn = nozzleDir(n1?.angleDeg ?? 0);
  const dOut = nozzleDir(n2?.angleDeg ?? 0);
  const endR = R * 1.05;
  const xs = [xIn];
  const ys = [dIn[1] * R * 0.9];
  baffleStations(model).forEach((x, i) => {
    if (x <= xIn || x >= xOut) return;
    xs.push(x);
    ys.push(baffleWindowSign(model, i) * PATHS.windowYR * R);
  });
  xs.push(xOut);
  ys.push(dOut[1] * R * 0.9);

  const count = PATHS.shellStreamlines;
  const raw = PATHS.rawSamples;
  // Converge into the nozzles quickly enough that the first/last window crossings stay intact.
  const gapIn = xs.length > 2 ? xs[1] - xIn : xOut - xIn;
  const gapOut = xs.length > 2 ? xOut - xs[xs.length - 2] : xOut - xIn;
  const blendIn = Math.min(0.08 * L, 0.6 * gapIn);
  const blendOut = Math.min(0.08 * L, 0.6 * gapOut);
  const out: RawPath[] = [];
  for (let i = 0; i < count; i++) {
    const s0 = -PATHS.shellOffsetMax + (2 * PATHS.shellOffsetMax * i) / (count - 1);
    // Stratified transverse squash, decorrelated from the lateral offset.
    const squash = 1 - 0.22 * (((i * 7) % count) / (count - 1));
    const points: V3[] = [];
    for (let k = 0; k <= raw; k++) {
      const x = xIn + ((xOut - xIn) * k) / raw;
      const yc = cosineProfile(xs, ys, x) * squash;
      const zc = (s0 / PATHS.shellOffsetMax) * PATHS.lateralR * R * Math.sqrt(Math.max(0, 1 - (yc / R) ** 2));
      // Converge into the nozzle necks at both ends.
      const eIn = smoothstep(xIn, xIn + blendIn, x);
      const eOut = smoothstep(xOut, xOut - blendOut, x);
      const end = eIn < eOut ? dIn : dOut;
      const e = Math.min(eIn, eOut);
      points.push([x, end[1] * endR + (yc - end[1] * endR) * e, end[2] * endR + (zc - end[2] * endR) * e]);
    }
    out.push({ kind: PATH_KIND.SHELL, points, closed: false });
  }
  return out;
}

function laneCount(tubeQty: number): number {
  if (tubeQty >= 100) return 7;
  if (tubeQty >= 30) return 5;
  if (tubeQty >= 10) return 3;
  return 1;
}

function tubeLanes(model: VesselModel, pose: PoseName): RawPath[] {
  const lay = vesselLayout(model, pose);
  const R = 0.5;
  const x0 = lay.front.face + model.flangeThk;
  const x1 = lay.rear.face - model.flangeThk;
  const lanes: Array<[number, number]> = [];
  if (pose === "section") {
    // Side view: 7 lanes spread vertically so they read as literal counter-flow lanes.
    for (const k of [0, -1, 1, -2, 2, -3, 3]) lanes.push([(k / 3) * PATHS.sectionLaneSpreadR * R, 0]);
  } else if (pose === "face") {
    // End-on: particles emerge from a hex of mouths and recede into fog.
    const pitch = tubeFieldRadius(model) / 2.4;
    for (let r = -2; r <= 2; r++) {
      for (let q = -2; q <= 2; q++) {
        if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) > 2) continue;
        lanes.push([r * pitch * (Math.sqrt(3) / 2), (q + r / 2) * pitch]);
      }
    }
  } else {
    lanes.push([0, 0]);
    // Ring order makes every prefix balanced: 3 -> opposed pair, 5 -> two pairs.
    for (const deg of [30, 210, 90, 270, 150, 330]) {
      const a = (deg * Math.PI) / 180;
      lanes.push([PATHS.laneRingR * R * Math.cos(a), -PATHS.laneRingR * R * Math.sin(a)]);
    }
  }
  const n = pose === "face" ? lanes.length : Math.min(PATHS.tubeLanes, laneCount(model.tubeQty));
  return lanes.slice(0, n).map(([y, z]) => ({ kind: PATH_KIND.TUBE, points: [[x0, y, z] as V3, [x1, y, z] as V3], closed: false }));
}

function processPaths(model: VesselModel, pose: PoseName): RawPath[] {
  const kinds = { P1: PATH_KIND.SUPPLY, P2: PATH_KIND.RETURN, P3: PATH_KIND.RISER_IN, P4: PATH_KIND.RISER_OUT };
  return processPolylines(model, pose).map((l) => ({ kind: kinds[l.id], points: l.points, closed: false }));
}

function portholePaths(model: VesselModel): { shell: RawPath[]; tube: RawPath[]; process: RawPath[] } {
  const R = 0.5;
  const lay = vesselLayout(model, "porthole");
  const stations = baffleStations(model);
  const lastBaffle = stations.length ? stations[stations.length - 1] : lay.rear.face;
  const xMid = (lay.front.face + lastBaffle) / 2;
  const chordY = R - model.baffleCut;
  const shell: RawPath[] = [];
  const n = PATHS.portholeCrossflow;
  for (let i = 0; i < n; i++) {
    const z = (-1 + (2 * (i + 0.5)) / n) * 0.6 * R;
    shell.push({ kind: PATH_KIND.SHELL, points: [[xMid, -chordY, z], [xMid, chordY, z]], closed: false });
  }
  // Viewed from the front, increasing phi (top -> right) is clockwise on screen.
  const ring = (r: number, clockwise: boolean, kind: number): RawPath => {
    const pts: V3[] = [];
    const segs = 96;
    const x = lay.front.face + 0.02;
    for (let k = 0; k <= segs; k++) {
      const p = ((clockwise ? 1 : -1) * Math.PI * 2 * k) / segs;
      pts.push([x, r * R * Math.cos(p), -r * R * Math.sin(p)]);
    }
    return { kind, points: pts, closed: true };
  };
  return {
    shell,
    tube: [ring(PATHS.portholeColdR, false, PATH_KIND.COLD_RING)],
    process: [ring(PATHS.portholeHotR, true, PATH_KIND.HOT_RING)],
  };
}

/** Resamples a polyline to PATH_SAMPLES points at equal arclength; returns its length. */
function resample(points: V3[], out: Float32Array, offset: number): number {
  const cum = new Float64Array(points.length);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    cum[i] = cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  const total = cum[points.length - 1];
  let seg = 1;
  for (let k = 0; k < PATH_SAMPLES; k++) {
    const s = (total * k) / (PATH_SAMPLES - 1);
    while (seg < points.length - 1 && cum[seg] < s) seg++;
    const a = points[seg - 1];
    const b = points[Math.min(seg, points.length - 1)];
    const span = cum[seg] - cum[seg - 1];
    const t = span > 0 ? (s - cum[seg - 1]) / span : 0;
    const o = offset + k * 4;
    out[o] = a[0] + (b[0] - a[0]) * t;
    out[o + 1] = a[1] + (b[1] - a[1]) * t;
    out[o + 2] = a[2] + (b[2] - a[2]) * t;
    out[o + 3] = total > 0 ? s / total : 0;
  }
  return total;
}

export function buildFlowPaths(model: VesselModel, pose: PoseName): FlowPaths {
  let shell: RawPath[];
  let tube: RawPath[];
  let process: RawPath[];
  if (pose === "porthole") {
    ({ shell, tube, process } = portholePaths(model));
  } else {
    // Shell-side flow is hidden in FACE and BONNET (warm colour never competes with the bonnet tint).
    shell = pose === "face" || pose === "bonnet" ? [] : shellStreamlines(model);
    tube = tubeLanes(model, pose);
    process = processPaths(model, pose);
  }
  const all = [...shell, ...tube, ...process].slice(0, PATHS.maxPaths);
  const data = new Float32Array(PATH_SAMPLES * all.length * 4);
  const lengths = new Float32Array(all.length);
  const kinds = new Uint8Array(all.length);
  const closed = new Uint8Array(all.length);
  all.forEach((p, i) => {
    lengths[i] = resample(p.points, data, i * PATH_SAMPLES * 4);
    kinds[i] = p.kind;
    closed[i] = p.closed ? 1 : 0;
  });
  const cap = (start: number, count: number): Range => ({ start: Math.min(start, all.length), count: Math.max(0, Math.min(count, all.length - start)) });
  return {
    data,
    pathCount: all.length,
    shell: cap(0, shell.length),
    tube: cap(shell.length, tube.length),
    process: cap(shell.length + tube.length, process.length),
    lengths,
    kinds,
    closed,
  };
}

/**
 * Samples path `index` at arclength fraction u (0..1, wrapped for closed paths)
 * into out (x, y, z). For the Canvas2D still and tests; the GPU does the same.
 */
export function samplePath(paths: FlowPaths, index: number, u: number, out: V3 | Float32Array): void {
  const f = paths.closed[index] ? u - Math.floor(u) : Math.min(1, Math.max(0, u));
  const pos = f * (PATH_SAMPLES - 1);
  const k = Math.min(PATH_SAMPLES - 2, Math.floor(pos));
  const t = pos - k;
  const o = (index * PATH_SAMPLES + k) * 4;
  const d = paths.data;
  out[0] = d[o] + (d[o + 4] - d[o]) * t;
  out[1] = d[o + 1] + (d[o + 5] - d[o + 1]) * t;
  out[2] = d[o + 2] + (d[o + 6] - d[o + 2]) * t;
}
