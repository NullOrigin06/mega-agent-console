/**
 * The holographic twin as data: VesselSpec -> normalised VesselModel ->
 * region-tagged line segments (twin-local units, D = 1) plus the point sets
 * the sprite pass needs (face mouths, X-ray dots, bolt circles).
 *
 * Pure TypeScript - no DOM, no GL. Rebuilt only on a spec, LOD or pose change.
 * Angles around the axis follow VesselViewport3D: phi = 0 is the top and
 * phi = 90 is "right, looking from the front", i.e. p(phi) = (x, r cos phi, -r sin phi)
 * (the front is at +X here, so "right" is -Z).
 */
import type { VesselSpec } from "../components/cad/vesselSpec";
import { ALPHA_CLASS, ALPHA_CLASS_COUNT, CLASS_ALPHA, EVENT_RINGS, LOD, PATHS, POSES, POSE_CLASS_ALPHA, VESSEL_CLAMP, WIRE } from "./constants";
import { REGION_BONNET, REGION_NEUTRAL, REGION_SHELL, REGION_TUBESHEET } from "./types";
import type { PoseName, Rect, TwinRegion, VesselModel } from "./types";

/** Floats per segment: x0,y0,z0, x1,y1,z1 (twin-local), region (0..3), alphaClass (ALPHA_CLASS id). */
export const SEG_STRIDE = 8;

/** A bolt circle in the YZ plane at x = center[0]. */
export interface BoltCircle {
  center: [number, number, number];
  radius: number;
  /** Bolts actually drawn (boltQty, or every 2nd when they would crowd). */
  count: number;
}

export interface TwinLod {
  meridians: number;
  ringSegments: number;
  shellRings: number;
  boltCount: number;
  /** Hex-ring count n of the face mouths (0 = no mouths); mouthCount = 3n(n+1)+1. */
  mouthRingN: number;
  mouthCount: number;
}

export interface TwinGeometry {
  /**
   * segmentCount wire segments, then EVENT_RINGS.slots x EVENT_RINGS.segments
   * reserved (zeroed, class EVENT_RING) for writeEventRing + texSubImage.
   * Draw totalSegmentCount instances.
   */
  segments: Float32Array;
  segmentCount: number;
  totalSegmentCount: number;
  /** Two SILHOUETTE segments refreshed per frame by writeSilhouettes(). */
  silhouetteStart: number;
  eventRingStart: number;
  boltFront: BoltCircle;
  boltRear: BoltCircle;
  /** Stride 3, twin-local, on the front face (x = +L/2), ordered centre-out (ripple + ledger order). */
  faceMouths: Float32Array;
  faceMouthCount: number;
  /** Baffle stations (twin-local x), rear to front. */
  baffleX: number[];
  /** Stride 3, 37 per baffle (hex ring n = 3). */
  xrayDots: Float32Array;
  xrayDotCount: number;
  lod: TwinLod;
}

// ---------------------------------------------------------------- VesselSpec -> VesselModel

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finite = (v: number, fallback: number) => (Number.isFinite(v) && v > 0 ? v : fallback);

