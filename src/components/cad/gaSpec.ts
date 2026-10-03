import type { EngineeringValues, JobDetail, NozzleItem } from "../../types/engineering";
import { getDefaultGaNozzleSchedule } from "../../constants/nozzleDefaults";

/**
 * Pure geometry spec of the General Arrangement 3D view. Everything is in
 * millimetres, x measured along the shell axis from the LEFT (front, "P")
 * tube-sheet face, y up, z towards the viewer, shell axis = (x, 0, 0).
 *
 * The numbers and rules mirror the C# generator
 * (MegaEngineeringSuite.Engineering.GeneralArrangement.GadParameters and
 * MegaEngineeringSuite.CadAutomation.GeneralArrangement.Gad*): head profile,
 * tangent distances, saddle heights, nozzle placement and the ASME B16.5
 * class 150 flange envelope. No three.js in here, so it is unit-testable.
 */

// ---- reference constants (GadParameters defaults, reference drawing 25-005-GAD-EX-1405) --------

export const GA_DEFAULTS = {
  shellId: 920,
  shellThk: 5,
  tubeLength: 3000,
  tubeSheetThk: 30,
  tubeOD: 25.4,
  dishCrownFactor: 1.0,
  dishKnuckleFactor: 0.1,
  dishStraightFace: 25,
  frontTangentDistance: 528,
  rearTangentDistance: 252.83,
  flangeThk: 40,
  boltHoleDia: 26,
  flangeFaceOffset: 7,
  gasketGap: 3,
  gasketRingWidth: 32,
  baffleQty: 5,
  baffleThk: 4,
  baffleFirstOffset: 440,
  bafflePitch: 425,
  baffleHeightRatio: 0.6006,
  tieRodDia: 17,
  partitionPlateThk: 4,
  saddleCL: 448,
  saddleHeightBelowShell: 725.64,
  saddleSlopeDrop: 25,
  saddleBaseThk: 16,
  saddleBaseElevWidth: 150,
  saddleRibThk: 12,
  saddleWrapThk: 5,
  saddleAnchorHoleDia: 26,
  trunnionNB: 100,
  liftingLugsFront: 1,
  liftingLugsRear: 2,
} as const;

export type GaSide = "TOP" | "BOTTOM" | "FRONT" | "BACK";

export interface GaPlacement {
  nozzleNo: string;
  /** mm from the left tube-sheet face. */
  axisX: number;
  side: "TOP" | "BOTTOM";
}

/** Reference condenser positions N1-N7 (GadParameters.DefaultReferencePlacements). */
export const REFERENCE_PLACEMENTS: readonly GaPlacement[] = [
  { nozzleNo: "N1", axisX: -307.0, side: "BOTTOM" },
  { nozzleNo: "N2", axisX: -307.0, side: "TOP" },
  { nozzleNo: "N3", axisX: 2521.48, side: "TOP" },
  { nozzleNo: "N4", axisX: 250.0, side: "TOP" },
  { nozzleNo: "N5", axisX: 175.0, side: "BOTTOM" },
  { nozzleNo: "N6", axisX: 3128.0, side: "TOP" },
  { nozzleNo: "N7", axisX: 3128.0, side: "BOTTOM" },
];

// ---- parsing helpers ----------------------------------------------------------------------------

/** GadParameters.ParseNumber: keep digits and '.', parse the rest, 0 when that fails. */
export function parseNumber(s: string | null | undefined): number {
  if (!s) return 0;
  const digits = s.replace(/[^0-9.]/g, "");
  if (digits.length === 0) return 0;
  const v = Number(digits);
  return Number.isFinite(v) ? v : 0;
}

const FLOAT_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** The orientation text after the generator's clean-up ("90°" -> "90", " Top " -> "TOP"). */
export function normaliseOrientation(orientation: string | null | undefined): string {
  return (orientation ?? "").trim().toUpperCase().replace(/°/g, "").replace(/DEG/g, "").trim();
}

export interface ResolvedNozzle {
  nozzle: NozzleItem;
  /** Index into the input list. */
  index: number;
  axisX: number;
  side: GaSide;
  /** false for 0 / 180 deg nozzles, which the GA drawing leaves out (the 3D view draws them sideways). */
  drawnOnGad: boolean;
  /** Where the position came from. */
  source: "explicit" | "reference" | "auto";
}

