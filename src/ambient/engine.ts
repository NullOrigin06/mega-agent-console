/**
 * Duty Field engine: raw WebGL2, 3 draw calls per frame (4 when the haze
 * refreshes is the spec budget; this does haze + instanced + composite):
 *   A haze      -> half-res RGB10_A2 (only on refresh ticks)
 *   C instanced -> full-res RGB10_A2 accum, additive (streaks, wire, links, sprites)
 *   B composite -> default framebuffer (lattice, glass, soft-clip, masks, dither)
 *
 * A module-level singleton (StrictMode double mounts never make a second
 * context). It owns the rAF loop with integer-divisor pacing and every pause
 * rule; data textures are rebuilt only on layout / vessel / agent / ledger
 * changes and the per-frame work is one UBO bufferSubData, with no
 * allocations in steady state. Still mode renders one seeded frame per change.
 */
import {
  createCameraFrame,
  defaultStage,
  easeInOutCubic,
  easeInOutSine,
  easeK,
  hazeDip,
  isLargePoseChange,
  lowPassK,
  mat4Invert,
  mat4Multiply,
  poseForPage,
  rollDegAt,
  solveCamera,
  swingYawDeg,
  telemetryEmblem,
} from "./camera";
import {
  CAMERA,
  CRESCENT,
  EVENTS,
  EVENT_TYPE_ID,
  FLOW,
  GLASS,
  HAZE,
  INTERACTION,
  LATTICE,
  MODULE_TINT,
  NETWORK,
  PACING,
  PAGE_WEIGHTS,
  RESOLVE,
  SCAN_BAND,
  STREAKS,
  TRANSITIONS,
  WIRE,
} from "./constants";
import { createEventPool } from "./events";
import {
  bindTexture,
  createByteTexture,
  createContext,
  createDataTexture,
  createTarget,
  createUbo,
  deleteProgram,
  deleteTarget,
  finishProgram,
  programDone,
  rendererString,
  startProgram,
  uploadData,
  type Program,
  type Target,
} from "./gl";
import { buildFlowLut, hexToRgb } from "./lut";
import { fnv1a, layoutNetwork, type NetworkLayout } from "./network";
import { buildValueNoise } from "./noise";
import { buildFlowPaths, PATH_SAMPLES, type FlowPaths } from "./paths";
import { COMPOSITE_FRAG } from "./shaders/composite.frag";
import { DATA_ROWS, DATA_W, FLAG_GLASS, FLAG_LUM, FLAG_SCANLINES, MAX_LINK_SEGMENTS, MAX_SEGMENTS, NODE_CLUSTER, NODE_GHOST, NODE_LOCAL, NODE_ONLINE, NODE_REAR, UBO } from "./shaders/common.glsl";
import { FULLSCREEN_VERT } from "./shaders/fullscreen.vert";
import { HAZE_FRAG } from "./shaders/haze.frag";
import { INSTANCED_FRAG } from "./shaders/instanced.frag";
import { INSTANCED_VERT } from "./shaders/instanced.vert";
import { createGovernor, effectiveDpr, isSoftwareRenderer, readBattery, readTierEnv, startTier, tierDef, type Tier } from "./tiers";
import { buildTwinGeometry, classAlphaTable, segmentBudget, tubeFieldRadius, vesselLayout, type TwinGeometry, type VesselLayout } from "./twinGeometry";
import { REGION_BONNET, REGION_SHELL, REGION_TUBESHEET } from "./types";
import type {
  AmbientActivityHints,
  AmbientEngine,
  AmbientEngineOptions,
  AmbientEvent,
  AmbientLayout,
  AmbientRenderMode,
  AmbientSceneState,
  CreateAmbientEngine,
  PoseName,
  Rect,
  VesselModel,
} from "./types";
import type { ModuleKind } from "../types/engineering";