/** Normalises a VesselSpec to D = 1 and applies the spec clamps (plus sanity bounds on the rest). */
export function toVesselModel(spec: VesselSpec): VesselModel {
  const D = finite(spec.shellId, 800);
  const tubeSheetOD = clamp(finite(spec.tubeSheetOD, D * 1.19) / D, 1.02, 1.6);
  const nozzles = (spec.nozzles ?? []).slice(0, 8);
  const count = nozzles.length;
  return {
    length: clamp(finite(spec.tubeLength, D * 3.75) / D, VESSEL_CLAMP.lengthMin, VESSEL_CLAMP.lengthMax),
    bonnetFront: clamp(finite(spec.bonnetFrontLength, D * 0.625) / D, VESSEL_CLAMP.headDepth + 0.1, 1.5),
    bonnetRear: clamp(finite(spec.bonnetRearLength, D * 0.625) / D, VESSEL_CLAMP.headDepth + 0.1, 1.5),
    tubeSheetOD,
    flangeOD: tubeSheetOD,
    flangeThk: clamp(finite(spec.flangeThk, D * 0.045) / D, 0.01, 0.15),
    tubeSheetThk: clamp(finite(spec.tubeSheetThk, D * 0.031) / D, 0.01, 0.15),
    boltPCD: clamp(finite(spec.boltPCD, D * 1.125) / D, 1.01, tubeSheetOD - 0.01),
    boltQty: Math.round(clamp(finite(spec.boltQty, 24), VESSEL_CLAMP.boltMin, VESSEL_CLAMP.boltMax)),
    baffleQty: Math.round(clamp(Number.isFinite(spec.baffleQty) ? spec.baffleQty : 6, 0, VESSEL_CLAMP.baffleMax)),
    baffleCut: 0.25,
    tubeQty: Math.max(1, Math.round(finite(spec.tubeQty, 420))),
    tubeOD: clamp(finite(spec.tubeOD, D * 0.024) / D, 0.004, 0.1),
    nozzles: nozzles.map((n, i) => ({
      id: n.id,
      xFrac: count === 1 ? 0.5 : VESSEL_CLAMP.nozzleFracMin + ((VESSEL_CLAMP.nozzleFracMax - VESSEL_CLAMP.nozzleFracMin) * i) / (count - 1),
      angleDeg: (((Number.isFinite(n.angleDeg) ? n.angleDeg : 0) % 360) + 360) % 360,
      od: clamp(finite(n.sizeMm, 100) / D, VESSEL_CLAMP.nozzleOdMin, VESSEL_CLAMP.nozzleOdMax),
    })),
    jobId: spec.jobId,
  };
}

// ---------------------------------------------------------------- shared layout

export interface VesselSide {
  /** Tube-sheet outer face (channel side). */
  face: number;
  sheetBack: number;
  shellFlangeBack: number;
  /** Channel flange, shell side / outer face (where the bolt circle sits). */
  channelFlangeBack: number;
  channelFlange: number;
  /** Channel cylinder end = start of the 2:1 head. */
  cylEnd: number;
  /** Head apex. */
  tip: number;
  /** Axial channel nozzle end (P1 / P2 connection). */
  axialNozzle: number;
}

export interface VesselLayout {
  halfL: number;
  front: VesselSide;
  rear: VesselSide;
  /** Bonnet pose explodes the front channel by 1.1R along +X. */
  explode: number;
  showFrontBonnet: boolean;
  showFrontHead: boolean;
  saddleX: number[];
}

function side(model: VesselModel, sign: 1 | -1, explode: number, bonnet: number): VesselSide {
  const h = model.length / 2;
  const fl = model.flangeThk;
  const ts = model.tubeSheetThk;
  return {
    face: sign * h,
    sheetBack: sign * (h - ts),
    shellFlangeBack: sign * (h - ts - fl),
    channelFlangeBack: sign * (h + explode),
    channelFlange: sign * (h + fl + explode),
    cylEnd: sign * (h + fl + explode + Math.max(0.08, bonnet - VESSEL_CLAMP.headDepth)),
    tip: sign * (h + fl + explode + Math.max(0.08, bonnet - VESSEL_CLAMP.headDepth) + VESSEL_CLAMP.headDepth),
    axialNozzle: sign * (h + fl + explode + Math.max(0.08, bonnet - VESSEL_CLAMP.headDepth) + VESSEL_CLAMP.headDepth + 0.12),
  };
}

/**
 * Key x stations of the twin for a pose. The bonnet length includes its
 * 2:1 head (that is what puts the front tip at ~90.6% in OVERVIEW at 1440).
 */
export function vesselLayout(model: VesselModel, pose: PoseName): VesselLayout {
  const explode = pose === "bonnet" ? VESSEL_CLAMP.explodeR * 0.5 : 0;
  const L = model.length;
  return {
    halfL: L / 2,
    front: side(model, 1, explode, model.bonnetFront),
    rear: side(model, -1, 0, model.bonnetRear),
    explode,
    // FACE: the front bonnet is "exploded out of frame" (simply not drawn).
    showFrontBonnet: pose !== "face",
    // PORTHOLE: the front channel is an open rim, so the tunnel reads through it.
    showFrontHead: pose !== "face" && pose !== "porthole",
    saddleX: VESSEL_CLAMP.saddleFracs.map((f) => -L / 2 + f * L),
  };
}