/**
 * GadParameters.ResolvePlacements, plus the 0 / 180 deg nozzles the drawing skips.
 * Per nozzle: 1. its own Position when filled in, 2. the reference position for N1-N7,
 * 3. automatic spacing from 250 with step max(350, NB*1.4 + 150). TOP/BOTTOM/90/270 pick the side.
 * Sideways (0 / 180) nozzles do not advance the automatic spacing of the drawn ones; they get
 * their automatic positions after the drawn ones.
 */
export function resolveNozzles(nozzles: readonly NozzleItem[]): ResolvedNozzle[] {
  const out: Array<ResolvedNozzle | undefined> = new Array(nozzles.length).fill(undefined);
  let nextAuto = 250.0;
  const refFor = (no: string) => REFERENCE_PLACEMENTS.find((r) => r.nozzleNo.toLowerCase() === no.toLowerCase());
  const explicitX = (n: NozzleItem): number | null => {
    const text = (n.position ?? "").trim();
    return text.length > 0 && FLOAT_TEXT.test(text) ? Number(text) : null;
  };
  const place = (n: NozzleItem, index: number, sideways: "FRONT" | "BACK" | null): ResolvedNozzle => {
    const o = normaliseOrientation(n.orientation);
    const orientSide: "TOP" | "BOTTOM" | null = o === "BOTTOM" || o === "270" ? "BOTTOM" : o === "TOP" || o === "90" ? "TOP" : null;
    const ref = refFor(n.nozzleNo);
    const nb = parseNumber(n.size);
    const user = explicitX(n);
    let axisX: number;
    let source: ResolvedNozzle["source"];
    if (user !== null) {
      axisX = user;
      source = "explicit";
    } else if (ref) {
      axisX = ref.axisX;
      source = "reference";
    } else {
      axisX = nextAuto;
      nextAuto += Math.max(350.0, nb * 1.4 + 150.0);
      source = "auto";
    }
    return {
      nozzle: n,
      index,
      axisX,
      side: sideways ?? orientSide ?? ref?.side ?? "TOP",
      drawnOnGad: sideways === null,
      source,
    };
  };

  nozzles.forEach((n, i) => {
    const o = normaliseOrientation(n.orientation);
    if (o === "0" || o === "180") return;
    out[i] = place(n, i, null);
  });
  nozzles.forEach((n, i) => {
    const o = normaliseOrientation(n.orientation);
    if (o === "0") out[i] = place(n, i, "FRONT");
    else if (o === "180") out[i] = place(n, i, "BACK");
  });
  return out.filter((x): x is ResolvedNozzle => x !== undefined);
}

/** The GAD-equivalent result: placements of the drawn nozzles and the numbers of the skipped (0 / 180 deg) ones. */
export function resolvePlacements(nozzles: readonly NozzleItem[]): { placements: GaPlacement[]; skipped: string[] } {
  const all = resolveNozzles(nozzles);
  return {
    placements: all
      .filter((r) => r.drawnOnGad)
      .map((r) => ({ nozzleNo: r.nozzle.nozzleNo, axisX: r.axisX, side: r.side === "BOTTOM" ? "BOTTOM" : "TOP" })),
    skipped: all.filter((r) => !r.drawnOnGad).map((r) => r.nozzle.nozzleNo),
  };
}

// ---- ASME B16.5 class 150 envelope (GadNozzleLibrary) -------------------------------------------

export interface GaFlange {
  nb: number;
  pipeOD: number;
  wall: number;
  flangeOD: number;
  thk: number;
  raisedFaceOD: number;
  raisedFaceH: number;
  pcd: number;
  holeDia: number;
  holeCount: number;
  /** true when the size is not in the table and the values were scaled from the nearest row. */
  approximate: boolean;
}

