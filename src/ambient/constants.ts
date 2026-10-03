/**
 * Every number in the Duty Field spec (docs/ambient/duty-field-spec.md),
 * in one place. The GL engine, the Canvas2D still, the pure math modules and
 * the luminance-budget test all read these; nothing hard-codes a value twice.
 *
 * Units: px are CSS px unless a name says "device"; times are seconds unless
 * a name ends in Ms; alphas are in sRGB-encoded space (the blend model).
 * Pure data - no DOM, no GL, no imports beyond types.
 */
import type { PoseName } from "./types";

// ---------------------------------------------------------------- colours

export const COLORS = {
  base: "#05070d",
  quietBase: "#04060b",
  boreBottom: "#04060b",
  hazeLow: "#070c18",
  hazeHigh: "#0b1a33",
  hazeTeal: "#062a33",
  hazePeak: "#0a1c2b",
  latticeRim: "#3b82f6",
  crescent: "#06b6d4",
  streakFog: "#06b6d4",
  wire: "#06b6d4",
  silhouette: "#67e8f9",
  faceMouth: "#7dd3fc",
  xray: "#a5f3fc",
  glassFill: "#0e7490",
  scanBand: "#a5f3fc",
  pipe: "#06b6d4",
  nodeRing: "#06b6d4",
  nodeCore: "#a5f3fc",
  nodeOffline: "#6b7a94",
  linkOnline: "#06b6d4",
  linkOffline: "#4b5870",
  ghost: "#4b5870",
  hubBolt: "#67e8f9",
  queued: "#f59e0b",
  farFog: "#0b1a33",
  ledgerDone: "#10b981",
  ledgerFail: "#ef4444",
  dispatch: "#67e8f9",
  completePulse: "#34d399",
  completeRing: "#10b981",
  failure: "#ef4444",
  batch: "#06b6d4",
} as const;

/** Module identity colours (MODULE_COLORS) - used only as <= 30% chroma tints, never for events. */
export const MODULE_TINT = {
  TubeSheet: "#3987e5",
  BonnetFlange: "#d95926",
  HeatExchangerFab: "#199e70",
} as const;

/** OKLCH stops of the flow LUT: [L, C, hueDeg] at u = 0, 0.5, 1. Hue paths are explicit (never wrap). */
export const FLOW_LUT = {
  width: 64,
  cold: [
    [0.7, 0.13, 250],
    [0.72, 0.115, 268],
    [0.74, 0.1, 286],
  ],
  hot: [
    [0.745, 0.075, 85],
    [0.74, 0.062, 72],
    [0.735, 0.05, 60],
  ],
  coldHex: ["#5aa3ec", "#86a1ed", "#a5a2e7"],
  hotHex: ["#c2a975", "#c4a580", "#c1a28a"],
  /** Hot stream never reads as queued amber (C ~0.17). */
  hotChromaMax: 0.075,
  /** u = s * (uBase + uActivity * A). */
  uBase: 0.3,
  uActivity: 0.7,
} as const;

// ---------------------------------------------------------------- layer 0: poster

export const POSTER = {
  tileW: 34,
  tileH: 294.45,
  tileWNarrow: 28,
  tileHNarrow: 242.5,
  circleR: 13.6,
  circleRNarrow: 11.2,
  strokeAlpha: 0.055,
  peakL: 0.011,
  crossfadeMs: 600,
  contextLostFadeMs: 200,
  /** Fallback --ambient-top at 1440x900. */
  defaultTop: 91,
  narrowMaxW: 640,
} as const;

// ---------------------------------------------------------------- layer 1: haze