/** Baffle stations L(i+1)/(n+1) from the rear sheet. */
export function baffleStations(model: VesselModel): number[] {
  const n = model.baffleQty;
  const L = model.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(-L / 2 + (L * (i + 1)) / (n + 1));
  return out;
}

/** Unit direction of a nozzle (angle 0 = up, 90 = right looking from the front). */
export function nozzleDir(angleDeg: number): [number, number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [0, Math.cos(a), -Math.sin(a)];
}

/**
 * +1 if baffle i's window (the cut) is at the top, -1 at the bottom.
 * Windows alternate, the first one opposite the inlet nozzle N1, so the
 * shell-side stream crosses the bundle before its first window.
 */
export function baffleWindowSign(model: VesselModel, i: number): 1 | -1 {
  const n1 = model.nozzles[0];
  const inletUp = n1 ? nozzleDir(n1.angleDeg)[1] >= 0 : true;
  const first = inletUp ? -1 : 1;
  return (i % 2 === 0 ? first : -first) as 1 | -1;
}

/** Usable tube-field radius (VesselViewport3D tubePositions rule: baffle radius minus one tube OD). */
export function tubeFieldRadius(model: VesselModel): number {
  return clamp(0.5 - model.tubeOD, 0.3, 0.5);
}

/**
 * Process lines (twin-local polylines in flow order), shared by the wire
 * (PIPE segments) and paths.ts (particles):
 * P1 supply -> front axial nozzle, P2 rear axial nozzle -> 0.4D out -> up,
 * P3 riser -> N1, N2 -> P4 riser. Poses drop what would face the camera.
 */
export function processPolylines(model: VesselModel, pose: PoseName): Array<{ id: "P1" | "P2" | "P3" | "P4"; points: Array<[number, number, number]> }> {
  if (pose === "porthole") return [];
  const lay = vesselLayout(model, pose);
  const run = PATHS.processRunD;
  const out: Array<{ id: "P1" | "P2" | "P3" | "P4"; points: Array<[number, number, number]> }> = [];
  if (pose !== "face") {
    const x = lay.front.axialNozzle;
    out.push({ id: "P1", points: [[x + run, 0, 0], [x, 0, 0]] });
  }
  if (pose !== "bonnet") {
    const x = lay.rear.axialNozzle;
    const elbow = x - PATHS.p2OffsetD;
    out.push({ id: "P2", points: [[x, 0, 0], [elbow, 0, 0], [elbow, run, 0]] });
  }
  if (pose !== "bonnet" && model.nozzles.length > 0) {
    const risers: Array<{ id: "P3" | "P4"; n: VesselModel["nozzles"][number]; inward: boolean }> = [{ id: "P3", n: model.nozzles[0], inward: true }];
    if (model.nozzles.length > 1) risers.push({ id: "P4", n: model.nozzles[model.nozzles.length - 1], inward: false });
    for (const r of risers) {
      const d = nozzleDir(r.n.angleDeg);
      const x = -lay.halfL + r.n.xFrac * model.length;
      const r0 = 0.5 + VESSEL_CLAMP.nozzleProjectionR * 0.5 + r.n.od;
      const r1 = r0 + PATHS.riserLengthD;
      const a: [number, number, number] = [x, d[1] * r0, d[2] * r0];
      const b: [number, number, number] = [x, d[1] * r1, d[2] * r1];
      out.push({ id: r.id, points: r.inward ? [b, a] : [a, b] });
    }
  }
  return out;
}

// ---------------------------------------------------------------- LOD

const hexCount = (n: number) => (n <= 0 ? 0 : 3 * n * (n + 1) + 1);