// NB, pipe OD, wall (sch 10S), flange OD, drawn thickness, raised-face OD, PCD, hole dia, holes (B16.5 class 150)
const FLANGE_ROWS: ReadonlyArray<readonly number[]> = [
  [15, 21.3, 2.11, 88.9, 10, 34.9, 60.3, 16, 4],
  [20, 26.7, 2.11, 98.4, 11, 42.9, 69.9, 16, 4],
  [25, 33.4, 2.77, 108.0, 12, 50.8, 79.4, 16, 4],
  [32, 42.2, 2.77, 117.5, 13, 63.5, 88.9, 16, 4],
  [40, 48.3, 2.77, 127.0, 14, 73.0, 98.4, 16, 4],
  [50, 60.3, 2.77, 152.4, 14, 92.1, 120.7, 19, 4],
  [65, 73.03, 3.05, 177.8, 16, 104.8, 139.7, 18, 4],
  [80, 88.9, 3.05, 190.5, 18, 127.0, 152.4, 19, 4],
  [100, 114.3, 3.05, 228.6, 20, 157.2, 190.5, 19, 8],
  [125, 141.3, 3.4, 254.0, 22, 185.7, 215.9, 22, 8],
  [150, 168.3, 3.4, 279.4, 25, 215.9, 241.3, 22, 8],
  [200, 219.1, 3.76, 342.9, 28, 269.9, 298.5, 22, 8],
  [250, 273.05, 4.19, 406.4, 32, 323.9, 361.9, 24, 12],
  [300, 323.9, 4.57, 482.6, 34, 381.0, 431.8, 25, 12],
  [350, 355.6, 4.78, 533.4, 38, 412.8, 476.3, 29, 12],
  [400, 406.4, 4.78, 596.9, 42, 469.9, 539.8, 29, 16],
  [450, 457.2, 4.78, 635.0, 45, 533.4, 577.9, 32, 16],
  [500, 508.0, 5.54, 698.5, 48, 584.2, 635.0, 30, 20],
  // 600 NB is outside the generator's table; B16.5 class 150 values, for the 3D view only.
  [600, 609.6, 6.35, 812.8, 54, 692.2, 749.3, 36, 20],
];

/** GadNozzleLibrary.Lookup plus the raised-face height rule; sizes off the table are scaled from the nearest row. */
export function flangeFor(nb: number): GaFlange {
  const exact = FLANGE_ROWS.find((r) => Math.abs(r[0] - nb) < 0.5);
  let row = exact;
  let approximate = false;
  if (!row) {
    approximate = true;
    row = FLANGE_ROWS.reduce((best, r) => (Math.abs(r[0] - nb) < Math.abs(best[0] - nb) ? r : best), FLANGE_ROWS[0]);
  }
  const k = approximate ? nb / row[0] : 1;
  const rfh = nb <= 80 ? 3.0 : nb <= 150 ? 3.4 : nb <= 250 ? 4.19 : 5.54;
  return {
    nb,
    pipeOD: row[1] * k,
    wall: row[2],
    flangeOD: row[3] * k,
    thk: row[4],
    raisedFaceOD: row[5] * k,
    raisedFaceH: rfh,
    pcd: row[6] * k,
    holeDia: row[7],
    holeCount: row[8],
    approximate,
  };
}

/** Nozzles of 25 NB and below are screwed couplings with plug (GadNozzleLibrary.IsCoupling). */
export const isCoupling = (nb: number): boolean => nb > 0 && nb <= 25;
/** Large nozzles carry the counter flange and capped spool (GadNozzleLibrary.HasCounterFlange). */
export const hasCounterFlange = (nb: number): boolean => nb >= 450;

// ---- head profile (GadHeadProfile) -----------------------------------------------------------------

export interface GaHeadProfile {
  shellR: number;
  crown: number;
  knuckle: number;
  /** Knuckle start to apex along the axis. */
  depth: number;
  junctionS: number;
  junctionR: number;
  junctionAngleDeg: number;
  knuckleCenterR: number;
  crownCenterS: number;
}

export function headProfile(shellR: number, crown: number, knuckle: number): GaHeadProfile {
  const d = Math.sqrt(Math.max(0, (crown - knuckle) ** 2 - (shellR - knuckle) ** 2));
  const ux = d / (crown - knuckle);
  const uy = (shellR - knuckle) / (crown - knuckle);
  return {
    shellR,
    crown,
    knuckle,
    depth: crown - d,
    junctionS: -d + crown * ux,
    junctionR: crown * uy,
    junctionAngleDeg: (Math.atan2(uy, ux) * 180) / Math.PI,
    knuckleCenterR: shellR - knuckle,
    crownCenterS: -d,
  };
}