export const HAZE = {
  octaves: 3,
  warpPeriod1: 47,
  warpPeriod2: 61,
  warpGain: 1.7,
  /** p = fragCoord / (scaleH * canvasH). */
  scaleH: 0.6,
  breathing: 0.25,
  maxDriftPxPerSec: 0.5,
  /** Main pool ellipse radii as fractions of stage width. */
  poolRx: 0.62,
  poolRy: 0.34,
  bottomLeftFloor: 0.35,
  tealMix: 0.4,
  peakL: 0.0107,
  refreshHz: { 3: 10, 2: 5, 1: 0 } as Record<1 | 2 | 3, number>,
  t1BakeScale: 0.25,
  resolutionScale: 0.5,
  noiseSize: 128,
  workspaceTint: { TubeSheet: 0.25, HeatExchangerFab: 0.25, BonnetFlange: 0.15 },
  apiDownSaturation: -0.85,
  apiDownSec: 1.2,
  pageIntensity: { modules: 1.0, jobs: 0.7, workspace: 0.85 },
} as const;

// ---------------------------------------------------------------- layer 2: tube field lattice

const PITCH = 34;
const PITCH_NARROW = 28;
export const LATTICE = {
  pitch: PITCH,
  pitchNarrow: PITCH_NARROW,
  rowStep: (PITCH * Math.sqrt(3)) / 2,
  rowStepNarrow: (PITCH_NARROW * Math.sqrt(3)) / 2,
  /** Mouth OD = pitch / 1.25 (the production drilling rule). */
  mouthR: 13.6,
  mouthRNarrow: 11.2,
  /** Rows with row % laneEvery === laneRow carry no mouths (pass-partition lane). */
  laneEvery: 10,
  laneRow: 9,
  narrowMaxW: 640,
} as const;

export const CRESCENT = {
  /** offset = normalize(VP - m) * min(gain * |VP - m| / canvasH, cap) * pitch */
  gain: 0.07,
  cap: 0.3,
  pointerPx: 2.0,
  pointerTau: 0.9,
  alpha: 0.045,
  rimAlpha: { margin: 0.06, halo: 0.095, column: 0.035, quiet: 0 },
  haloScaleW: 1.25,
  haloScaleH: 1.6,
  haloRunningBoost: 0.3,
  haloRunningEaseSec: 4,
  falloffBottomLeft: 0.4,
  scanEchoAlpha: 0.02,
  scanEchoSigmaPx: 40,
  crossfadeMs: 600,
  t1AlphaScale: 0.6,
  facePoseLatticeScale: 1.25,
  freqGuard: [0.35, 0.6],
  areaL: 0.0012,
} as const;

// ---------------------------------------------------------------- layer 3: streaks

export const STREAKS = {
  lengthK: 0.12,
  minPx: 10,
  maxPx: 90,
  faceLengthK: 0.2,
  faceMaxPx: 110,
  faceRadiusScale: 2.2,
  vpFadePx: 60,
  counts: { 3: 600, 2: 300, 1: 120 } as Record<1 | 2 | 3, number>,
  alpha: 0.045,
  fogK: 3.2,
  columnScale: 0.4,
  sectionTintAlpha: 0.022,
  runningAlphaBase: 0.85,
  runningAlphaGain: 0.15,
} as const;

// ---------------------------------------------------------------- layer 4: agent network

export const NETWORK = {
  maxNodes: 12,
  minSpacingPx: 72,
  /** Clearance from a quiet core: feather (RESOLVE.quietFeatherPx) + this. */
  quietClearPx: 36,
  twinClearPx: 12,
  stageStripMax: 3,
  stageStripTextGapPx: 40,
  rightGutterMinPx: 40,
  rightGutterCardGapPx: 12,
  rightGutterV: [0.3, 0.94],
  leftGutterMinPx: 160,
  bottomRowFromBottomPx: 20,
  narrowMaxNodes: 4,
  narrowBottomV: [0.93, 0.97],
  narrowGutterVMin: 0.5,
  maxLinkSegments: 32,
  filletPx: 6,
  oddRimClearPx: 3.4,
  traversedRimBoost: 0.04,
  breatheAmp: 0.12,
  breathePeriod: 6.4,
  onlineScaleMs: 900,
  linkDrawMs: 1200,
  offlineGreyMs: 1500,
  currentDash: [3, 9],
  currentPxPerSec: 14,
  maxAnimatedLinks: 3,
  broadcastAlpha: 0.5,
  queuedBoltFadeMs: 600,
  node: { ringR: 4, ringAlpha: 0.55, coreR: 1.5, coreAlpha: 0.7, localR: 8, localAlpha: 0.22 },
  offline: { ringAlpha: 0.2, linkAlpha: 0.08, dash: [4, 6] },
  linkAlpha: 0.12,
  hubBoltAlpha: 0.22,
  queuedBoltAlpha: 0.4,
  ghostAlpha: 0.22,
  farFogTint: 0.3,
  jobsPageScale: 1.5,
  apiDownHalo: { min: 0.1, max: 0.22, period: 5 },
} as const;