/** LOD from the projected shell radius R_px (spec layer 6). */
export function twinLod(model: VesselModel, shellRadiusPx: number, pose: PoseName): TwinLod {
  const R = Math.max(1, shellRadiusPx);
  const a = (POSES[pose].offAxisDeg * Math.PI) / 180;
  const axisF = Math.max(Math.sin(a), 0.05);
  const faceF = (1 + Math.cos(a)) / 2;
  const meridians = clamp(Math.round(R / LOD.meridianDivisor), LOD.meridianMin, LOD.meridianMax);
  const ringSegments = clamp(Math.round((2 * Math.PI * R) / LOD.ringSegDivisor), LOD.ringSegMin, LOD.ringSegMax);
  const ringSpacing = (model.length / (LOD.shellRingsDense - 1)) * 2 * R * axisF;
  const shellRings = ringSpacing >= LOD.shellRingMinSpacingPx ? LOD.shellRingsDense : LOD.shellRingsSparse;
  const boltSpacing = ((Math.PI * model.boltPCD * 2 * R) / model.boltQty) * faceF;
  const boltCount = boltSpacing >= LOD.boltMinSpacingPx ? model.boltQty : Math.ceil(model.boltQty / 2);
  let mouthRingN = 0;
  if (pose !== "section" && pose !== "porthole") {
    const fieldPx = tubeFieldRadius(model) * 2 * R * faceF;
    mouthRingN = LOD.mouthRings[0];
    for (const n of LOD.mouthRings) if (fieldPx / n >= LOD.mouthMinPitchPx) mouthRingN = n;
  }
  return { meridians, ringSegments, shellRings, boltCount, mouthRingN, mouthCount: hexCount(mouthRingN) };
}

/** Wire segment budget: min(tier max, clamp(bboxArea / 30, 600, 1900)). */
export function segmentBudget(twinBox: Rect, tierWireMax: number): number {
  const byArea = clamp(Math.round((Math.max(0, twinBox.w) * Math.max(0, twinBox.h)) / LOD.areaPerSegment), LOD.segmentsMin, LOD.segmentsMax);
  return Math.min(tierWireMax, byArea);
}

/** Alpha per ALPHA_CLASS id for a pose (CLASS_ALPHA + POSE_CLASS_ALPHA), for the UBO. */
export function classAlphaTable(pose: PoseName): Float32Array {
  const out = new Float32Array(ALPHA_CLASS_COUNT);
  for (let i = 0; i < ALPHA_CLASS_COUNT; i++) out[i] = CLASS_ALPHA[i] ?? 0;
  for (const [k, v] of Object.entries(POSE_CLASS_ALPHA[pose])) if (v !== undefined) out[Number(k)] = v;
  return out;
}

// ---------------------------------------------------------------- segment builder

interface Detail {
  meridians: number;
  ringSegments: number;
  shellRings: number;
  /** Shell-flange back rings and the inner tube-sheet rings. */
  stackRings: boolean;
  bonnetMeridians: number;
  headRings: number;
}

type Push = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, region: TwinRegion, cls: number) => void;

function arc(push: Push, x: number, r: number, segs: number, region: TwinRegion, cls: number, phi0 = 0, phi1 = Math.PI * 2) {
  const n = Math.max(1, segs);
  let py = r * Math.cos(phi0);
  let pz = -r * Math.sin(phi0);
  for (let i = 1; i <= n; i++) {
    const p = phi0 + ((phi1 - phi0) * i) / n;
    const y = r * Math.cos(p);
    const z = -r * Math.sin(p);
    push(x, py, pz, x, y, z, region, cls);
    py = y;
    pz = z;
  }
}