/**
 * The dome as [s, r] points: s = axial distance from the knuckle start (outwards), r = radius.
 * Starts at (0, shellR) and ends on the axis at (depth, 0).
 */
export function headCurve(p: GaHeadProfile, knuckleSegments = 12, crownSegments = 36): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const a = (p.junctionAngleDeg * Math.PI) / 180;
  const phiJ = Math.PI / 2 - a; // knuckle arc, measured from the radial direction
  for (let i = 0; i <= knuckleSegments; i++) {
    const phi = (phiJ * i) / knuckleSegments;
    pts.push([p.knuckle * Math.sin(phi), p.knuckleCenterR + p.knuckle * Math.cos(phi)]);
  }
  for (let i = 1; i <= crownSegments; i++) {
    const beta = a * (1 - i / crownSegments);
    pts.push([p.crownCenterS + p.crown * Math.cos(beta), p.crown * Math.sin(beta)]);
  }
  return pts;
}

/** Dome radius at an axial distance s from the apex (linear interpolation on the sampled dome). */
export function headRadiusAtApexDistance(p: GaHeadProfile, sFromApex: number): number {
  const target = p.depth - sFromApex;
  const pts = headCurve(p, 24, 72);
  if (target <= 0) return p.shellR;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] >= target) {
      const [s0, r0] = pts[i - 1];
      const [s1, r1] = pts[i];
      const t = s1 === s0 ? 0 : (target - s0) / (s1 - s0);
      return r0 + (r1 - r0) * t;
    }
  }
  return 0;
}

// ---- spec ---------------------------------------------------------------------------------------------

export interface GaLayout {
  /** Tube-sheet face to face. */
  L: number;
  xtFront: number;
  xtRear: number;
  xsFront: number;
  xsRear: number;
  apexFrontOuter: number;
  apexRearOuter: number;
  apexFrontInner: number;
  apexRearInner: number;
}

export interface GaSaddle {
  label: "SS" | "FS";
  /** Centre-line x. */
  cl: number;
  /** +1: gusset towards +x (front saddle), -1: mirrored (rear saddle). */
  m: 1 | -1;
  /** Base-plate underside depth below the shell axis. */
  baseDepth: number;
  /** Underside below the shell OD (725.64 / 750.64 for the reference). */
  heightBelowShell: number;
  baseThk: number;
  /** Base plate along the shell axis (elevation width). */
  baseElevWidth: number;
  /** Base plate across the vessel (end-view width, ID - 50). */
  baseWidth: number;
  /** Saddle (web) plate width, outer to outer (about 0.88 x ID). */
  webWidth: number;
  anchorCC: number;
  anchorHoleDia: number;
  ribOuterSpacing: number;
  ribThk: number;
  wrapThk: number;
}

export interface GaNozzle {
  id: string;
  nb: number;
  /** Axis position as resolved (mm from the left tube-sheet face). */
  axisX: number;
  /** Position used for drawing: the resolved one limited to the shell + channels. */
  drawX: number;
  clamped: boolean;
  side: GaSide;
  /** Unit vector of the nozzle axis. */
  dir: [number, number, number];
  kind: "flanged" | "coupling";
  counterFlange: boolean;
  /** Centre line to flange face. */
  faceR: number;
  /** Outermost radius of the drawn nozzle (what the generator's tag clears). */
  outerR: number;
  /** Outermost point of the 3D model (spool cap / coupling plug). */
  reachR: number;
  flange: GaFlange;
  rating: string;
  schedule: string;
  type: string;
  service: string;
  source: ResolvedNozzle["source"];
  drawnOnGad: boolean;
}

export interface GaTrunnion {
  nb: number;
  neckR: number;
  flangeR: number;
  flangeThk: number;
  /** Centre line to flange face. */
  faceR: number;
  padHalfAngleDeg: number;
}