// ---------------------------------------------------------------- layer 5: glass

export const GLASS = {
  scanlinePeriodDevicePx: 3,
  scanlineModulation: 0.12,
  scanlinePxPerSec: 5,
  fillBase: 0.01,
  fillFresnel: 0.05,
  backFace: 0.5,
  scanAlpha: 0.06,
  apiDownScale: 0.5,
  twin3dFadeMs: 400,
} as const;

export const SCAN_BAND = {
  sigmaFrac: 0.06,
  sweepSec: 3.2,
  idlePeriod: 24,
  idleStrength: 0.5,
  runningPeriod: 12,
  completionMinGap: 8,
  rampMinMs: 300,
  maxAreaDeltaL: 0.06,
  wireGain: 1.6,
  wireAlphaCap: 0.62,
  xrayMinRadiusPx: 50,
} as const;

// ---------------------------------------------------------------- layer 6: wireframe

/** Segment alpha classes (the 8th float of every twinGeometry segment). Plain ids, no enum. */
export const ALPHA_CLASS = {
  /** Shell generators, depth/facing cued: near / far / back-facing. */
  MERIDIAN: 0,
  SILHOUETTE: 1,
  SHELL_RING: 2,
  TUBESHEET: 3,
  BAFFLE: 4,
  BONNET: 5,
  NOZZLE: 6,
  SADDLE: 7,
  FLANGE: 8,
  PIPE: 9,
  LANE: 10,
  SECTION_NEAR: 11,
  SECTION_FAR: 12,
  PASS_PARTITION: 13,
  /** Reserved event-ring sub-ranges; alpha comes from the event pool. */
  EVENT_RING: 14,
} as const;
export const ALPHA_CLASS_COUNT = 16;

/** Base alpha per ALPHA_CLASS id (MERIDIAN uses WIRE.meridian instead). */
export const CLASS_ALPHA: readonly number[] = [
  0.46, // MERIDIAN (near; see WIRE.meridian)
  0.72, // SILHOUETTE
  0.34, // SHELL_RING
  0.36, // TUBESHEET
  0.32, // BAFFLE
  0.3, // BONNET
  0.36, // NOZZLE
  0.2, // SADDLE
  0.34, // FLANGE
  0.14, // PIPE
  0.22, // LANE
  0.08, // SECTION_NEAR
  0.3, // SECTION_FAR
  0.24, // PASS_PARTITION
  0, // EVENT_RING
  0,
];

/** Per-pose overrides of CLASS_ALPHA (id -> alpha). */
export const POSE_CLASS_ALPHA: Record<PoseName, Readonly<Partial<Record<number, number>>>> = {
  overview: {},
  telemetry: {},
  wide: {},
  porthole: {},
  // Tube Sheet: just the face - no process pipes or lanes crossing it.
  face: { [ALPHA_CLASS.PIPE]: 0, [ALPHA_CLASS.LANE]: 0, [ALPHA_CLASS.NOZZLE]: 0, [ALPHA_CLASS.SADDLE]: 0 },
  // HX Fab section: near-half cutaway.
  section: { [ALPHA_CLASS.BAFFLE]: 0.3, [ALPHA_CLASS.LANE]: 0.16 },
  // Bonnet Flange: the shell recedes into fog.
  bonnet: {
    [ALPHA_CLASS.MERIDIAN]: 0.1,
    [ALPHA_CLASS.SILHOUETTE]: 0.1,
    [ALPHA_CLASS.SHELL_RING]: 0.1,
    [ALPHA_CLASS.BAFFLE]: 0.1,
    [ALPHA_CLASS.NOZZLE]: 0.1,
    [ALPHA_CLASS.SADDLE]: 0.1,
  },
};