const DEG = Math.PI / 180;
const lk = (dt: number, tau: number, still: boolean) => (still ? 1 : lowPassK(dt, tau));
const sat = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, x: number) => {
  const t = sat((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const REGION: Record<ModuleKind, number> = { TubeSheet: REGION_TUBESHEET, BonnetFlange: REGION_BONNET, HeatExchangerFab: REGION_SHELL };
const MODULES: readonly ModuleKind[] = ["TubeSheet", "BonnetFlange", "HeatExchangerFab"];

/** A solved camera, reduced to what the frame loop needs (lerpable). */
interface Shot {
  vp: Float32Array;
  eye: Float64Array;
  focal: number;
  /** twin box x, y, w, h; front face x, y, r (canvas px) */
  box: Float64Array;
  face: Float64Array;
  axis: Float64Array;
  shellR: number;
  /** Twin-local x the swing / tilt pivots about (the pose's camera target). */
  pivot: number;
}
const newShot = (): Shot => ({ vp: new Float32Array(16), eye: new Float64Array(3), focal: 1, box: new Float64Array(4), face: new Float64Array(3), axis: new Float64Array(2), shellR: 1, pivot: 0 });
function lerpShot(a: Shot, b: Shot, k: number, o: Shot) {
  for (let i = 0; i < 16; i++) o.vp[i] = a.vp[i] + (b.vp[i] - a.vp[i]) * k;
  for (let i = 0; i < 4; i++) o.box[i] = a.box[i] + (b.box[i] - a.box[i]) * k;
  for (let i = 0; i < 3; i++) {
    o.eye[i] = a.eye[i] + (b.eye[i] - a.eye[i]) * k;
    o.face[i] = a.face[i] + (b.face[i] - a.face[i]) * k;
  }
  o.axis[0] = a.axis[0] + (b.axis[0] - a.axis[0]) * k;
  o.axis[1] = a.axis[1] + (b.axis[1] - a.axis[1]) * k;
  o.focal = a.focal + (b.focal - a.focal) * k;
  o.shellR = a.shellR + (b.shellR - a.shellR) * k;
  o.pivot = a.pivot + (b.pivot - a.pivot) * k;
}

/** Writes a rigid column-major mat4 (3x3 columns a, b, c + translation t) without allocating. */
function m16(o: Float32Array, a0: number, a1: number, a2: number, b0: number, b1: number, b2: number, c0: number, c1: number, c2: number, t0: number, t1: number, t2: number) {
  o[0] = a0;
  o[1] = a1;
  o[2] = a2;
  o[4] = b0;
  o[5] = b1;
  o[6] = b2;
  o[8] = c0;
  o[9] = c1;
  o[10] = c2;
  o[12] = t0;
  o[13] = t1;
  o[14] = t2;
  o[3] = o[7] = o[11] = 0;
  o[15] = 1;
}

let current: { canvas: HTMLCanvasElement; api: AmbientEngine } | null = null;

/** Singleton factory: a second call for the same canvas returns the live engine; a new canvas replaces it. */
const createAmbientEngine: CreateAmbientEngine = (canvas, options) => {
  if (current?.canvas === canvas) return current.api;
  current?.api.destroy();
  const api = startEngine(canvas, options);
  current = api ? { canvas, api } : null;
  return api;
};
export default createAmbientEngine;

function probeReason(): "caveat" | "no-webgl2" {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return gl ? "caveat" : "no-webgl2";
  } catch {
    return "no-webgl2";
  }
}

function startEngine(canvas: HTMLCanvasElement, opts: AmbientEngineOptions): AmbientEngine | null {
  const dbg = opts.debug ?? {};
  // A "major performance caveat" (hardware acceleration off, blocklisted GPU,
  // some privacy browsers) no longer means no motion: take the context anyway,
  // cap at T1 and let the frame governor drop to the still if it's really slow.
  let caveat = false;
  let created = createContext(canvas);
  if (!created) {
    created = createContext(canvas, true);
    caveat = created !== null;
  }
  if (!created) {
    opts.onFallback?.(probeReason());
    return null;
  }
  const gl: WebGL2RenderingContext = created;
  if (isSoftwareRenderer(rendererString(gl))) {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    opts.onFallback?.("software-renderer");
    return null;
  }

  // ---------------------------------------------------------------- CPU-side sources (rebuild-safe)
  const lutData = buildFlowLut();
  const noiseData = buildValueNoise(HAZE.noiseSize);
  const data = new Float32Array(DATA_W * DATA_ROWS.count * 4);
  const ubo = new Float32Array(UBO.SIZE * 4);
  const uboI = new Int32Array(ubo.buffer);
  const evOut = ubo.subarray(UBO.EV * 4, UBO.EV * 4 + EVENTS.poolSize * 4);
  const pool = createEventPool();
  const u4 = (slot: number, a: number, b: number, c: number, d: number) => {
    const o = slot * 4;
    ubo[o] = a;
    ubo[o + 1] = b;
    ubo[o + 2] = c;
    ubo[o + 3] = d;
  };
  const i4 = (slot: number, a: number, b: number, c: number, d: number) => {
    const o = slot * 4;
    uboI[o] = a;
    uboI[o + 1] = b;
    uboI[o + 2] = c;
    uboI[o + 3] = d;
  };

  // ---------------------------------------------------------------- GL resources
  let progs: Program[] = [];
  let parallel = false;
  let ready = false;
  let uboBuf: WebGLBuffer | null = null;
  let dataTex: WebGLTexture | null = null;
  let lutTex: WebGLTexture | null = null;
  let noiseTex: WebGLTexture | null = null;
  let hazeT: Target | null = null;
  let accT: Target | null = null;
  let vao: WebGLVertexArrayObject | null = null;
  let hazeLoc: WebGLUniformLocation | null = null;

  const init = () => {
    parallel = !!gl.getExtension("KHR_parallel_shader_compile");
    progs = [];
    for (const [vs, fs] of [
      [FULLSCREEN_VERT, HAZE_FRAG],
      [INSTANCED_VERT, INSTANCED_FRAG],
      [FULLSCREEN_VERT, COMPOSITE_FRAG],
    ]) {
      const p = startProgram(gl, vs, fs);
      if (p) progs.push(p);
    }
    uboBuf = createUbo(gl, UBO.SIZE * 16);
    dataTex = createDataTexture(gl, DATA_W, DATA_ROWS.count);
    lutTex = createByteTexture(gl, lutData.length / 8, 2, lutData, true, false);
    noiseTex = createByteTexture(gl, Math.sqrt(noiseData.length), Math.sqrt(noiseData.length), noiseData, false, true);
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.disable(gl.DEPTH_TEST);
    hazeT = accT = null;
    bufW = bufH = 0;
    ready = false;
    dataDirty = hazeDirty = true;
  };

  /** Polls parallel compile; on completion checks LINK_STATUS once. */
  const pollReady = (): boolean => {
    if (ready) return true;
    if (progs.length < 3) return fail();
    for (const p of progs) if (!programDone(gl, parallel, p)) return false;
    const samplers = [["uNoise"], ["uData", "uLut"], ["uHaze", "uAcc"]];
    for (let i = 0; i < 3; i++) if (!finishProgram(gl, progs[i], samplers[i])) return fail();
    hazeLoc = gl.getUniformLocation(progs[0].prog, "uR");
    ready = true;
    resize(true);
    return true;
  };
  let failed = false;
  const fail = () => {
    if (!failed) opts.onFallback?.("error");
    failed = true;
    return false;
  };

  // ---------------------------------------------------------------- inputs
  let layout: AmbientLayout | null = null;
  let state: AmbientSceneState | null = null;
  let model: VesselModel | null = null;
  let mode: AmbientRenderMode = "live";
  let suspended = false;
  let destroyed = false;
  let lost = false;
  let losses = 0;
  const hints: AmbientActivityHints = { windowFocused: true, typing: false, pointerDown: false, idleMs: 0 };
  let activityAt = performance.now();
  let typingEndAt = -1e9;
  let scrollY = 0;
  let scrollAt = -1e9;
  let ptrX = 0;
  let ptrY = 0;
  let ptrInside = false;
  let ptrAt = 0;

  // ---------------------------------------------------------------- tiers
  let detected: Tier = 2;
  let governor = createGovernor(detected, performance.now());
  let batteryCap: Tier = 3;
  let tierKnown = false;
  readBattery().then((b) => {
    if (destroyed || !b || b.charging) return;
    batteryCap = b.level < 0.2 ? 0 : b.level < 0.3 ? 1 : 3;
    if (batteryCap < 3) onTierChange();
  });
  let tier: Tier = 2;
  const computeTier = (): Tier => {
    let t = Math.min(governor.tier, batteryCap) as Tier;
    if (state?.signals.localAgentBusy && t > 1) t = (t - 1) as Tier;
    if (layout?.narrow && t > 1) t = 1;
    if (dbg.stress) t = 3;
    return t;
  };

  // ---------------------------------------------------------------- sizes
  let cssW = 1;
  let cssH = 1;
  let bufW = 0;
  let bufH = 0;
  let elemLeft = 0;
  let resizeTimer = 0;

  const resize = (now: boolean) => {
    if (!layout || !ready) return;
    if (!now) {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => resize(true), PACING.resizeDebounceMs);
      return;
    }
    cssW = canvas.clientWidth || layout.viewportW;
    cssH = canvas.clientHeight || layout.canvas.h;
    const dpr = effectiveDpr(tier, layout.devicePixelRatio, cssW, cssH);
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (w === bufW && h === bufH && accT) return;
    bufW = canvas.width = w;
    bufH = canvas.height = h;
    const hs = tier <= 1 ? HAZE.t1BakeScale : HAZE.resolutionScale;
    deleteTarget(gl, hazeT);
    deleteTarget(gl, accT);
    hazeT = createTarget(gl, Math.max(1, Math.round(w * hs)), Math.max(1, Math.round(h * hs)));
    accT = createTarget(gl, w, h);
    gl.useProgram(progs[0].prog);
    gl.uniform2f(hazeLoc, hazeT.w / cssW, hazeT.h);
    hazeDirty = true;
    request();
  };

  // ---------------------------------------------------------------- scene (rebuilt on change only)
  const frame = createCameraFrame();
  const shotCur = newShot();
  const shotFrom = newShot();
  const shotTo = newShot();
  let pose: PoseName = "overview";
  let geo: TwinGeometry | null = null;
  let paths: FlowPaths | null = null;
  let net: NetworkLayout | null = null;
  let dataDirty = true;
  let hazeDirty = true;
  let classes = classAlphaTable(pose);
  let lay: VesselLayout | null = null;
  let stage: Rect = { x: 0, y: 0, w: 1, h: 1 };
  let tint: [number, number, number] | null = null;
  let shellLen = 1;
  let tubeLen = 1;
  let procLen = 1;
  let tweenAt = -1;
  let tweenMs = 0;
  let dipAt = -1;
  let dipPose: PoseName | null = null;
  let xfAt = -1e9;
  let vpOldX = 0;
  let vpOldY = 0;
  let vpOldInf = 0;
  let invDirty = true;
  const invVP = new Float32Array(16);
  const nodeSeen = new Map<string, { online: boolean; t: number }>();
  let agentKey = "";
  let ledgerRef: unknown = null;
  const linkOfNode: number[] = [];

  const canvasW = () => layout?.canvas.w ?? cssW;
  const canvasH = () => layout?.canvas.h ?? cssH;
  const stageOf = (): Rect => stage;
  const targetPose = (): PoseName => dbg.pose ?? (state && layout ? poseForPage(state.page, state.workspaceModule, layout) : "overview");

  const solveInto = (p: PoseName, out: Shot) => {
    if (!model || !layout) return;
    solveCamera({ pose: p, canvasW: canvasW(), canvasH: canvasH(), stage: stageOf(), column: layout.column, model, yawOffsetDeg: 0, pitchOffsetDeg: 0, rollDeg: 0 }, frame);
    out.vp.set(frame.viewProj);
    out.eye[0] = frame.eye[0];
    out.eye[1] = frame.eye[1];
    out.eye[2] = frame.eye[2];
    out.focal = frame.focalPx;
    const b = frame.twinBox;
    out.box[0] = b.x;
    out.box[1] = b.y;
    out.box[2] = b.w;
    out.box[3] = b.h;
    out.face[0] = frame.frontFace.x;
    out.face[1] = frame.frontFace.y;
    out.face[2] = frame.frontFace.radiusPx;
    out.axis[0] = frame.axisScreenDir.x;
    out.axis[1] = frame.axisScreenDir.y;
    out.shellR = frame.shellRadiusPx;
    const lay = vesselLayout(model, p);
    const emblem = p === "telemetry" && telemetryEmblem(stageOf());
    out.pivot = p === "face" || p === "wide" || p === "porthole" || emblem ? lay.front.face : p === "bonnet" ? (lay.front.channelFlangeBack + lay.front.cylEnd) / 2 : 0;
  };

  /** Rebuilds twin geometry, paths, network and ledger for `pose` against shotTo. */
  const rebuildScene = () => {
    if (!model || !layout) return;
    const def = tierDef(tier);
    geo = buildTwinGeometry(model, { shellRadiusPx: shotTo.shellR, maxSegments: Math.min(MAX_SEGMENTS - 300, segmentBudget(boxRect(shotTo), def.wireMax)) }, pose);
    data.fill(0, 0, MAX_SEGMENTS * 8);
    data.set(geo.segments.subarray(0, Math.min(geo.segments.length, MAX_SEGMENTS * 8)), 0);
    paths = buildFlowPaths(model, pose);
    const pathBase = DATA_ROWS.path * DATA_W * 4;
    data.fill(0, pathBase, DATA_ROWS.link * DATA_W * 4);
    data.set(paths.data.subarray(0, Math.min(paths.data.length, 48 * PATH_SAMPLES * 4)), pathBase);
    const meta = DATA_ROWS.pathMeta * DATA_W * 4;
    for (let p = 0; p < paths.pathCount; p++) {
      data[meta + p * 4] = paths.kinds[p];
      data[meta + p * 4 + 1] = paths.lengths[p];
      data[meta + p * 4 + 2] = paths.closed[p];
    }
    const mean = (r: { start: number; count: number }) => {
      let s = 0;
      for (let i = 0; i < r.count; i++) s += paths!.lengths[r.start + i];
      return r.count ? s / r.count : 1;
    };
    shellLen = mean(paths.shell);
    tubeLen = mean(paths.tube);
    procLen = mean(paths.process);
    const xr = DATA_ROWS.xray * DATA_W * 4;
    data.fill(0, xr, xr + DATA_W * 4);
    for (let i = 0; i < Math.min(geo.xrayDotCount, DATA_W); i++) for (let c = 0; c < 3; c++) data[xr + i * 4 + c] = geo.xrayDots[i * 3 + c];
    classes = classAlphaTable(pose);
    lay = vesselLayout(model, pose);
    ledgerRef = null;
    rebuildLedger();
    rebuildNetwork(true);
    dataDirty = hazeDirty = true;
  };
  const boxRect = (s: Shot): Rect => ({ x: s.box[0], y: s.box[1], w: s.box[2], h: s.box[3] });

  const rebuildLedger = () => {
    if (!geo || !state || state.signals.ledger === ledgerRef) return;
    ledgerRef = state.signals.ledger;
    const n = Math.min(geo.faceMouthCount, DATA_W);
    const o = DATA_ROWS.mouth * DATA_W * 4;
    data.fill(0, o, o + DATA_W * 4);
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) data[o + i * 4 + c] = geo.faceMouths[i * 3 + c];
    let plugged = 0;
    const L = WIRE.ledger;
    for (const e of state.signals.ledger) {
      if (!n || e.ageHours >= L.windowHours) continue;
      let k = fnv1a(e.key) % n;
      for (let probe = 0; probe < n && data[o + k * 4 + 3] !== 0; probe++) k = (k + 1) % n;
      if (data[o + k * 4 + 3] !== 0) break;
      if (e.status === "completed") data[o + k * 4 + 3] = 1 + Math.max(L.doneFloor, L.doneAlpha * Math.exp(-e.ageHours / L.doneTauHours));
      else data[o + k * 4 + 3] = e.ageHours < L.failPlugHours && plugged++ < L.maxPlugged ? 2 : 3;
    }
    dataDirty = true;
  };

  const rebuildNetwork = (force: boolean) => {
    if (!state || !layout || !geo || !model) return;
    const agents = state.signals.agents;
    const key = agents.map((a) => `${a.id}:${+a.online}${+a.isLocal}`).join(",");
    if (!force && key === agentKey) return;
    agentKey = key;
    const W = canvasW();
    const H = canvasH();
    const camX = layout.canvas.x - elemLeft;
    const hub = (x: number) => {
      // Project the bolt-circle centre with the base shot (no swing): the tether follows live.
      const v = shotTo.vp;
      const cx = v[0] * x + v[12];
      const cy = v[1] * x + v[13];
      const cw = v[3] * x + v[15];
      return { x: ((cx / cw + 1) / 2) * W, y: ((1 - cy / cw) / 2) * H };
    };
    net = layoutNetwork({
      agents,
      canvasW: W,
      canvasH: H,
      narrow: layout.narrow,
      quiet: layout.quiet.map((q) => ({ x: q.x - layout!.canvas.x, y: q.y - layout!.canvas.y, w: q.w, h: q.h })),
      twinBox: boxRect(shotTo),
      column: layout.column,
      stage: layout.stage,
      hubFront: hub(geo.boltFront.center[0]),
      hubRear: hub(geo.boltRear.center[0]),
      latticeOrigin: { x: -camX, y: 0 },
    });
    const live = isLive();
    const nodes = DATA_ROWS.node * DATA_W * 4;
    const links = DATA_ROWS.link * DATA_W * 4;
    const metas = DATA_ROWS.linkMeta * DATA_W * 4;
    data.fill(0, links, (DATA_ROWS.node + 1) * DATA_W * 4);
    const opening = opts.playOpening && live && evClock < TRANSITIONS.opening.steadyAtMs / 1000;
    const first = nodeSeen.size === 0;
    let n = 0;
    net.nodes.forEach((nd, i) => {
      const prev = nodeSeen.get(nd.id);
      let t = -1e3;
      if (opening) t = TRANSITIONS.opening.nodesAtMs / 1000 + (i * TRANSITIONS.opening.nodeStaggerMs) / 1000;
      else if (live && !first && (!prev || prev.online !== nd.online)) t = evClock;
      else if (prev && live) t = prev.t;
      nodeSeen.set(nd.id, { online: nd.online, t });
      const f = (nd.online ? NODE_ONLINE : 0) | (nd.isLocal ? NODE_LOCAL : 0) | (nd.cluster > 0 ? NODE_CLUSTER : 0) | (nd.hub === "rear" ? NODE_REAR : 0);
      data.set([nd.x, nd.y, f, t], nodes + n++ * 4);
    });
    if (net.ghost) data.set([net.ghost.x, net.ghost.y, NODE_GHOST, -1e3], nodes + n++ * 4);
    nodeCount = n;
    let s = 0;
    linkOfNode.length = 0;
    net.links.forEach((lk, li) => {
      const p = lk.points;
      let total = 0;
      for (let k = 2; k < p.length; k += 2) total += Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]);
      linkOfNode[lk.node] = li;
      if (s >= MAX_LINK_SEGMENTS) return;
      data.set([p[0], p[1], p[0], p[1]], links + s * 4);
      data.set([li, -1, total, lk.node], metas + s++ * 4);
      let cum = 0;
      for (let k = 2; k < p.length && s < MAX_LINK_SEGMENTS; k += 2) {
        data.set([p[k - 2], p[k - 1], p[k], p[k + 1]], links + s * 4);
        data.set([li, cum, total, lk.node], metas + s++ * 4);
        cum += Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]);
      }
    });
    linkSegs = s;
    updateLinkCurrents();
    dataDirty = true;
  };
  let nodeCount = 0;
  let linkSegs = 0;

  /** LCUR + broadcast list: exact attribution with one online agent, else <= 3 links at 50%. */
  const updateLinkCurrents = () => {
    ubo.fill(0, UBO.LCUR * 4, UBO.LCUR * 4 + 16);
    ubo.fill(0, UBO.BC * 4, UBO.BC * 4 + 4);
    if (!net || !state) return;
    let online = 0;
    for (let i = 0; i < net.nodes.length; i++) {
      const li = linkOfNode[i];
      if (!net.nodes[i].online || li === undefined || li >= 16) continue;
      if (online < NETWORK.maxAnimatedLinks) ubo[UBO.BC * 4 + online] = li;
      online++;
    }
    ubo[UBO.BC * 4 + 3] = Math.min(online, NETWORK.maxAnimatedLinks);
    uboI[UBO.C6 * 4 + 3] = online;
    if (state.signals.running <= 0) return;
    for (let k = 0; k < Math.min(online, NETWORK.maxAnimatedLinks); k++) ubo[UBO.LCUR * 4 + ubo[UBO.BC * 4 + k]] = online === 1 ? 1 : NETWORK.broadcastAlpha;
  };
  pool.setLinkResolver((agentId) => {
    if (!net) return -1;
    let only = -1;
    let online = 0;
    for (let i = 0; i < net.nodes.length; i++) {
      const li = linkOfNode[i] ?? -1;
      if (agentId !== undefined && net.nodes[i].id === agentId) return li;
      if (net.nodes[i].online) {
        online++;
        only = li;
      }
    }
    return online === 1 ? only : -1;
  });

  /** Pose / layout / vessel / tier changed: re-solve and pick tween, haze-dip cut or instant. */
  const reframe = (layoutOnly: boolean) => {
    if (!model || !layout) return;
    const next = targetPose();
    // Transition stamps use the wall clock when no frame has rendered lately (frozen by
    // blur / idle): `clock` can be minutes old, which would finish tweens and dips at once.
    const wall = performance.now();
    const t0 = wall - clock > PACING.maxDtMs ? wall : clock;
    const animate = isLive() && bufW > 0 && geo !== null;
    if (!animate) {
      pose = next;
      dipAt = tweenAt = -1;
      solveInto(pose, shotTo);
      lerpShot(shotTo, shotTo, 0, shotCur);
      invDirty = true;
      rebuildScene();
      return;
    }
    if (dipAt >= 0 || (next !== pose && !layoutOnly && isLargePoseChange(pose, next))) {
      // Haze-dip match cut: the pose jumps at 400 ms (writeFrame), solved against the latest layout.
      if (dipAt < 0) dipAt = t0;
      dipPose = next;
      return;
    }
    if (next === pose && tweenAt < 0) {
      solveInto(pose, shotTo);
      lerpShot(shotTo, shotTo, 0, shotCur);
      invDirty = true;
      rebuildScene();
      return;
    }
    if (next !== pose) {
      vpOldX = vpX;
      vpOldY = vpY;
      vpOldInf = vpInf;
      xfAt = t0;
    }
    // Small delta (or a stage change mid-tween): tween from the current value, never restart.
    const remaining = tweenAt >= 0 ? Math.max(200, tweenMs - (t0 - tweenAt)) : TRANSITIONS.smallTweenMs;
    lerpShot(shotCur, shotCur, 0, shotFrom);
    pose = next;
    solveInto(pose, shotTo);
    tweenAt = t0;
    tweenMs = remaining;
    rebuildScene();
  };

  // ---------------------------------------------------------------- clocks and eased values
  let clock = 0; // ms, performance.now() of the last rendered frame
  let sceneT = 0; // s, steady-state animation (frozen when blurred)
  let evClock = 0; // s, event transients (advances whenever a frame renders live)
  let lastRender = 0;
  let firstFrame = true;
  let restoring = false;
  let phShell = 0;
  let phTube = 0;
  let phProc = 0;
  let phRiser = 0;
  let speed = FLOW.shell.idlePxPerSec;
  const ease = {
    w: new Float64Array(6),
    lost: 0,
    flowOn: 1,
    halo: 0,
    activity: 0,
    queued: 0,
    hover: new Float64Array(4),
    run: new Float64Array(4),
    detail: new Float64Array(4),
    tint: 0,
    poolX: 0,
    poolY: 0,
    camX: 0,
    tiltX: 0,
    tiltY: 0,
  };
  let tiltMovedAt = -1e9;
  let bandAt = -1e9;
  let bandNext = 0;
  let bandStr = 0;
  let wantCompletionBand = false;
  let lastCompletionBand = -1e9;
  let vpX = 0;
  let vpY = 0;
  let vpInf = 0;
  const RM = new Float32Array(16);
  const RMI = new Float32Array(16);
  const MVP = ubo.subarray(UBO.MVP * 4, UBO.MVP * 4 + 16);
  const IVP = ubo.subarray(UBO.IVP * 4, UBO.IVP * 4 + 16);

  const PW = new Float64Array(6);

  /** Swing (about Y) + tilt pitch (about Z) around the pose pivot: RM and its inverse, column-major. */
  const buildRM = (yaw: number, pitch: number, pivot: number) => {
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cz = Math.cos(pitch);
    const sz = Math.sin(pitch);
    const r00 = cy * cz;
    const r01 = -cy * sz;
    const r02 = sy;
    const r10 = sz;
    const r11 = cz;
    const r20 = -sy * cz;
    const r21 = sy * sz;
    const r22 = cy;
    const tx = pivot - r00 * pivot;
    const ty = -r10 * pivot;
    const tz = -r20 * pivot;
    m16(RM, r00, r10, r20, r01, r11, r21, r02, 0, r22, tx, ty, tz);
    m16(RMI, r00, r01, r02, r10, r11, 0, r20, r21, r22, -(r00 * tx + r10 * ty + r20 * tz), -(r01 * tx + r11 * ty + r21 * tz), -(r02 * tx + r22 * tz));
  };

  // ---------------------------------------------------------------- per-frame uniforms
  const writeFrame = (now: number, dt: number, still: boolean, snapNow = false) => {
    if (!layout || !state || !model || !geo || !paths || !lay) return;
    const sig = state.signals;
    const def = tierDef(tier);
    const page = PAGE_WEIGHTS[state.page];
    const pw = PW;
    // The first frame and a one-off frame while frozen by blur / idle must show the target
    // state (easing would leave every weight at its start value: twin weight 0 = an empty
    // field). The caller says so explicitly; a live wake-up frame eases with a nominal dt.
    const snap = still || snapNow;
    pw[0] = page.twin;
    pw[1] = page.flows;
    pw[2] = page.lattice;
    pw[3] = page.streaks;
    pw[4] = page.network;
    pw[5] = page.haze;
    // prefers-contrast: more - lattice and haze only (the CSS halves the root's alpha).
    if (state.contrastMore) pw[0] = pw[1] = pw[3] = pw[4] = 0;
    for (let i = 0; i < 6; i++) ease.w[i] += (pw[i] - ease.w[i]) * lk(dt, 0.3, snap);
    ease.lost += ((sig.apiOk ? 0 : 1) - ease.lost) * lk(dt, sig.apiOk ? 0.67 : 0.4, snap);
    ease.flowOn += ((sig.apiOk ? 1 : 0) - ease.flowOn) * lk(dt, 0.67, snap);
    ease.halo += ((sig.running > 0 ? 1 : 0) - ease.halo) * lk(dt, CRESCENT.haloRunningEaseSec / 3, snap);
    ease.activity += (sat(sig.activity) - ease.activity) * lk(dt, FLOW.activityTauSec / 3, snap);
    const q = Math.min(sig.queued, geo.boltFront.count);
    ease.queued = snap ? q : ease.queued + Math.sign(q - ease.queued) * Math.min(Math.abs(q - ease.queued), dt / (NETWORK.queuedBoltFadeMs / 1000));
    for (let r = 1; r < 4; r++) {
      const m = MODULES[r - 1];
      const hv = state.highlight === m ? 1 : 0;
      const step = dt / ((hv > ease.hover[r] ? WIRE.hoverInMs : WIRE.hoverOutMs) / 1000);
      ease.hover[r] = snap ? hv : ease.hover[r] + Math.sign(hv - ease.hover[r]) * Math.min(Math.abs(hv - ease.hover[r]), step);
      ease.run[r] += ((sig.runningByModule[m] > 0 ? 1 : 0) - ease.run[r]) * lk(dt, 0.4, snap);
      ease.detail[r] += ((state.page === "jobs" && state.detailModule === m ? 1 : 0) - ease.detail[r]) * lk(dt, 0.4, snap);
    }
    const ws = state.workspaceModule;
    ease.tint += ((ws ? HAZE.workspaceTint[ws] : 0) - ease.tint) * lk(dt, 0.3, snap);
    const camX = layout.canvas.x - elemLeft;
    ease.camX += (camX - ease.camX) * lk(dt, TRANSITIONS.sidebarGlideMs / 3000, snap);
    const st = stage;
    const ek = snap ? 1 : easeK(dt);
    ease.poolX += (camX + st.x + st.w / 2 - ease.poolX) * ek;
    ease.poolY += (st.y + st.h / 2 - ease.poolY) * ek;

    // Pose tween / haze-dip cut.
    let dip = 0;
    if (dipAt >= 0) {
      const d = hazeDip(now - dipAt);
      dip = (d.fog - TRANSITIONS.hazeDip.fogFrom) / (TRANSITIONS.hazeDip.fogTo - TRANSITIONS.hazeDip.fogFrom);
      if (d.cut && dipPose) {
        vpOldX = vpX;
        vpOldY = vpY;
        vpOldInf = vpInf;
        xfAt = now;
        pose = dipPose;
        dipPose = null;
        solveInto(pose, shotTo);
        lerpShot(shotTo, shotTo, 0, shotCur);
        tweenAt = -1;
        invDirty = true;
        rebuildScene();
      }
      if (d.done) dipAt = -1;
    }
    if (tweenAt >= 0) {
      const u = sat((now - tweenAt) / tweenMs);
      lerpShot(shotFrom, shotTo, easeInOutCubic(u), shotCur);
      invDirty = true;
      if (u >= 1) tweenAt = -1;
    }
    if (invDirty) {
      mat4Invert(shotCur.vp, invVP);
      invDirty = false;
    }

    // Swing, roll, tilt.
    const t = still ? (dbg.stillTime ?? TRANSITIONS.stillTime) : sceneT;
    const swinging = pose === "overview" || pose === "telemetry" || pose === "wide";
    const tiltOn = !still && !layout.coarsePointer && !layout.narrow && tier > 0;
    if (tiltOn && !hints.typing && !hints.pointerDown) {
      let tx = ptrInside ? ptrX : 0;
      let ty = ptrInside ? ptrY : 0;
      if (ptrInside && now - ptrAt > CAMERA.tiltRelaxAfterMs) {
        tx *= 1 - CAMERA.tiltRelaxFrac;
        ty *= 1 - CAMERA.tiltRelaxFrac;
      }
      const tk = lowPassK(dt, ptrInside ? CAMERA.tiltTau : CAMERA.tiltLeaveMs / 3000);
      if (Math.abs(tx - ease.tiltX) * CAMERA.tiltYawDeg > INTERACTION.tiltBoostDeg || Math.abs(ty - ease.tiltY) * CAMERA.tiltPitchDeg > INTERACTION.tiltBoostDeg) tiltMovedAt = now;
      ease.tiltX += (tx - ease.tiltX) * tk;
      ease.tiltY += (ty - ease.tiltY) * tk;
    } else if (!tiltOn) {
      ease.tiltX = ease.tiltY = 0;
    }
    const yaw = (swinging ? swingYawDeg(t) : 0) + ease.tiltX * CAMERA.tiltYawDeg;
    const pitch = -ease.tiltY * CAMERA.tiltPitchDeg;
    const roll = still ? TRANSITIONS.stillRollDeg : rollDegAt(pose, t);
    buildRM(yaw * DEG, pitch * DEG, shotCur.pivot);
    mat4Multiply(shotCur.vp, RM, MVP);
    mat4Multiply(RMI, invVP, IVP);

    // Vanishing point = MVP * (-axis, 0), in element px.
    const W = canvasW();
    const H = canvasH();
    const cw = -MVP[3];
    const vx = ((-MVP[0] / cw + 1) / 2) * W;
    const vy = ((1 + MVP[1] / cw) / 2) * H;
    const far = CAMERA.vpInfinityDiagonals * Math.hypot(W, H);
    vpInf = pose === "section" || Math.abs(cw) < 1e-6 || Math.hypot(vx - W / 2, vy - H / 2) > far ? 1 : 0;
    vpX = vpInf ? shotCur.axis[0] : vx + ease.camX;
    vpY = vpInf ? shotCur.axis[1] : vy;

    // Flow speeds (px/s -> path phase/s), apiOk=false decelerates to 0 over 2 s.
    const busy = FLOW.shell.idlePxPerSec * (1 + FLOW.shell.runningGain * sig.running + FLOW.shell.queuedGain * sig.queued);
    speed += (Math.min(FLOW.shell.maxPxPerSec, busy) - speed) * ek;
    const dpx = Math.max(1, 2 * shotCur.shellR);
    const f = ease.flowOn;
    if (!still) {
      const sk = speed / FLOW.shell.idlePxPerSec;
      phShell = (phShell + (dt * speed * f) / (shellLen * dpx)) % 8;
      phTube = (phTube + (dt * Math.min(FLOW.tube.maxPxPerSec, FLOW.tube.idlePxPerSec * sk) * f) / (tubeLen * dpx)) % 8;
      phProc = (phProc + (dt * FLOW.processPxPerSec * f) / (procLen * dpx)) % 8;
      phRiser = (phRiser + (dt * FLOW.riserPxPerSec * f) / (procLen * dpx)) % 8;
    }

    // Scan band (rear -> front over 3.2 s) and the opening print.
    const x0 = lay.rear.tip;
    const x1 = lay.front.tip;
    const running = sig.running > 0;
    const allowed = sig.apiOk && (state.page === "modules" || (state.page === "jobs" ? running : ws ? sig.runningByModule[ws] > 0 : false));
    const calm = hints.typing || now - typingEndAt < INTERACTION.typingResumeMs;
    if (!still && allowed && !calm) {
      if (wantCompletionBand && sceneT - lastCompletionBand >= SCAN_BAND.completionMinGap) {
        bandAt = lastCompletionBand = sceneT;
        bandStr = 1;
      } else if (sceneT >= bandNext && sceneT - bandAt > SCAN_BAND.sweepSec) {
        bandAt = sceneT;
        bandStr = running ? 1 : SCAN_BAND.idleStrength;
        bandNext = sceneT + (running ? SCAN_BAND.runningPeriod : SCAN_BAND.idlePeriod);
      }
    }
    wantCompletionBand = false;
    const bu = (sceneT - bandAt) / SCAN_BAND.sweepSec;
    let bandX = x0;
    let band = 0;
    if (!still && bu >= 0 && bu <= 1) {
      bandX = x0 + (x1 - x0) * easeInOutSine(bu);
      band = bandStr * smooth(0, 0.1, bu) * smooth(1, 0.9, bu) * (1 - ease.lost);
    }
    if (dbg.stress) {
      bandX = x0 + 0.04 * (x1 - x0);
      band = 1;
    }
    let printX = 1e3;
    let ripple = 2;
    let partFade = 1;
    let glassFade = 1;
    const O = TRANSITIONS.opening;
    if (opts.playOpening && !still && evClock < O.steadyAtMs / 1000) {
      const ms = evClock * 1000;
      const pu = (ms - O.printDelayMs) / O.printMs;
      printX = pu < 0 ? -1e3 : pu > 1 ? 1e3 : x0 + (x1 - x0) * easeInOutSine(pu);
      if (pu >= 0 && pu <= 1) {
        bandX = printX;
        band = 1;
      }
      ripple = sat((ms - O.printDelayMs - O.printMs + O.rippleMs) / O.rippleMs);
      partFade = sat((ms - O.particlesAtMs) / O.particlesFadeMs);
      glassFade = sat(pu);
    }

    // HX Fab completion: one emerald pass along the shell.
    pool.pack(evClock, evOut);
    let emX = 0;
    let emS = 0;
    for (let e = 0; e < EVENTS.poolSize; e++) {
      const o = (UBO.EV + e) * 4;
      if (ubo[o] !== EVENT_TYPE_ID.complete || ubo[o + 3] !== REGION_SHELL) continue;
      const u = (evClock - ubo[o + 1] - EVENTS.completePulseSec) / EVENTS.landingSec.HeatExchangerFab;
      if (u < 0 || u > 1) continue;
      emX = -lay.halfL + model.length * u;
      emS = Math.sin(Math.PI * u);
    }
    if (still || dbg.stress) ubo.fill(0, UBO.EV * 4, UBO.EV * 4 + 32);
    if (dbg.stress) {
      stressEvents();
    }

    const scrollFade = state.page === "modules" ? 1 - (1 - WIRE.scrollFadeTo) * smooth(0, WIRE.scrollFadePx, scrollY) : 1;
    const twinW = ease.w[0] * scrollFade;
    const lostHalo = ease.lost * (NETWORK.apiDownHalo.min + (NETWORK.apiDownHalo.max - NETWORK.apiDownHalo.min) * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / NETWORK.apiDownHalo.period)));
    const face = pose === "face";
    const narrowLat = layout.viewportW <= LATTICE.narrowMaxW;
    const pitchPx = narrowLat ? LATTICE.pitchNarrow : LATTICE.pitch;
    const scale = bufW / cssW;
    const guard = 1 - smooth(CRESCENT.freqGuard[0], CRESCENT.freqGuard[1], 1 / (pitchPx * scale));

    const flags = (def.scanlines ? FLAG_SCANLINES : 0) | (def.glassFill ? FLAG_GLASS : 0) | (dbg.lum ? FLAG_LUM : 0);
    u4(UBO.V, bufW, bufH, scale, flags);
    u4(UBO.CAM, ease.camX, 0, W, H);
    const col = layout.column;
    if (col) u4(UBO.COL, col.x + camX, col.y, col.x + col.w + camX, col.y + col.h);
    else u4(UBO.COL, 0, 0, 0, 0);
    if (layout.stage) u4(UBO.STG, layout.stage.x + camX, layout.stage.y, layout.stage.x + layout.stage.w + camX, layout.stage.y + layout.stage.h);
    else u4(UBO.STG, 0, 0, 0, 0);
    const b = shotCur.box;
    const pad = 0.1;
    u4(UBO.BOX, b[0] - b[2] * pad + ease.camX, b[1] - b[3] * pad, b[0] + b[2] * (1 + pad) + ease.camX, b[1] + b[3] * (1 + pad));
    u4(UBO.T, t % 3840, evClock, scrollY, ease.halo);
    const xf = sat((now - xfAt) / CRESCENT.crossfadeMs);
    if (xf >= 1) u4(UBO.VP, vpX, vpY, vpX, vpY);
    else u4(UBO.VP, vpOldX, vpOldY, vpX, vpY);
    u4(UBO.VPM, xf >= 1 ? 0 : xf, xf >= 1 ? vpInf : vpOldInf, vpInf, ease.w[2] * (tier <= 1 ? CRESCENT.t1AlphaScale : 1) * (face ? CRESCENT.facePoseLatticeScale : 1) * guard);
    const bandScreen = MVP[0] * bandX + MVP[12];
    const bandW = MVP[3] * bandX + MVP[15];
    u4(UBO.PTR, ease.tiltX * CRESCENT.pointerPx, ease.tiltY * CRESCENT.pointerPx, ease.camX + ((bandScreen / bandW + 1) / 2) * W, band);
    u4(UBO.HZ, ease.poolX, ease.poolY, HAZE.poolRx * st.w, HAZE.poolRy * st.w);
    const drift = (HAZE.maxDriftPxPerSec * 0.8) / (HAZE.scaleH * H);
    const breath = dbg.stress ? 1 + HAZE.breathing : 1 + HAZE.breathing * Math.sin((2 * Math.PI * t) / 40);
    u4(UBO.HZ2, (t * drift) % 64, (t * drift * (HAZE.warpPeriod1 / HAZE.warpPeriod2)) % 64, breath, ease.w[5]);
    if (tint) u4(UBO.TINT, tint[0], tint[1], tint[2], ease.tint);
    else ubo[UBO.TINT * 4 + 3] = ease.tint;
    u4(UBO.FX, dip, twinW, ease.w[1] * partFade, ease.w[4]);
    const runK = STREAKS.runningAlphaBase + STREAKS.runningAlphaGain * Math.min(1, sig.running / 3);
    const glassW = twinW * glassFade * (1 - (1 - GLASS.apiDownScale) * ease.lost);
    u4(UBO.FX2, ease.w[3] * runK, glassW, ease.lost, ((t * GLASS.scanlinePxPerSec * scale) / GLASS.scanlinePeriodDevicePx) % 1);
    const fullL = x1 - x0;
    u4(UBO.BAND, bandX, band, SCAN_BAND.sigmaFrac * fullL, printX);
    u4(UBO.BAND2, emX, emS, 0, ripple);
    u4(UBO.MDL, model.length, lay.showFrontHead ? lay.front.cylEnd : lay.halfL, -lay.rear.cylEnd, roll * DEG);
    const e = shotCur.eye;
    const ex = e[0] - RM[12];
    const ey = e[1] - RM[13];
    const ez = e[2] - RM[14];
    u4(UBO.EYE, RM[0] * ex + RM[1] * ey + RM[2] * ez, RM[4] * ex + RM[5] * ey + RM[6] * ez, RM[8] * ex + RM[9] * ey + RM[10] * ez, shotCur.focal);
    for (let r = 0; r < 4; r++) {
      const wsOther = ws && r > 0 && REGION[ws] !== r ? WIRE.otherRegionsWorkspace : 1;
      ubo[UBO.REGA * 4 + r] = (1 + WIRE.hoverBoost * ease.hover[r]) * wsOther;
      ubo[UBO.REGB * 4 + r] = WIRE.regionRunningAlpha * ease.run[r] + WIRE.jobDetailRunningBoost * ease.detail[r];
      ubo[UBO.REGT * 4 + r] = WIRE.regionRunningMix * ease.run[r];
    }
    ubo[UBO.REGA * 4] = ws ? WIRE.otherRegionsWorkspace : 1;
    u4(UBO.LAT, pitchPx, narrowLat ? LATTICE.rowStepNarrow : LATTICE.rowStep, narrowLat ? LATTICE.mouthRNarrow : LATTICE.mouthR, LATTICE.laneEvery);

    // Streak region: the twin halo, or 2.2 x face radius in FACE.
    const P = pitchPx;
    const RS = narrowLat ? LATTICE.rowStepNarrow : LATTICE.rowStep;
    let hcx = b[0] + b[2] / 2 + ease.camX;
    let hcy = b[1] + b[3] / 2;
    let hrx = (b[2] * CRESCENT.haloScaleW) / 2;
    let hry = (b[3] * CRESCENT.haloScaleH) / 2;
    if (face) {
      hcx = shotCur.face[0] + ease.camX;
      hcy = shotCur.face[1];
      hrx = hry = STREAKS.faceRadiusScale * shotCur.face[2];
    }
    u4(UBO.HALO, hcx, hcy, Math.max(1, hrx), Math.max(1, hry));
    const fieldR = tubeFieldRadius(model);
    const mouthR = geo.lod.mouthRingN > 0 ? (0.4 * fieldR) / geo.lod.mouthRingN : 0;
    u4(UBO.FLOW, ease.activity, mouthR, lostHalo, face ? STREAKS.faceLengthK : STREAKS.lengthK);
    u4(UBO.PH, phShell, phTube, phProc, phRiser);
    u4(UBO.BOLT, geo.boltFront.center[0], geo.boltFront.radius, geo.boltRear.center[0], geo.boltRear.radius);
    u4(UBO.HUB, ease.queued, face ? STREAKS.faceMaxPx : STREAKS.maxPx, pose === "section" ? 1 : 0, face ? WIRE.faceMouthAlphaFacePose : WIRE.faceMouthAlpha);
    for (let i = 0; i < 16; i++) ubo[UBO.CLS * 4 + i] = classes[i];

    // Instance ranges.
    const c0 = Math.max(0, Math.floor((hcx - hrx) / P) - 1);
    const r0 = Math.max(0, Math.floor((hcy - hry) / RS));
    const cols = Math.max(1, Math.ceil((hcx + hrx) / P) + 1 - c0);
    const rows = Math.max(1, Math.ceil((hcy + hry) / RS) + 1 - r0);
    // FACE: no bore streaks - converging on the face they read as stray radial scratches.
    const streaks = pose === "porthole" || face ? 0 : Math.min(cols * rows, dbg.stress ? STREAKS.counts[3] : def.streaks);
    i4(UBO.C4, c0, r0, cols, rows);
    const jobsK = state.page === "jobs" ? FLOW.jobsPageScale : 1;
    const port = pose === "porthole";
    const lanes = Math.min(paths.tube.count, port ? paths.tube.count : FLOW.counts[tier === 0 ? 1 : tier].tubeLanes);
    const nShell = paths.shell.count ? Math.round((port ? FLOW.portholeCrossflow : def.shellParticles) * jobsK) : 0;
    // FACE: tube-side particles would fly straight at the camera as radial dashes; the face stays clean.
    const nTube = lanes && !face ? Math.round((port ? FLOW.portholeAnnulus : pose === "bonnet" ? FLOW.bonnetPoseParticles : def.tubeParticles) * jobsK) : 0;
    const nProc = paths.process.count && !face ? Math.round((port ? FLOW.portholeAnnulus : def.processParticles) * jobsK) : 0;
    const nMouth = Math.min(geo.faceMouthCount, DATA_W);
    const nBolt = Math.min(48, geo.boltFront.count);
    const nXray = shotCur.shellR >= SCAN_BAND.xrayMinRadiusPx && band > 0 ? Math.min(geo.xrayDotCount, DATA_W) : 0;
    const nEv = still && !dbg.stress ? 0 : EVENTS.poolSize * 6;
    i4(UBO.C1, geo.segmentCount, 0, 0, linkSegs);
    i4(UBO.C2, nShell, nTube, nProc, nMouth);
    i4(UBO.C3, nBolt, nXray, nodeCount, nEv);
    i4(UBO.C5, paths.shell.start, paths.shell.count, paths.tube.start, lanes);
    uboI[UBO.C6 * 4] = paths.process.start;
    uboI[UBO.C6 * 4 + 1] = paths.process.count;
    i4(UBO.C0, streaks, Math.min(geo.totalSegmentCount, MAX_SEGMENTS), linkSegs, nShell + nTube + nProc + nMouth + 2 * nBolt + nXray + nodeCount + nEv + 1);
  };

  /** ?ambient=stress: 3 concurrent events at their brightest ages. */
  const stressEvents = () => {
    const o = UBO.EV * 4;
    const set = (i: number, type: number, age: number, link: number, param: number) => {
      ubo[o + i * 4] = type;
      ubo[o + i * 4 + 1] = evClock - age;
      ubo[o + i * 4 + 2] = link;
      ubo[o + i * 4 + 3] = param;
    };
    set(0, EVENT_TYPE_ID.dispatch, 0.9, linkSegs ? 0 : -1, REGION_TUBESHEET);
    set(1, EVENT_TYPE_ID.complete, EVENTS.completePulseSec + 0.5, -1, REGION_TUBESHEET);
    set(2, EVENT_TYPE_ID.fail, 0.3, -1, REGION_SHELL);
  };

  const writeQuiet = () => {
    if (!layout) return;
    const n = Math.min(layout.quiet.length, RESOLVE.maxQuietRects);
    // prefers-contrast: more widens the feathered protection to 96 px: the shader's feather
    // is a compile-time 56 px, so the cores grow by the difference instead.
    const g = state?.contrastMore ? RESOLVE.quietFeatherHighContrastPx - RESOLVE.quietFeatherPx : 0;
    for (let i = 0; i < n; i++) {
      const r = layout.quiet[i];
      const o = (UBO.Q + i) * 4;
      ubo[o] = r.x - elemLeft - g;
      ubo[o + 1] = r.y - layout.canvas.y - g;
      ubo[o + 2] = r.x + r.w - elemLeft + g;
      ubo[o + 3] = r.y + r.h - layout.canvas.y + g;
    }
    uboI[UBO.C6 * 4 + 2] = n;
  };

  // ---------------------------------------------------------------- draw
  let hazeAt = -1e9;
  let draws = 0;
  const draw = (now: number) => {
    if (!accT || !hazeT || !uboBuf) return;
    if (dataDirty) {
      uploadData(gl, dataTex!, DATA_W, 0, DATA_ROWS.count, data);
      dataDirty = false;
    }
    gl.bindBuffer(gl.UNIFORM_BUFFER, uboBuf);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, ubo);
    draws = 2;
    const hz = tierDef(tier).hazeHz / (hints.typing ? 2 : 1);
    if (hazeDirty || !isLive() || (hz > 0 && now - hazeAt >= 1000 / hz)) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, hazeT.fb);
      gl.viewport(0, 0, hazeT.w, hazeT.h);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(progs[0].prog);
      bindTexture(gl, 0, noiseTex);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      hazeAt = now;
      hazeDirty = false;
      draws++;
    }
    const sx = Math.max(0, Math.floor(ease.camX * (bufW / cssW)));
    gl.bindFramebuffer(gl.FRAMEBUFFER, accT.fb);
    gl.viewport(0, 0, bufW, bufH);
    // Full clear (the composite samples uAcc across the whole canvas, including the strip
    // left of camX while the sidebar glides); only the instanced draw is scissored.
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(sx, 0, bufW - sx, bufH);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
    gl.useProgram(progs[1].prog);
    bindTexture(gl, 0, dataTex);
    bindTexture(gl, 1, lutTex);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, uboI[UBO.C0 * 4] + uboI[UBO.C0 * 4 + 1] + uboI[UBO.C0 * 4 + 2] + uboI[UBO.C0 * 4 + 3]);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(progs[2].prog);
    bindTexture(gl, 0, hazeT.tex);
    bindTexture(gl, 1, accT.tex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (firstFrame) {
      firstFrame = false;
      if (restoring) opts.onContextRestored?.();
      else opts.onFirstFrame?.();
      restoring = false;
    }
  };

  // ---------------------------------------------------------------- loop and pacing
  let raf = 0;
  let dirty = true;
  let lastTick = 0;
  let worstTick = 0;
  let sinceRender = 0;
  let refreshMs = 1000 / 60;
  const refresh = new Float32Array(PACING.refreshSampleFrames);
  const refreshSorted = new Float32Array(PACING.refreshSampleFrames);
  let refreshN = 0;
  let fpsShown = 0;
  let framesSince = 0;
  let overlayAt = 0;

  const isLive = () => mode === "live" && !dbg.forceStill && !dbg.stress && tier > 0;
  const canRun = () => !destroyed && !failed && !lost && !suspended && !(typeof document !== "undefined" && document.hidden) && layout !== null && state !== null && model !== null;
  const request = () => {
    dirty = true;
    if (!raf && canRun()) raf = requestAnimationFrame(onFrame);
  };

  const targetFps = (now: number): number => {
    if (!state || !layout) return 0;
    const opening = opts.playOpening === true && evClock < TRANSITIONS.opening.steadyAtMs / 1000;
    const transients = pool.liveCount(evClock) > 0 || tweenAt >= 0 || dipAt >= 0 || opening;
    if (!hints.windowFocused) return transients ? PACING.blurTransientFps : 0;
    const idle = now - activityAt;
    const running = state.signals.running > 0;
    if (idle >= PACING.idleFreezeMs) return running || transients ? PACING.idleRunningFps : 0;
    let fps: number = tier <= 1 || layout.narrow ? PACING.lowFps : PACING.baseFps;
    if (idle >= PACING.idle20FpsMs || state.signals.localAgentBusy) fps = Math.min(fps, PACING.localBusyFps);
    const boost =
      now - scrollAt < RESOLVE.scrollBoostMs ||
      (tier === 3 && (tweenAt >= 0 || dipAt >= 0 || now - tiltMovedAt < INTERACTION.tiltBoostHoldMs || opening));
    return boost && tier >= 2 && fps === PACING.baseFps ? PACING.boostFps : fps;
  };

  function onFrame(now: number) {
    raf = 0;
    if (!canRun()) return;
    if (!pollReady()) {
      if (!raf && !destroyed && progs.length === 3) raf = requestAnimationFrame(onFrame);
      return;
    }
    if (!tierKnown) applyStartTier();
    if (!geo) reframe(false);
    if (!isLive()) {
      clock = now;
      writeQuiet();
      writeFrame(now, 0, true);
      draw(now);
      dirty = false;
      lastTick = lastRender = 0;
      return;
    }
    if (lastTick) {
      const d = now - lastTick;
      // Refresh = median of the last 30 raw rAF deltas, re-estimated every 30 ticks
      // (load-time jank or a monitor change never pins a wrong divisor).
      if (d > 4 && d < 100) {
        refresh[refreshN++] = d;
        if (refreshN === refresh.length) {
          refreshN = 0;
          refreshSorted.set(refresh);
          refreshSorted.sort();
          refreshMs = refreshSorted[refresh.length >> 1];
        }
      }
      if (d > worstTick) worstTick = d;
    }
    lastTick = now;
    const fps = targetFps(now);
    if (fps === 0) {
      // Frozen (blur / idle): one composed frame for any pending change, then stop.
      if (dirty) render(now, false, 0, true);
      lastTick = lastRender = 0;
      return;
    }
    if (!raf) raf = requestAnimationFrame(onFrame);
    const divisor = Math.max(1, Math.round(1000 / refreshMs / fps));
    if (++sinceRender < divisor && !dirty) return;
    sinceRender = 0;
    const interval = lastRender ? now - lastRender : 0;
    if (interval > 0 && !dirty) {
      const before = governor.tier;
      governor.sample(interval, worstTick, divisor * refreshMs, now);
      if (governor.tier !== before) onTierChange();
    }
    worstTick = 0;
    render(now, hints.windowFocused, fps);
  }

  /** `fps` > 0 = continuous rendering; its first frame (no lastRender) eases with dt = 1 / fps. */
  const render = (now: number, steady: boolean, fps: number, frozen = false) => {
    const snap = frozen || firstFrame;
    const dt = lastRender ? Math.min(now - lastRender, PACING.maxDtMs) / 1000 : snap || fps <= 0 ? 0 : 1 / fps;
    lastRender = now;
    clock = now;
    if (steady) sceneT += dt;
    evClock += dt;
    writeQuiet();
    writeFrame(now, dt, false, snap);
    draw(now);
    dirty = false;
    if (dbg.overlay) overlay(now);
  };

  let overlayEl: HTMLDivElement | null = null;
  const overlay = (now: number) => {
    framesSince++;
    if (now - overlayAt < 500) return;
    fpsShown = (framesSince * 1000) / (now - overlayAt);
    overlayAt = now;
    framesSince = 0;
    if (!overlayEl) {
      overlayEl = document.createElement("div");
      overlayEl.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:9999;font:11px/1.3 monospace;color:#67e8f9;background:#05070dcc;padding:4px 6px;pointer-events:none;white-space:pre";
      document.body.appendChild(overlayEl);
      (window as unknown as Record<string, unknown>).__ambientLoseContext = () => {
        const ext = gl.getExtension("WEBGL_lose_context");
        ext?.loseContext();
        window.setTimeout(() => ext?.restoreContext(), 1000);
      };
    }
    overlayEl.textContent = `ambient T${tier}${governor.locked ? " locked" : ""} ${fpsShown.toFixed(1)} fps  ${bufW}x${bufH} @${(bufW / cssW).toFixed(2)}  draws ${draws}  inst ${uboI[UBO.C0 * 4 + 3] + uboI[UBO.C0 * 4] + uboI[UBO.C0 * 4 + 1] + uboI[UBO.C0 * 4 + 2]}  ${pose}`;
  };

  const applyStartTier = () => {
    if (!layout) return;
    tierKnown = true;
    detected = startTier(readTierEnv(layout.canvas.w, layout.coarsePointer, false));
    if (caveat) detected = Math.min(detected, 1) as Tier;
    governor = createGovernor(Math.max(1, detected) as Tier, performance.now());
    if (detected === 0) batteryCap = 0;
    tier = computeTier();
    resize(true);
  };

  const onTierChange = () => {
    if (destroyed) return;
    const next = computeTier();
    if (next === tier) return;
    tier = next;
    if (!ready || !layout) return;
    resize(true);
    if (model) rebuildScene();
    hazeDirty = true;
    request();
  };

  // ---------------------------------------------------------------- context loss
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    ready = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    losses++;
    opts.onContextLost?.();
    if (losses >= 2) opts.onFallback?.("context-lost");
  };
  const onRestored = () => {
    if (destroyed || losses >= 2) return;
    lost = false;
    init();
    firstFrame = restoring = true;
    geo = null;
    request();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  init();

  // ---------------------------------------------------------------- public API
  return {
    setState(next) {
      const prev = state;
      state = next;
      activityAt = performance.now();
      if (next.workspaceModule) tint = hexToRgb(MODULE_TINT[next.workspaceModule]);
      if (!isLive() || tier <= 1) hazeDirty = true;
      if (!prev || prev.page !== next.page || prev.workspaceModule !== next.workspaceModule) reframe(false);
      else {
        rebuildLedger();
        rebuildNetwork(false);
      }
      if (!prev || prev.signals.localAgentBusy !== next.signals.localAgentBusy) onTierChange();
      updateLinkCurrents();
      request();
    },
    setLayout(next) {
      const sized = !layout || layout.viewportW !== next.viewportW || layout.canvas.h !== next.canvas.h || layout.devicePixelRatio !== next.devicePixelRatio;
      const first = !layout;
      layout = next;
      stage = next.stage && next.stage.w > 0 ? next.stage : defaultStage(next.canvas.w, next.canvas.h);
      try {
        elemLeft = canvas.getBoundingClientRect().left;
      } catch {
        elemLeft = 0;
      }
      if (first) ease.camX = next.canvas.x - elemLeft;
      if (tierKnown) onTierChange();
      if (sized) resize(first);
      reframe(true);
      hazeDirty = true;
      request();
    },
    setScroll(y) {
      scrollY = y;
      scrollAt = activityAt = performance.now();
      request();
    },
    setPointer(nx, ny, inside) {
      ptrX = nx;
      ptrY = ny;
      ptrInside = inside;
      ptrAt = activityAt = performance.now();
      if (isLive() && !raf) request();
    },
    setVessel(next) {
      model = next;
      reframe(true);
      request();
    },
    pushEvents(events: AmbientEvent[]) {
      activityAt = performance.now();
      if (!isLive()) return;
      for (const ev of events) {
        pool.push(ev, evClock);
        if (ev.type === "complete") wantCompletionBand = true;
      }
      request();
    },
    setMode(next) {
      if (next === mode) return;
      mode = next;
      if (!isLive()) pool.clear();
      reframe(false);
      request();
    },
    setSuspended(next) {
      suspended = next;
      if (next) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      } else {
        lastTick = lastRender = 0;
        governor.reset();
        request();
      }
    },
    setHints(next) {
      const now = performance.now();
      if (hints.typing && !next.typing) typingEndAt = now;
      hints.windowFocused = next.windowFocused;
      hints.typing = next.typing;
      hints.pointerDown = next.pointerDown;
      hints.idleMs = next.idleMs;
      activityAt = Math.max(activityAt, now - next.idleMs);
      request();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      window.clearTimeout(resizeTimer);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      overlayEl?.remove();
      if (!lost) {
        progs.forEach((p) => deleteProgram(gl, p));
        deleteTarget(gl, hazeT);
        deleteTarget(gl, accT);
        gl.deleteTexture(dataTex);
        gl.deleteTexture(lutTex);
        gl.deleteTexture(noiseTex);
        gl.deleteBuffer(uboBuf);
        gl.deleteVertexArray(vao);
        // Release the context now rather than at GC: remounts and the fallback swap make
        // new canvases, and browsers force-lose the oldest context past ~16.
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
      ready = false;
      if (current?.canvas === canvas) current = null;
    },
  };
}