export interface GaSpec {
  /** The job the dimensions came from; null = the reference condenser. */
  jobId: string | null;
  shellId: number;
  shellThk: number;
  ri: number;
  ro: number;
  tubeLength: number;
  faceToFace: number;
  tubeSheetThk: number;
  tubeOD: number;
  tubeQty: number;
  flangeOD: number;
  flangeThk: number;
  boltPCD: number;
  boltHoleDia: number;
  boltCount: number;
  flangeFaceOffset: number;
  gasketGap: number;
  gasketRingWidth: number;
  crown: number;
  knuckle: number;
  straightFace: number;
  headOuter: GaHeadProfile;
  headInner: GaHeadProfile;
  layout: GaLayout;
  baffleQty: number;
  baffleThk: number;
  /** Chord height of a drawn baffle (0.6006 x ID). */
  baffleHeight: number;
  baffleX: number[];
  tieRodDia: number;
  tieRodQty: number;
  partitionPlateThk: number;
  saddles: [GaSaddle, GaSaddle];
  trunnion: GaTrunnion;
  lugsFront: number;
  lugsRear: number;
  nozzles: GaNozzle[];
  /** Nozzles that could not be modelled (no size). */
  skipped: string[];
}

export interface GaInputs {
  jobId?: string | null;
  shellId?: number;
  shellThk?: number;
  tubeLength?: number;
  tubeSheetThk?: number;
  tubeOD?: number;
  tubeQty?: number;
  flangeThk?: number;
  boltHoleDia?: number;
  baffleQty?: number;
  baffleThk?: number;
  tieRodDia?: number;
  tieRodQty?: number;
  partitionPlateThk?: number;
  nozzles?: readonly NozzleItem[];
}