/**
 * Bitmask of ALPHA_CLASS ids that follow the meridian roll (CameraFrame.model).
 * Baffles (cut windows), nozzles, saddles, pipes and lanes are fixed in space.
 */
export const ROLLING_CLASS_MASK =
  (1 << ALPHA_CLASS.MERIDIAN) |
  (1 << ALPHA_CLASS.SHELL_RING) |
  (1 << ALPHA_CLASS.TUBESHEET) |
  (1 << ALPHA_CLASS.BONNET) |
  (1 << ALPHA_CLASS.FLANGE) |
  (1 << ALPHA_CLASS.PASS_PARTITION);

export const WIRE = {
  meridian: { near: 0.46, far: 0.16, back: 0.06 },
  faceMouthAlpha: 0.38,
  faceMouthAlphaFacePose: 0.34,
  xrayAlpha: 0.25,
  xrayDotsPerBaffle: 37,
  regionRunningAlpha: 0.2,
  regionRunningMix: 0.3,
  hoverBoost: 0.25,
  hoverInMs: 400,
  hoverOutMs: 600,
  jobDetailRunningBoost: 0.15,
  otherRegionsWorkspace: 0.45,
  detailFadePx: 4,
  ledger: { doneAlpha: 0.16, doneTauHours: 72, doneFloor: 0.04, failAlpha: 0.2, failRimAlpha: 0.08, failPlugHours: 12, maxPlugged: 3, windowHours: 168 },
  scrollFadeTo: 0.35,
  scrollFadePx: 280,
} as const;

/** LOD rules from projected shell radius R_px. */
export const LOD = {
  meridianDivisor: 4.5,
  meridianMin: 6,
  meridianMax: 10,
  ringSegDivisor: 7,
  ringSegMin: 24,
  ringSegMax: 64,
  shellRingsDense: 9,
  shellRingsSparse: 5,
  shellRingMinSpacingPx: 14,
  boltMinSpacingPx: 6,
  /** Hex-ring mouth counts (3n(n+1)+1 for n = 4..7). */
  mouthRings: [4, 5, 6, 7],
  mouthMinPitchPx: 9,
  /** Segments <= clamp(bboxArea / areaPerSegment, min, max). */
  areaPerSegment: 30,
  segmentsMin: 600,
  segmentsMax: 1900,
} as const;

/** Event-ring sub-ranges reserved at the end of the segment texture. */
export const EVENT_RINGS = { slots: 6, segments: 48 } as const;

// ---------------------------------------------------------------- vessel model clamps

export const VESSEL_CLAMP = {
  lengthMin: 2.5,
  lengthMax: 6,
  baffleMax: 12,
  nozzleOdMin: 0.08,
  nozzleOdMax: 0.25,
  boltMin: 8,
  boltMax: 48,
  /** 2:1 ellipsoidal head depth in D units (R / 2). */
  headDepth: 0.25,
  /** Nozzle stations: first/last nozzle at 0.1 / 0.9 of the shell (N1/N2 rule). */
  nozzleFracMin: 0.1,
  nozzleFracMax: 0.9,
  /** Saddles at 0.2L and 0.8L; drop = 0.42R. */
  saddleFracs: [0.2, 0.8],
  saddleDropR: 0.42,
  /** Nozzle neck projection beyond the shell: 0.45R + OD. */
  nozzleProjectionR: 0.45,
  /** Bonnet pose: front channel exploded by 1.1R. */
  explodeR: 1.1,
} as const;

// ---------------------------------------------------------------- camera / poses