function buildSegments(model: VesselModel, pose: PoseName, d: Detail, push: Push) {
  const lay = vesselLayout(model, pose);
  const h = lay.halfL;
  const R = 0.5;
  const ring = d.ringSegments;
  const tsR = model.tubeSheetOD / 2;
  const flR = model.flangeOD / 2;
  const TWO_PI = Math.PI * 2;

  // Silhouette placeholders first (writeSilhouettes fills them per frame).
  push(0, 0, 0, 0, 0, 0, REGION_SHELL, ALPHA_CLASS.SILHOUETTE);
  push(0, 0, 0, 0, 0, 0, REGION_SHELL, ALPHA_CLASS.SILHOUETTE);

  if (pose === "porthole") {
    // End-on tunnel: bonnet rim, flange, tube sheet, the two front-most baffle arcs.
    const f = lay.front;
    arc(push, f.cylEnd, R, ring, REGION_BONNET, ALPHA_CLASS.BONNET);
    arc(push, f.channelFlange, flR, ring, REGION_BONNET, ALPHA_CLASS.FLANGE);
    arc(push, f.face, tsR, ring, REGION_TUBESHEET, ALPHA_CLASS.TUBESHEET);
    const stations = baffleStations(model);
    for (let k = 0; k < Math.min(2, stations.length); k++) {
      const i = stations.length - 1 - k;
      baffle(push, model, stations[i], baffleWindowSign(model, i), ring);
    }
    return;
  }

  const section = pose === "section";
  // Section pose: near-half cutaway, the camera is on +Z so the far half is z <= 0 (phi in [0, pi]).
  const ringSpan: [number, number] = section ? [0, Math.PI] : [0, TWO_PI];
  const ringSegs = section ? Math.ceil(ring / 2) : ring;

  // Shell rings.
  for (let k = 0; k < d.shellRings; k++) {
    const x = -h + (model.length * k) / (d.shellRings - 1);
    arc(push, x, R, ringSegs, REGION_SHELL, ALPHA_CLASS.SHELL_RING, ringSpan[0], ringSpan[1]);
  }
  // Meridians (shell generators).
  for (let k = 0; k < d.meridians; k++) {
    const p = (TWO_PI * k) / d.meridians;
    const y = R * Math.cos(p);
    const z = -R * Math.sin(p);
    const cls = section ? (z > 1e-6 ? ALPHA_CLASS.SECTION_NEAR : ALPHA_CLASS.SECTION_FAR) : ALPHA_CLASS.MERIDIAN;
    push(-h, y, z, h, y, z, REGION_SHELL, cls);
  }
  // Tube sheets.
  for (const s of [lay.front, lay.rear]) {
    arc(push, s.face, tsR, ring, REGION_TUBESHEET, ALPHA_CLASS.TUBESHEET);
    if (d.stackRings) arc(push, s.sheetBack, tsR, ring, REGION_TUBESHEET, ALPHA_CLASS.TUBESHEET);
  }
  // Flanges.
  for (const [s, shown] of [
    [lay.front, lay.showFrontBonnet],
    [lay.rear, true],
  ] as const) {
    if (shown) arc(push, s.channelFlange, flR, ring, REGION_BONNET, ALPHA_CLASS.FLANGE);
    if (d.stackRings) arc(push, s.shellFlangeBack, flR, ring, REGION_BONNET, ALPHA_CLASS.FLANGE);
  }
  // Section: the 7 tube lanes are literal horizontal lines.
  if (section) {
    for (let k = 0; k < PATHS.tubeLanes; k++) {
      const y = ((k - 3) / 3) * PATHS.sectionLaneSpreadR * R;
      push(lay.front.face, y, 0, lay.rear.face, y, 0, REGION_TUBESHEET, ALPHA_CLASS.LANE);
    }
  }
  // Bonnets.
  if (lay.showFrontBonnet) bonnet(push, lay.front, 1, d, ring, lay.showFrontHead, pose === "bonnet");
  bonnet(push, lay.rear, -1, d, ring, true, false);
  // Baffles.
  const stations = baffleStations(model);
  for (let i = 0; i < stations.length; i++) baffle(push, model, stations[i], baffleWindowSign(model, i), ring);
  // Shell nozzles.
  for (const n of model.nozzles) {
    const x = -h + n.xFrac * model.length;
    nozzle(push, [x, 0, 0], nozzleDir(n.angleDeg), 0.5 * 0.95, 0.5 + VESSEL_CLAMP.nozzleProjectionR * 0.5 + n.od, n.od, REGION_SHELL);
  }
  // Axial channel nozzles (P1 / P2 connections).
  if (lay.showFrontHead) nozzle(push, [lay.front.tip, 0, 0], [1, 0, 0], 0, 0.12, 0.08, REGION_BONNET);
  nozzle(push, [lay.rear.tip, 0, 0], [-1, 0, 0], 0, 0.12, 0.08, REGION_BONNET);
  // Process pipes.
  for (const line of processPolylines(model, pose)) {
    for (let i = 1; i < line.points.length; i++) {
      const a = line.points[i - 1];
      const b = line.points[i];
      push(a[0], a[1], a[2], b[0], b[1], b[2], REGION_NEUTRAL, ALPHA_CLASS.PIPE);
    }
  }
  // Saddles: cradle arc +-60 deg about the bottom, two legs, a base.
  const drop = R + VESSEL_CLAMP.saddleDropR * R;
  for (const x of lay.saddleX) {
    arc(push, x, R, 4, REGION_SHELL, ALPHA_CLASS.SADDLE, (2 * Math.PI) / 3, (4 * Math.PI) / 3);
    const zEdge = R * Math.sin(Math.PI / 3);
    const yEdge = R * Math.cos((2 * Math.PI) / 3);
    push(x, yEdge, -zEdge, x, -drop, -zEdge, REGION_SHELL, ALPHA_CLASS.SADDLE);
    push(x, yEdge, zEdge, x, -drop, zEdge, REGION_SHELL, ALPHA_CLASS.SADDLE);
    push(x, -drop, -zEdge, x, -drop, zEdge, REGION_SHELL, ALPHA_CLASS.SADDLE);
  }
}