const pos = (v: number | undefined, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;

const SIDE_DIR: Record<GaSide, [number, number, number]> = {
  TOP: [0, 1, 0],
  BOTTOM: [0, -1, 0],
  FRONT: [0, 0, 1],
  BACK: [0, 0, -1],
};

/** Bolt count for a body flange: a multiple of 4 at roughly 110 mm pitch on the bolt circle. */
export function flangeBoltCount(pcd: number): number {
  return Math.max(8, 4 * Math.round((Math.PI * pcd) / (4 * 110)));
}

export function buildGaSpec(inputs: GaInputs = {}): GaSpec {
  const D = GA_DEFAULTS;
  const shellId = pos(inputs.shellId, D.shellId);
  const shellThk = pos(inputs.shellThk, D.shellThk);
  const tubeLength = pos(inputs.tubeLength, D.tubeLength);
  const ri = shellId / 2;
  const ro = ri + shellThk;
  const L = tubeLength - 4;
  const tubeSheetThk = pos(inputs.tubeSheetThk, D.tubeSheetThk);
  const flangeThk = pos(inputs.flangeThk, D.flangeThk);
  const flangeOD = shellId + 160;
  const boltPCD = shellId + 100;

  const crown = D.dishCrownFactor * shellId;
  const knuckle = D.dishKnuckleFactor * shellId;
  const headInner = headProfile(ri, crown, knuckle);
  const headOuter = headProfile(ro, crown + shellThk, knuckle + shellThk);
  const xtFront = -D.frontTangentDistance;
  const xtRear = L + D.rearTangentDistance;
  const xsFront = xtFront - D.dishStraightFace;
  const xsRear = xtRear + D.dishStraightFace;
  const layout: GaLayout = {
    L,
    xtFront,
    xtRear,
    xsFront,
    xsRear,
    apexFrontOuter: xsFront - headOuter.depth,
    apexRearOuter: xsRear + headOuter.depth,
    apexFrontInner: xsFront - headInner.depth,
    apexRearInner: xsRear + headInner.depth,
  };

  const baffleQty = Math.round(pos(inputs.baffleQty, D.baffleQty));
  const baffleX: number[] = [];
  for (let i = 0; i < baffleQty; i++) {
    const x = D.baffleFirstOffset + i * D.bafflePitch;
    if (x < L - tubeSheetThk) baffleX.push(x);
  }

  const baseWidth = shellId - 50;
  const webWidth = Math.round(0.88 * shellId);
  const saddle = (label: "SS" | "FS", cl: number, m: 1 | -1, extra: number): GaSaddle => ({
    label,
    cl,
    m,
    heightBelowShell: D.saddleHeightBelowShell + extra,
    baseDepth: ro + D.saddleHeightBelowShell + extra,
    baseThk: D.saddleBaseThk,
    baseElevWidth: D.saddleBaseElevWidth,
    baseWidth,
    webWidth,
    anchorCC: baseWidth - 120,
    anchorHoleDia: D.saddleAnchorHoleDia,
    ribOuterSpacing: webWidth - 260,
    ribThk: D.saddleRibThk,
    wrapThk: D.saddleWrapThk,
  });

  const trunnionFlange = flangeFor(D.trunnionNB);
  const trunnion: GaTrunnion = {
    nb: D.trunnionNB,
    neckR: trunnionFlange.pipeOD / 2,
    flangeR: 125,
    flangeThk: 16,
    faceR: ro + 157.58,
    padHalfAngleDeg: 16.88,
  };

  const skipped: string[] = [];
  const nozzles: GaNozzle[] = [];
  for (const r of resolveNozzles(inputs.nozzles ?? [])) {
    const n = r.nozzle;
    const nb = parseNumber(n.size);
    if (nb <= 0) {
      skipped.push(n.nozzleNo);
      continue;
    }
    const coupling = isCoupling(nb);
    const counter = !coupling && hasCounterFlange(nb);
    const proj = parseNumber(n.projection);
    const faceR = proj > ro ? proj : ro + 150;
    const outerR = coupling ? ro + 56.8 : counter ? faceR + 3 + 150 + 26 : faceR;
    const reachR = coupling ? ro + 56.8 : counter ? faceR + 3 + 150 : faceR;
    const drawX = Math.min(Math.max(r.axisX, xtFront), xtRear);
    nozzles.push({
      id: n.nozzleNo,
      nb,
      axisX: r.axisX,
      drawX,
      clamped: drawX !== r.axisX,
      side: r.side,
      dir: SIDE_DIR[r.side],
      kind: coupling ? "coupling" : "flanged",
      counterFlange: counter,
      faceR: coupling ? reachR : faceR,
      outerR,
      reachR,
      flange: flangeFor(nb),
      rating: (n.rating ?? "").trim(),
      schedule: (n.schedule ?? "").trim(),
      type: (n.type ?? "").trim(),
      service: (n.service ?? "").trim(),
      source: r.source,
      drawnOnGad: r.drawnOnGad,
    });
  }

  return {
    jobId: inputs.jobId ?? null,
    shellId,
    shellThk,
    ri,
    ro,
    tubeLength,
    faceToFace: L,
    tubeSheetThk,
    tubeOD: pos(inputs.tubeOD, D.tubeOD),
    tubeQty: Math.round(pos(inputs.tubeQty, 0)),
    flangeOD,
    flangeThk,
    boltPCD,
    boltHoleDia: pos(inputs.boltHoleDia, D.boltHoleDia),
    boltCount: flangeBoltCount(boltPCD),
    flangeFaceOffset: D.flangeFaceOffset,
    gasketGap: D.gasketGap,
    gasketRingWidth: D.gasketRingWidth,
    crown,
    knuckle,
    straightFace: D.dishStraightFace,
    headOuter,
    headInner,
    layout,
    baffleQty: baffleX.length,
    baffleThk: pos(inputs.baffleThk, D.baffleThk),
    baffleHeight: D.baffleHeightRatio * shellId,
    baffleX,
    tieRodDia: pos(inputs.tieRodDia, D.tieRodDia),
    tieRodQty: Math.min(8, Math.max(4, Math.round(pos(inputs.tieRodQty, 4)))),
    partitionPlateThk: pos(inputs.partitionPlateThk, D.partitionPlateThk),
    saddles: [saddle("SS", D.saddleCL, 1, 0), saddle("FS", L - D.saddleCL, -1, D.saddleSlopeDrop)],
    trunnion,
    lugsFront: D.liftingLugsFront,
    lugsRear: D.liftingLugsRear,
    nozzles,
    skipped,
  };
}

/** The reference condenser (shell I.D. 920, N1-N7), used until a General Arrangement job exists. */
export const REFERENCE_GA_SPEC: GaSpec = buildGaSpec({ nozzles: getDefaultGaNozzleSchedule() });

/**
 * Spec from a General Arrangement job. Estimated values win (they drive the job's CAD),
 * then Actual, then the root field; whatever is missing falls back to the reference drawing.
 */
export function gaSpecFromJob(job: JobDetail): GaSpec | null {
  const data = job.engineeringData;
  if (!data) return null;
  const est: Partial<EngineeringValues> = data.estimated ?? {};
  const act: Partial<EngineeringValues> = data.actual ?? {};
  const first = (...v: Array<number | undefined>) => v.find((x) => typeof x === "number" && Number.isFinite(x) && x > 0);
  return buildGaSpec({
    jobId: job.id,
    shellId: first(est.shellID, act.shellID, data.shellID, job.shellId),
    shellThk: first(est.bonnetShellTHK, act.bonnetShellTHK),
    tubeLength: first(data.tubeLength),
    tubeSheetThk: first(est.tubeSheetFinishTHK, act.tubeSheetFinishTHK),
    tubeOD: first(data.tubeOD),
    tubeQty: first(est.tubeQty, act.tubeQty, data.tubeQty),
    flangeThk: first(est.bodyFlangeFinishTHK, act.bodyFlangeFinishTHK),
    boltHoleDia: first(est.holeDia, act.holeDia, data.holeDia),
    baffleQty: first(data.baffleQty),
    baffleThk: first(est.baffleTHK, act.baffleTHK, data.baffleTHK),
    tieRodDia: first(est.tieRodDia, act.tieRodDia, data.tieRodDia),
    tieRodQty: first(est.tieRodQty, act.tieRodQty, data.tieRodQty),
    partitionPlateThk: first(est.partitionPlateTHK, act.partitionPlateTHK, data.partitionPlateTHK),
    nozzles: data.nozzles ?? [],
  });
}

// ---- internals layout ---------------------------------------------------------------------------------

/** Triangular 30 degree tube field at 1.25 x OD pitch, filled centre-out: [y, z] per tube. */
export function tubeLayout(spec: GaSpec, max = 900): Array<[number, number]> {
  const pitch = 1.25 * spec.tubeOD;
  const limit = spec.ri - 45 - spec.tubeOD / 2;
  const rowStep = pitch * Math.sin(Math.PI / 3);
  const pts: Array<[number, number]> = [];
  const rows = Math.ceil(limit / rowStep);
  const cols = Math.ceil(limit / pitch) + 1;
  for (let r = -rows; r <= rows; r++) {
    const y = r * rowStep;
    const off = Math.abs(r) % 2 === 1 ? pitch / 2 : 0;
    for (let c = -cols; c <= cols; c++) {
      const z = c * pitch + off;
      if (Math.abs(y) < spec.partitionPlateThk / 2 + spec.tubeOD / 2) continue; // pass-partition lane
      if (y * y + z * z <= limit * limit) pts.push([y, z]);
    }
  }
  pts.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));
  const wanted = spec.tubeQty > 0 ? Math.min(spec.tubeQty, max) : max;
  return pts.slice(0, Math.min(wanted, max));
}

/** Tie-rod centres [y, z] on a circle just outside the tube field. */
export function tieRodLayout(spec: GaSpec): Array<[number, number]> {
  const r = spec.ri - 22;
  return Array.from({ length: spec.tieRodQty }, (_, i) => {
    const a = (2 * Math.PI * (i + 0.5)) / spec.tieRodQty;
    return [r * Math.cos(a), r * Math.sin(a)] as [number, number];
  });
}

/** Overall extents of the vessel model (mm), used to scale and centre the scene. */
export function gaExtents(spec: GaSpec): { minX: number; maxX: number; minY: number; maxY: number; length: number } {
  const maxNozzleY = Math.max(spec.ro, ...spec.nozzles.filter((n) => n.side === "TOP").map((n) => n.reachR));
  return {
    minX: spec.layout.apexFrontOuter,
    maxX: spec.layout.apexRearOuter + 49,
    minY: -spec.saddles[1].baseDepth,
    maxY: maxNozzleY,
    length: spec.layout.apexRearOuter + 49 - spec.layout.apexFrontOuter,
  };
}
