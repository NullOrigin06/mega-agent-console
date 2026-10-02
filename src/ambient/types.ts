/**
 * Shared contract for the "Duty Field" ambient background.
 *
 * The background is one holographic heat exchanger whose behaviour is the
 * live state of the console (agents, jobs, API health). It is rendered by a
 * lazily-loaded raw-WebGL2 engine (src/ambient/engine.ts) driven by the
 * always-loaded React wrapper (src/components/ambient/AmbientBackground.tsx).
 *
 * Coordinate conventions - every module must follow these:
 *  - "viewport px": CSS pixels relative to the browser viewport.
 *  - "canvas px":   CSS pixels relative to the canvas top-left. The canvas
 *                   spans x from the sidebar's right edge to the viewport
 *                   right, y from --ambient-top to the viewport bottom.
 *  - "doc px":      CSS pixels relative to the document (viewport + scrollY).
 *  - "twin-local":  model units where the shell inside diameter D = 1.
 *                   Vessel axis = +X, rear tube-sheet face at x = -L/2,
 *                   front tube-sheet face at x = +L/2 (L = tubeLength / shellId).
 *                   +Y is up, +Z points out of the screen at zero yaw.
 *  - Matrices are column-major Float32Array(16), WebGL convention.
 *
 * This file is types only (plus a few literal constants); it must not import
 * anything heavy. Note the repo uses `erasableSyntaxOnly`: no enums, no
 * parameter properties, no namespaces.
 */
import type { ModuleKind } from "../types/engineering";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Which console surface is showing. "workspace" = a module workspace page. */
export type AmbientPage = "modules" | "jobs" | "workspace";

/** User preference (persisted): auto follows prefers-reduced-motion. */
export type AmbientMotionPref = "auto" | "on" | "off";

/** What the engine actually does right now. "still" = one composed frame per change. */
export type AmbientRenderMode = "live" | "still";

/** Value written to html[data-ambient]. */
export type AmbientDocState = "live" | "still" | "off";

/**
 * Camera poses - every page is one pose of the same object.
 * overview  - Command Center 3/4 view (36 deg off-axis, pitch -4)
 * telemetry - Jobs pages: same angles, smaller (D_px x 0.7), network is the hero
 * face      - Tube Sheet workspace: near end-on (10 deg), tube field converges on the face
 * bonnet    - Bonnet Flange workspace: 62 deg, framed on the exploded front channel
 * section   - HX Fab workspace: near side view (8 deg), literal counter-flow lanes
 * wide      - overview variant when the right gutter is >= 200 px
 * porthole  - narrow canvases (< 900 px): end-on tunnel in the top-right corner
 */
export type PoseName = "overview" | "telemetry" | "face" | "bonnet" | "section" | "wide" | "porthole";

/** Twin region ids (match MODULE_COLORS ownership in VesselViewport3D). */
export const REGION_NEUTRAL = 0;
export const REGION_TUBESHEET = 1; // tube sheets + bundle + face mouths
export const REGION_BONNET = 2; // bonnets, channels, flanges, bolts
export const REGION_SHELL = 3; // shell, baffles, nozzles, saddles (HeatExchangerFab)
export type TwinRegion = 0 | 1 | 2 | 3;

/** Normalised vessel geometry in twin-local units (D = 1). Built from VesselSpec. */
export interface VesselModel {
  /** Tube length / shell ID, clamped to 2.5..6. */
  length: number;
  bonnetFront: number;
  bonnetRear: number;
  /** Tube-sheet OD / shell ID (~1.19). */
  tubeSheetOD: number;
  /** Body flange OD / shell ID. */
  flangeOD: number;
  flangeThk: number;
  tubeSheetThk: number;
  /** Bolt PCD / shell ID (~1.125). */
  boltPCD: number;
  /** Clamped 8..48. */
  boltQty: number;
  /** Clamped 0..12. */
  baffleQty: number;
  /** Segmental baffle cut as a fraction of D (0.25). */
  baffleCut: number;
  tubeQty: number;
  /** Tube OD / shell ID. */
  tubeOD: number;
  /** Shell nozzles. xFrac: 0 = rear tube sheet .. 1 = front tube sheet. od in D units, clamped 0.08..0.25. */
  nozzles: Array<{ id: string; xFrac: number; angleDeg: number; od: number }>;
  /** Source job id, or null for typical proportions. */
  jobId: string | null;
}

export interface AgentNodeInput {
  id: string;
  online: boolean;
  /** This browser's own paired agent (utils/agentPairing.ts). */
  isLocal: boolean;
}

export interface LedgerEntry {
  /** Stable key (job id) used to hash a face mouth. */
  key: string;
  status: "completed" | "failed";
  /** Age in hours since completion/failure. Only entries < 168 h are passed. */
  ageHours: number;
  module: ModuleKind;
}