function bonnet(push: Push, s: VesselSide, sign: 1 | -1, d: Detail, ring: number, head: boolean, bonnetPose: boolean) {
  const R = 0.5;
  const x0 = s.channelFlange;
  const x1 = s.cylEnd;
  const depth = VESSEL_CLAMP.headDepth;
  const meridians = bonnetPose ? 5 : d.bonnetMeridians;
  const headRings = bonnetPose ? 2 : d.headRings;
  arc(push, x0, R, ring, REGION_BONNET, ALPHA_CLASS.BONNET);
  arc(push, x1, R, ring, REGION_BONNET, ALPHA_CLASS.BONNET);
  if (head) {
    for (let k = 1; k <= headRings; k++) {
      const t = ((Math.PI / 2) * k) / (headRings + 1);
      arc(push, x1 + sign * depth * Math.sin(t), R * Math.cos(t), Math.max(12, Math.round(ring * Math.cos(t))), REGION_BONNET, ALPHA_CLASS.BONNET);
    }
  }
  const headSegs = 4;
  for (let k = 0; k < meridians; k++) {
    const p = (Math.PI * 2 * k) / meridians;
    const cy = Math.cos(p);
    const cz = -Math.sin(p);
    push(x0, R * cy, R * cz, x1, R * cy, R * cz, REGION_BONNET, ALPHA_CLASS.BONNET);
    if (!head) continue;
    let px = x1;
    let pr = R;
    for (let j = 1; j <= headSegs; j++) {
      const t = ((Math.PI / 2) * j) / headSegs;
      const nx = x1 + sign * depth * Math.sin(t);
      const nr = R * Math.cos(t);
      push(px, pr * cy, pr * cz, nx, nr * cy, nr * cz, REGION_BONNET, ALPHA_CLASS.BONNET);
      px = nx;
      pr = nr;
    }
  }
  if (bonnetPose) {
    // Pass-partition plate: horizontal (y = 0) across the channel.
    const zr = R * 0.96;
    const xa = s.channelFlangeBack;
    push(xa, 0, -zr, x1, 0, -zr, REGION_BONNET, ALPHA_CLASS.PASS_PARTITION);
    push(xa, 0, zr, x1, 0, zr, REGION_BONNET, ALPHA_CLASS.PASS_PARTITION);
    push(x1, 0, -zr, x1, 0, zr, REGION_BONNET, ALPHA_CLASS.PASS_PARTITION);
    push(xa, 0, -zr, xa, 0, zr, REGION_BONNET, ALPHA_CLASS.PASS_PARTITION);
  }
}

function baffle(push: Push, model: VesselModel, x: number, windowSign: 1 | -1, ring: number) {
  const r = 0.497;
  const cutY = 0.5 - model.baffleCut;
  const alpha = Math.acos(clamp(cutY / r, -1, 1));
  const centre = windowSign > 0 ? 0 : Math.PI;
  const span = Math.PI * 2 - 2 * alpha;
  arc(push, x, r, Math.max(6, Math.ceil((ring * span) / (Math.PI * 2))), REGION_SHELL, ALPHA_CLASS.BAFFLE, centre + alpha, centre + Math.PI * 2 - alpha);
  const ay = r * Math.cos(centre + alpha);
  const az = -r * Math.sin(centre + alpha);
  const by = r * Math.cos(centre - alpha);
  const bz = -r * Math.sin(centre - alpha);
  push(x, ay, az, x, by, bz, REGION_SHELL, ALPHA_CLASS.BAFFLE);
}