export const CAMERA = {
  fovYDeg: 30,
  near: 0.05,
  far: 500,
  /** D_px = clamp(min, k * stageH, max). */
  dpxMin: 80,
  dpxK: 0.62,
  dpxMax: 132,
  /** Tablets (canvas < this) cap D_px. */
  tabletMaxW: 1024,
  tabletDpxMax: 100,
  narrowMaxW: 900,
  /** VP farther than this many canvas diagonals from the canvas centre counts as "at infinity". */
  vpInfinityDiagonals: 6,
  swingAmpDeg: 6,
  swingPeriod: 96,
  tiltYawDeg: 3,
  tiltPitchDeg: 2,
  tiltTau: 0.9,
  tiltRelaxAfterMs: 4000,
  tiltRelaxFrac: 0.5,
  tiltLeaveMs: 2000,
  /** k = 1 - base^(dt * 60) */
  easeBase: 0.94,
} as const;

export interface PoseDef {
  /** Angle between the view direction and the vessel axis (0 = end-on, 90 = side view). */
  offAxisDeg: number;
  pitchDeg: number;
  /** Meridian roll rate, deg/s (0 = none). */
  rollDegPerSec: number;
}

export const POSES: Record<PoseName, PoseDef> = {
  overview: { offAxisDeg: 36, pitchDeg: -4, rollDegPerSec: 3 },
  telemetry: { offAxisDeg: 36, pitchDeg: -4, rollDegPerSec: 3 },
  wide: { offAxisDeg: 36, pitchDeg: -4, rollDegPerSec: 3 },
  face: { offAxisDeg: 10, pitchDeg: 0, rollDegPerSec: 360 / 150 },
  bonnet: { offAxisDeg: 62, pitchDeg: -4, rollDegPerSec: 3 },
  section: { offAxisDeg: 82, pitchDeg: -6, rollDegPerSec: 0 },
  porthole: { offAxisDeg: 0, pitchDeg: -6, rollDegPerSec: 0 },
};

export const POSE_PARAMS = {
  telemetryScale: 0.7,
  telemetryEmblemMinStageW: 300,
  telemetryEmblemMaxPx: 132,
  telemetryEmblemGutterPad: 24,
  faceDiameterK: 0.6,
  /** How far the measured stage extends behind the first card (quietZones.ts). */
  stageTuckPx: 28,
  bonnetScale: 1.4,
  sectionFillW: 0.76,
  wideMinGutter: 200,
  wideDpxMax: 160,
  wideDpxK: 0.62,
  wideFaceV: 0.2,
  wideMaxLengthPx: 760,
  portholeCx: 0.92,
  portholeCy: 0.06,
  portholeFlangeRK: 0.34,
  largeChangeDeg: 15,
  /** Telemetry falls back to the FACE emblem on stages shorter than this (job detail's one-row header). */
  telemetryEmblemMinStageH: 120,
  /** Stage-framed poses (overview, telemetry, section): the twin's swing + tilt envelope stays this far inside the stage. */
  stageFitPadPx: 8,
  /** The stage fit never shrinks the projected shell below this (px); past it the twin may overflow the stage. */
  stageFitMinPx: 56,
} as const;

// ---------------------------------------------------------------- layers 7/8: flows

export const PATHS = {
  samples: 128,
  maxPaths: 48,
  rawSamples: 1024,
  shellStreamlines: 12,
  shellOffsetMax: 0.85,
  windowYR: 0.72,
  lateralR: 0.55,
  nozzleFrac: 0.1,
  tubeLanes: 7,
  laneRingR: 0.45,
  sectionLaneSpreadR: 0.75,
  p2OffsetD: 0.4,
  riserLengthD: 0.9,
  /** Long runs that leave the frame (twin-local units). */
  processRunD: 3,
  portholeCrossflow: 12,
  portholeHotR: 0.68,
  portholeColdR: 0.3,
} as const;