/** Derived, slowly-changing telemetry (see useAmbientSignals). */
export interface AmbientSignals {
  apiOk: boolean;
  running: number;
  queued: number;
  runningByModule: Record<ModuleKind, number>;
  /** clamp(completedLast24h / 12, 0, 1). Drives how far the flows change colour. */
  activity: number;
  /** Last 7 days of completed/failed jobs (newest first, <= 64 entries). */
  ledger: LedgerEntry[];
  agents: AgentNodeInput[];
  /** This browser's paired agent is online and a job is running (CAD likely shares the GPU). */
  localAgentBusy: boolean;
}

export interface AmbientSceneState {
  page: AmbientPage;
  workspaceModule: ModuleKind | null;
  /** Hover-linked module (tile / sidebar item), or null. */
  highlight: ModuleKind | null;
  signals: AmbientSignals;
  /** Job detail of a running job (page "jobs"): that module's region glows +0.15. */
  detailModule?: ModuleKind | null;
  /** prefers-contrast: more - lattice and haze only, 96 px quiet-core feather. */
  contrastMore?: boolean;
}

/** Measured DOM layout, re-sent on resize / route commit / sidebar change. */
export interface AmbientLayout {
  viewportW: number;
  viewportH: number;
  /** Canvas rect in viewport px (x = sidebar right edge, y = ambient top). */
  canvas: Rect;
  /** Hero "stage" in canvas px at scroll 0 (empty band beside the page header), or null. */
  stage: Rect | null;
  /** Content column in canvas px at scroll 0, or null. */
  column: Rect | null;
  /** Quiet cores (text that sits on the background) in doc px, max 12, already inflated. */
  quiet: Rect[];
  /** window.devicePixelRatio (raw; the engine applies tier caps). */
  devicePixelRatio: number;
  /** canvas.w < 900 -> porthole pose, tier <= T1. */
  narrow: boolean;
  /** (pointer: coarse) */
  coarsePointer: boolean;
}

export type AmbientEventType = "dispatch" | "complete" | "fail" | "batch" | "agentOnline" | "agentOffline";

export interface AmbientEvent {
  type: AmbientEventType;
  module?: ModuleKind;
  agentId?: string;
  jobId?: string;
  /** For "batch": how many transitions were coalesced. */
  count?: number;
}

/** Environment hints the wrapper forwards; the engine owns all pacing decisions. */
export interface AmbientActivityHints {
  windowFocused: boolean;
  /** An input/textarea/select/contenteditable has focus. */
  typing: boolean;
  /** A pointer button is down (selection/drag) - freeze tilt. */
  pointerDown: boolean;
  /** ms since the last pointer/key/scroll/data event. */
  idleMs: number;
}

export type AmbientFallbackReason = "no-webgl2" | "caveat" | "software-renderer" | "context-lost" | "low-battery" | "error";

export interface AmbientEngineOptions {
  /** Called once when the first composed GL frame is on screen (start the 600 ms crossfade). */
  onFirstFrame?: () => void;
  /** Called when the engine gives up on WebGL; the wrapper then loads fallback2d. */
  onFallback?: (reason: AmbientFallbackReason) => void;
  /** Called on webglcontextlost (fade the poster back in) and restored. */
  onContextLost?: () => void;
  onContextRestored?: () => void;
  /** Dev overlay / query flags parsed by the wrapper (?ambient=debug|lum|stress|still, ?ambientDemo=1). */
  debug?: { overlay?: boolean; lum?: boolean; stress?: boolean; forceStill?: boolean; stillTime?: number; pose?: PoseName };
  /** Play the once-per-session "print" opening. */
  playOpening?: boolean;
}

export interface AmbientEngine {
  setState(state: AmbientSceneState): void;
  setLayout(layout: AmbientLayout): void;
  /** window.scrollY in CSS px. Cheap; called from a passive scroll listener. */
  setScroll(scrollY: number): void;
  /** Pointer normalised to the canvas in [-1, 1]; inside=false when it left the window. */
  setPointer(nx: number, ny: number, inside: boolean): void;
  setVessel(model: VesselModel): void;
  pushEvents(events: AmbientEvent[]): void;
  setMode(mode: AmbientRenderMode): void;
  /** Suspend rendering entirely (3D twin open, palette/modal open). Last frame stays on screen. */
  setSuspended(suspended: boolean): void;
  setHints(hints: AmbientActivityHints): void;
  destroy(): void;
}

/** Signature of engine.ts's default-exported factory. Returns null when WebGL2 is unusable (caller falls back). */
export type CreateAmbientEngine = (canvas: HTMLCanvasElement, options: AmbientEngineOptions) => AmbientEngine | null;

/** Signature of fallback2d.ts's exported renderer: draws one Canvas2D still; call again on any change. */
export type RenderAmbientStill2D = (
  canvas: HTMLCanvasElement,
  input: { state: AmbientSceneState; layout: AmbientLayout; vessel: VesselModel; scrollY: number },
) => void;