/** Nozzle neck (4 generators) and flange ring, along unit dir from base point + r0*dir to + r1*dir. */
function nozzle(push: Push, base: [number, number, number], dir: [number, number, number], r0: number, r1: number, od: number, region: TwinRegion) {
  // Orthonormal pair perpendicular to dir.
  const ref: [number, number, number] = Math.abs(dir[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(dir, ref));
  const v = cross(dir, u);
  const rn = od / 2;
  const at = (rad: number, a: number, rr: number): [number, number, number] => [
    base[0] + dir[0] * rad + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * rr,
    base[1] + dir[1] * rad + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * rr,
    base[2] + dir[2] * rad + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * rr,
  ];
  for (let k = 0; k < 4; k++) {
    const a = (Math.PI / 2) * k;
    const p = at(r0, a, rn);
    const q = at(r1, a, rn);
    push(p[0], p[1], p[2], q[0], q[1], q[2], region, ALPHA_CLASS.NOZZLE);
  }
  const segs = 12;
  for (let k = 0; k < segs; k++) {
    const p = at(r1, (Math.PI * 2 * k) / segs, od);
    const q = at(r1, (Math.PI * 2 * (k + 1)) / segs, od);
    push(p[0], p[1], p[2], q[0], q[1], q[2], region, ALPHA_CLASS.NOZZLE);
  }
}

function cross(a: readonly number[], b: readonly number[]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(a: [number, number, number]): [number, number, number] {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** Hex-ring points (axial coords, distance <= n) in the YZ plane, centre-out. */
function hexPoints(n: number, pitch: number, x: number, out: Float32Array, offset: number): number {
  const pts: Array<[number, number, number, number]> = [];
  for (let r = -n; r <= n; r++) {
    for (let q = -n; q <= n; q++) {
      const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
      if (ring > n) continue;
      const y = r * pitch * (Math.sqrt(3) / 2);
      const z = (q + r / 2) * pitch;
      pts.push([ring, Math.atan2(-z, y), y, z]);
    }
  }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let o = offset;
  for (const p of pts) {
    out[o++] = x;
    out[o++] = p[2];
    out[o++] = p[3];
  }
  return pts.length;
}

/**
 * Builds the twin for a pose. Detail is shed (stack rings, shell rings,
 * ring segments, meridians) until the wire fits lod.maxSegments; anything
 * still over is truncated from the lowest-priority tail (pipes, saddles).
 */
export function buildTwinGeometry(model: VesselModel, lod: { shellRadiusPx: number; maxSegments: number }, pose: PoseName): TwinGeometry {
  const l = twinLod(model, lod.shellRadiusPx, pose);
  const max = Math.max(8, Math.floor(lod.maxSegments));
  const levels: Detail[] = [
    { meridians: l.meridians, ringSegments: l.ringSegments, shellRings: l.shellRings, stackRings: true, bonnetMeridians: Math.max(4, Math.round(l.meridians / 2)), headRings: 1 },
  ];
  const last = () => levels[levels.length - 1];
  levels.push({ ...last(), stackRings: false });
  levels.push({ ...last(), shellRings: LOD.shellRingsSparse });
  levels.push({ ...last(), ringSegments: Math.max(LOD.ringSegMin, Math.round(last().ringSegments * 0.75)) });
  levels.push({ ...last(), meridians: LOD.meridianMin, bonnetMeridians: 4, headRings: 0 });
  levels.push({ ...last(), ringSegments: LOD.ringSegMin });

  let buf: number[] = [];
  for (const detail of levels) {
    buf = [];
    const b = buf;
    buildSegments(model, pose, detail, (x0, y0, z0, x1, y1, z1, region, cls) => {
      b.push(x0, y0, z0, x1, y1, z1, region, cls);
    });
    if (buf.length / SEG_STRIDE <= max) break;
  }
  const segmentCount = Math.min(max, buf.length / SEG_STRIDE);
  const reserved = EVENT_RINGS.slots * EVENT_RINGS.segments;
  const segments = new Float32Array((segmentCount + reserved) * SEG_STRIDE);
  segments.set(buf.length > segmentCount * SEG_STRIDE ? buf.slice(0, segmentCount * SEG_STRIDE) : buf);
  for (let i = segmentCount; i < segmentCount + reserved; i++) segments[i * SEG_STRIDE + 7] = ALPHA_CLASS.EVENT_RING;

  const lay = vesselLayout(model, pose);
  const field = tubeFieldRadius(model);
  const faceMouths = new Float32Array(l.mouthCount * 3);
  const faceMouthCount = l.mouthRingN > 0 ? hexPoints(l.mouthRingN, field / l.mouthRingN, lay.front.face + 0.001, faceMouths, 0) : 0;

  const baffleX = baffleStations(model);
  const perBaffle = WIRE.xrayDotsPerBaffle;
  const xrayDots = new Float32Array(baffleX.length * perBaffle * 3);
  let xrayDotCount = 0;
  for (const x of baffleX) xrayDotCount += hexPoints(3, field / 3, x, xrayDots, xrayDotCount * 3);

  return {
    segments,
    segmentCount,
    totalSegmentCount: segmentCount + reserved,
    silhouetteStart: 0,
    eventRingStart: segmentCount,
    boltFront: { center: [lay.front.channelFlange, 0, 0], radius: model.boltPCD / 2, count: l.boltCount },
    boltRear: { center: [lay.rear.channelFlange, 0, 0], radius: model.boltPCD / 2, count: l.boltCount },
    faceMouths,
    faceMouthCount,
    baffleX,
    xrayDots,
    xrayDotCount,
    lod: l,
  };
}

/**
 * Writes the two analytic silhouette generators of the shell (tangent lines
 * seen from `eye`, twin-local) into segments[start..start+1]. Zero-length
 * when the eye is inside the shell's radius (end-on poses). Allocation-free.
 */
export function writeSilhouettes(eye: ArrayLike<number>, model: VesselModel, segments: Float32Array, start = 0): void {
  const R = 0.5;
  const h = model.length / 2;
  const rho = Math.hypot(eye[1], eye[2]);
  for (let k = 0; k < 2; k++) {
    const o = (start + k) * SEG_STRIDE;
    if (rho <= R * 1.001) {
      for (let i = 0; i < 6; i++) segments[o + i] = 0;
      continue;
    }
    // Eye's polar angle in the (y, -z) convention, +- the tangent half-angle.
    const phi = Math.atan2(-eye[2], eye[1]) + (k === 0 ? 1 : -1) * Math.acos(R / rho);
    const y = R * Math.cos(phi);
    const z = -R * Math.sin(phi);
    segments[o] = -h;
    segments[o + 1] = y;
    segments[o + 2] = z;
    segments[o + 3] = h;
    segments[o + 4] = y;
    segments[o + 5] = z;
  }
}

/**
 * Writes event ring `slot` (0..EVENT_RINGS.slots-1): a circle in the YZ plane
 * at center[0]. Returns the first segment index of the written sub-range
 * (EVENT_RINGS.segments long) for texSubImage. Allocation-free.
 */
export function writeEventRing(geometry: TwinGeometry, slot: number, center: readonly [number, number, number], radius: number, region: TwinRegion): number {
  const s = clamp(Math.floor(slot), 0, EVENT_RINGS.slots - 1);
  const first = geometry.eventRingStart + s * EVENT_RINGS.segments;
  const n = EVENT_RINGS.segments;
  const seg = geometry.segments;
  for (let i = 0; i < n; i++) {
    const a0 = (Math.PI * 2 * i) / n;
    const a1 = (Math.PI * 2 * (i + 1)) / n;
    const o = (first + i) * SEG_STRIDE;
    seg[o] = center[0];
    seg[o + 1] = center[1] + radius * Math.cos(a0);
    seg[o + 2] = center[2] - radius * Math.sin(a0);
    seg[o + 3] = center[0];
    seg[o + 4] = center[1] + radius * Math.cos(a1);
    seg[o + 5] = center[2] - radius * Math.sin(a1);
    seg[o + 6] = region;
    seg[o + 7] = ALPHA_CLASS.EVENT_RING;
  }
  return first;
}