/** Path kinds (FlowPaths.kinds) - colour/speed selector for the sprite pass. */
export const PATH_KIND = {
  SHELL: 0,
  TUBE: 1,
  SUPPLY: 2,
  RETURN: 3,
  RISER_IN: 4,
  RISER_OUT: 5,
  HOT_RING: 6,
  COLD_RING: 7,
} as const;

export const FLOW = {
  shell: { idlePxPerSec: 20, runningGain: 0.35, queuedGain: 0.12, maxPxPerSec: 34, coreAlpha: 0.45, sizePx: 2.0, sizeJitterPx: 0.4, dofMaxPx: 4, endFade: 0.04, phaseJitter: 0.8, speedScale: [0.85, 1.15] },
  tube: { idlePxPerSec: 16, maxPxPerSec: 28, alpha: 0.42, capsuleW: 1.4, capsuleL: 5 },
  processPxPerSec: 22,
  riserPxPerSec: 18,
  heatParcelParticles: 14,
  heatParcelGain: 1.8,
  apiDownStopSec: 2,
  activityTauSec: 10,
  activityJobs: 12,
  jobsPageScale: 0.5,
  bonnetPoseParticles: 40,
  portholeAnnulus: 48,
  portholeCrossflow: 120,
  counts: {
    3: { shell: 360, tubeLanes: 7, perLane: 30, process: 120 },
    2: { shell: 220, tubeLanes: 5, perLane: 28, process: 80 },
    1: { shell: 110, tubeLanes: 5, perLane: 14, process: 40 },
  } as Record<1 | 2 | 3, { shell: number; tubeLanes: number; perLane: number; process: number }>,
} as const;

// ---------------------------------------------------------------- layer 9: events

/** Event type ids as packed into the UBO (0 = empty slot). */
export const EVENT_TYPE_ID = {
  none: 0,
  dispatch: 1,
  complete: 2,
  fail: 3,
  batch: 4,
  agentOnline: 5,
  agentOffline: 6,
} as const;

export const EVENTS = {
  poolSize: 8,
  maxConcurrent: 3,
  maxQueued: 6,
  spacingSec: 0.7,
  coalesceSec: 1.5,
  batchThreshold: 6,
  /** Batch ring radius = base + perLog2 * log2(n). */
  batchRingBase: 18,
  batchRingPerLog2: 6,
  minTransientSec: 0.9,
  /** Lifetime per event type, seconds (pulse + landing). */
  durationSec: {
    dispatch: 1.8,
    complete: 1.6 + 2.4,
    fail: 1.4,
    batch: 1.4,
    agentOnline: 1.2,
    agentOffline: 1.5,
  },
  landingSec: { TubeSheet: 1.8, BonnetFlange: 1.2, HeatExchangerFab: 2.4 },
  completePulseSec: 1.6,
  dispatchTrailPoints: 6,
  dispatchTrailPx: 24,
  faceRingR: [0.08, 0.55],
  failRingPx: [10, 34],
  alpha: { dispatchCore: 0.85, dispatchTrail: 0.25, completeRing: 0.4, failure: 0.32, batch: 0.3 },
  completedGraceSec: 60,
  stillCompletionWindowSec: 600,
} as const;

// ---------------------------------------------------------------- layer 10: resolve

export const RESOLVE = {
  maxQuietRects: 12,
  quietInflateX: 16,
  quietInflateY: 12,
  quietRadius: 12,
  quietFeatherPx: 56,
  /** Fraction of the lattice + haze field kept inside quiet cores (lines and points are fully masked). */
  quietFieldFloor: 0.55,
  quietFeatherHighContrastPx: 96,
  fallbackGuard: { delayMs: 500, heightPx: 140, widthFrac: 0.6, suppression: 0.6 },
  topFadePx: 24,
  softclipKnee: 0.12,
  softclipCeiling: 0.3,
  accumGain: 2,
  accumPrescale: 0.5,
  capColumnL: 0.02,
  capStageL: 0.04,
  lineColumnScale: 0.4,
  vignette: { amount: 0.2, inner: 0.55, outer: 1.15 },
  quietMaxL: 0.02,
  meanFrameL: 0.012,
  nearBaseFrac: 0.6,
  nearBaseDeltaL: 0.002,
  scrollBoostMs: 300,
} as const;

// ---------------------------------------------------------------- pages and transitions

/** Layer weights per page: twin, flows, lattice, streaks, network, haze. */
export const PAGE_WEIGHTS = {
  modules: { twin: 1.0, flows: 1.0, lattice: 1.0, streaks: 1.0, network: 0.8, haze: 1.0 },
  jobs: { twin: 0.5, flows: 0.5, lattice: 0.6, streaks: 0.6, network: 1.5, haze: 0.7 },
  workspace: { twin: 0.85, flows: 0.55, lattice: 0.7, streaks: 0.7, network: 0.45, haze: 0.85 },
  // Storage-tank workspaces: the exchanger twin isn't their object, so only the plate, haze and network show.
  tankWorkspace: { twin: 0, flows: 0, lattice: 0.8, streaks: 0, network: 0.45, haze: 0.9 },
} as const;

export const TRANSITIONS = {
  smallTweenMs: 900,
  farFieldCrossfadeMs: 600,
  weightsMs: 900,
  hazeDip: { totalMs: 1000, cutAtMs: 400, fogFrom: 0.14, fogTo: 0.85, intensityTo: 0.35 },
  sidebarGlideMs: 400,
  stillTime: 37,
  stillRollDeg: 18,
  opening: { printDelayMs: 200, printMs: 1600, rippleMs: 500, particlesAtMs: 1800, particlesFadeMs: 1000, nodesAtMs: 2000, nodeStaggerMs: 80, steadyAtMs: 2600, storageKey: "mega.ambient.opened" },
} as const;

// ---------------------------------------------------------------- interaction and pacing

export const INTERACTION = {
  typingResumeMs: 4000,
  tiltBoostDeg: 0.02,
  tiltBoostHoldMs: 1500,
  motionStorageKey: "mega.ambient.motion",
} as const;

export const PACING = {
  baseFps: 30,
  lowFps: 20,
  boostFps: 60,
  blurTransientFps: 15,
  idle20FpsMs: 60_000,
  idleFreezeMs: 600_000,
  idleRunningFps: 15,
  localBusyFps: 20,
  maxDtMs: 50,
  refreshSampleFrames: 30,
  stillDebounceMs: 200,
  resizeDebounceMs: 150,
  blurReplayMax: 3,
} as const;

export interface TierDef {
  dprCap: number;
  pixelBudget: number;
  shellParticles: number;
  tubeParticles: number;
  processParticles: number;
  wireMax: number;
  streaks: number;
  hazeHz: number;
  scanlines: boolean;
  glassFill: boolean;
  fps: number;
}

export const TIERS: Record<1 | 2 | 3, TierDef> = {
  3: { dprCap: 2, pixelBudget: 3.6e6, shellParticles: 360, tubeParticles: 210, processParticles: 120, wireMax: 1900, streaks: 600, hazeHz: 10, scanlines: true, glassFill: true, fps: 30 },
  2: { dprCap: 1.5, pixelBudget: 2.8e6, shellParticles: 220, tubeParticles: 140, processParticles: 80, wireMax: 1300, streaks: 300, hazeHz: 5, scanlines: false, glassFill: true, fps: 30 },
  1: { dprCap: 1.25, pixelBudget: 2.0e6, shellParticles: 110, tubeParticles: 70, processParticles: 40, wireMax: 700, streaks: 120, hazeHz: 0, scanlines: false, glassFill: false, fps: 24 },
};

export const GOVERNOR = {
  windowFrames: 60,
  downP90: 1.25,
  downWindows: 2,
  upAfterSec: 10,
  upP90: 0.7,
  upMinGapSec: 8,
  lockAfterDowngrades: 2,
  t1FailSec: 5,
} as const;
