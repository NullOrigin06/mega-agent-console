/**
 * Camera for the Duty Field twin: a tiny column-major mat4/vec3 kit, the
 * seven poses, the lens-shift stage solve and the derived vanishing point.
 *
 * Every pose is "look at a target on the twin from an eye direction, at the
 * distance that gives the target the wanted projected size, then shift the
 * principal point so the target lands on its screen anchor" (lens shift; the
 * view direction never changes to frame the shot). The VP is never placed by
 * hand: it is P * V * (axis, 0).
 *
 * Pure TypeScript - no DOM, no GL. solveCamera() can reuse an output frame so
 * a per-frame call (swing, tilt) allocates nothing.
 */
import { CAMERA, POSES, POSE_PARAMS, TRANSITIONS, VESSEL_CLAMP } from "./constants";
import { vesselLayout } from "./twinGeometry";
import type { VesselLayout } from "./twinGeometry";
import type { AmbientLayout, AmbientPage, Point, PoseName, Rect, VesselModel } from "./types";
import type { ModuleKind } from "../types/engineering";

// ---------------------------------------------------------------- mat4 / vec3 kit

export type Vec3 = [number, number, number];

export function mat4Identity(out: Float32Array = new Float32Array(16)): Float32Array {
  out.fill(0);
  out[0] = out[5] = out[10] = out[15] = 1;
  return out;
}

/** out = a * b (column-major). out may alias a or b. */
export function mat4Multiply(a: ArrayLike<number>, b: ArrayLike<number>, out: Float32Array = new Float32Array(16)): Float32Array {
  const r = SCRATCH16;
  for (let c = 0; c < 4; c++) {
    for (let row = 0; row < 4; row++) {
      r[c * 4 + row] = a[row] * b[c * 4] + a[4 + row] * b[c * 4 + 1] + a[8 + row] * b[c * 4 + 2] + a[12 + row] * b[c * 4 + 3];
    }
  }
  out.set(r);
  return out;
}
const SCRATCH16 = new Float64Array(16);

/**
 * Perspective with lens shift, in pixel terms: focal length F (px), canvas
 * w x h, principal point (px, py) in canvas px (y down). Maps eye space
 * (looking down -Z) so that screenX = F * x / -z + px.
 */
export function mat4PerspectiveShift(F: number, w: number, h: number, px: number, py: number, near: number, far: number, out: Float32Array = new Float32Array(16)): Float32Array {
  out.fill(0);
  out[0] = (2 * F) / w;
  out[5] = (2 * F) / h;
  out[8] = -((2 * px) / w - 1);
  out[9] = -(1 - (2 * py) / h);
  out[10] = -(far + near) / (far - near);
  out[11] = -1;
  out[14] = (-2 * far * near) / (far - near);
  return out;
}

/** View matrix from an eye position and a forward direction (up = +Y unless degenerate). */
export function mat4LookDir(eye: ArrayLike<number>, forward: ArrayLike<number>, out: Float32Array = new Float32Array(16)): Float32Array {
  let fx = forward[0];
  let fy = forward[1];
  let fz = forward[2];
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // right = f x up(0,1,0); fall back to up = -Z when looking straight up/down.
  let rx = -fz;
  let ry = 0;
  let rz = fx;
  let rl = Math.hypot(rx, ry, rz);
  if (rl < 1e-6) {
    rx = fy;
    ry = 0;
    rz = 0;
    rl = Math.abs(fy) || 1;
  }
  rx /= rl;
  ry /= rl;
  rz /= rl;
  // up = right x f
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;
  out[0] = rx;
  out[1] = ux;
  out[2] = -fx;
  out[3] = 0;
  out[4] = ry;
  out[5] = uy;
  out[6] = -fy;
  out[7] = 0;
  out[8] = rz;
  out[9] = uz;
  out[10] = -fz;
  out[11] = 0;
  out[12] = -(rx * eye[0] + ry * eye[1] + rz * eye[2]);
  out[13] = -(ux * eye[0] + uy * eye[1] + uz * eye[2]);
  out[14] = fx * eye[0] + fy * eye[1] + fz * eye[2];
  out[15] = 1;
  return out;
}

/** Rotation about +X (the vessel axis) by rad. */
export function mat4RotateX(rad: number, out: Float32Array = new Float32Array(16)): Float32Array {
  mat4Identity(out);
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  out[5] = c;
  out[6] = s;
  out[9] = -s;
  out[10] = c;
  return out;
}

/** Rotation about +Y by rad. */
export function mat4RotateY(rad: number, out: Float32Array = new Float32Array(16)): Float32Array {
  mat4Identity(out);
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  out[0] = c;
  out[2] = -s;
  out[8] = s;
  out[10] = c;
  return out;
}

/** General 4x4 inverse; returns null when singular. */
export function mat4Invert(m: ArrayLike<number>, out: Float32Array = new Float32Array(16)): Float32Array | null {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = Array.from({ length: 16 }, (_, i) => m[i]);
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(det) < 1e-12) return null;
  const d = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d;
  return out;
}

/** out = m * (x, y, z, w). */
export function mat4TransformVec4(m: ArrayLike<number>, x: number, y: number, z: number, w: number, out: Float64Array | Float32Array | number[]): void {
  out[0] = m[0] * x + m[4] * y + m[8] * z + m[12] * w;
  out[1] = m[1] * x + m[5] * y + m[9] * z + m[13] * w;
  out[2] = m[2] * x + m[6] * y + m[10] * z + m[14] * w;
  out[3] = m[3] * x + m[7] * y + m[11] * z + m[15] * w;
}

export const vec3Dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vec3Cross = (a: ArrayLike<number>, b: ArrayLike<number>): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function vec3Normalize(a: ArrayLike<number>): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

// ---------------------------------------------------------------- camera solve

export interface CameraInput {
  pose: PoseName;
  /** canvas px */
  canvasW: number;
  canvasH: number;
  /** canvas px */
  stage: Rect | null;
  model: VesselModel;
  /** Swing + cursor tilt, already eased. */
  yawOffsetDeg: number;
  pitchOffsetDeg: number;
  /** Meridian roll about the vessel axis. */
  rollDeg: number;
  /** Content column (canvas px). Optional; WIDE and the TELEMETRY emblem use its right gutter. */
  column?: Rect | null;
}

export interface CameraFrame {
  view: Float32Array;
  proj: Float32Array;
  /** proj * view: twin-local (un-rolled) -> clip. Rolling classes use viewProj * model. */
  viewProj: Float32Array;
  /** Roll about +X (explode offsets live in the geometry). */
  model: Float32Array;
  /** Vanishing point of the vessel axis in canvas px; null when at infinity (section). */
  vanishing: Point | null;
  /** Unit screen direction in which the axis recedes (front -> rear); (0, 0) end-on. Use when vanishing is null. */
  axisScreenDir: Point;
  /** Projected twin bounding box in canvas px (not clipped to the canvas). */
  twinBox: Rect;
  /** R_px at the target (used for LOD). */
  shellRadiusPx: number;
  /** Shell D/2 projected at each tube-sheet face. */
  frontFace: { x: number; y: number; radiusPx: number };
  rearFace: { x: number; y: number; radiusPx: number };
  /** Eye position in twin-local units (silhouettes, fresnel). */
  eye: Float32Array;
  /** Focal length in canvas px. */
  focalPx: number;
  /** Principal point (canvas px) after the lens-shift solve. */
  principal: Point;
  /** The projected diameter the pose asked for (D_px for most poses). */
  targetSizePx: number;
}

export function createCameraFrame(): CameraFrame {
  return {
    view: mat4Identity(),
    proj: mat4Identity(),
    viewProj: mat4Identity(),
    model: mat4Identity(),
    vanishing: null,
    axisScreenDir: { x: -1, y: 0 },
    twinBox: { x: 0, y: 0, w: 0, h: 0 },
    shellRadiusPx: 0,
    frontFace: { x: 0, y: 0, radiusPx: 0 },
    rearFace: { x: 0, y: 0, radiusPx: 0 },
    eye: new Float32Array(3),
    focalPx: 1,
    principal: { x: 0, y: 0 },
    targetSizePx: 0,
  };
}

const DEG = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Focal length for the 30 deg vertical FOV: F = (h/2) / tan 15. */
export const focalLength = (canvasH: number) => canvasH / 2 / Math.tan((CAMERA.fovYDeg * DEG) / 2);

/** D_px = clamp(80, 0.62 * stageH, 132), capped at 100 on tablet-width canvases. */
export function overviewDpx(stageH: number, canvasW: number): number {
  const d = clamp(CAMERA.dpxK * stageH, CAMERA.dpxMin, CAMERA.dpxMax);
  return canvasW < CAMERA.tabletMaxW ? Math.min(d, CAMERA.tabletDpxMax) : d;
}

/** TELEMETRY on a stage too narrow or too short for the twin: a FACE emblem in the right gutter instead. */
export const telemetryEmblem = (stage: Rect) => stage.w < POSE_PARAMS.telemetryEmblemMinStageW || stage.h < POSE_PARAMS.telemetryEmblemMinStageH;

/** Stage used when the page registered none: the right ~45% of the top band. */
export function defaultStage(canvasW: number, canvasH: number): Rect {
  const h = clamp(canvasH * 0.22, 120, 200);
  return { x: canvasW * 0.52, y: 0, w: canvasW * 0.46, h };
}

interface Plan {
  offAxisDeg: number;
  pitchDeg: number;
  /** Target x on the axis (targets are always on the axis). */
  targetX: number;
  anchorX: number;
  anchorY: number;
  /** World diameter whose projection should be sizePx. */
  refSize: number;
  sizePx: number;
  /** Eye on the axis, view direction tilted by offAxisDeg (FACE, emblem): the VP lands on the face. */
  eyeOnAxis: boolean;
}

const PLAN: Plan = { offAxisDeg: 0, pitchDeg: 0, targetX: 0, anchorX: 0, anchorY: 0, refSize: 1, sizePx: 1, eyeOnAxis: false };

// vesselLayout() allocates; per-frame solves reuse the last one.
let layoutCache: { model: VesselModel; pose: PoseName; layout: VesselLayout } | null = null;
function layoutFor(model: VesselModel, pose: PoseName): VesselLayout {
  if (!layoutCache || layoutCache.model !== model || layoutCache.pose !== pose) layoutCache = { model, pose, layout: vesselLayout(model, pose) };
  return layoutCache.layout;
}

const GUTTER = { x: 0, w: 0 };
function gutterOf(input: CameraInput, stage: Rect): { x: number; w: number } {
  const right = input.column ? input.column.x + input.column.w : stage.x + stage.w;
  GUTTER.x = right;
  GUTTER.w = Math.max(0, input.canvasW - right);
  return GUTTER;
}

function plan(input: CameraInput, stage: Rect, pose: PoseName, p: Plan): void {
  const { model, canvasW: W, canvasH: H } = input;
  const lay = layoutFor(model, pose);
  const def = POSES[pose];
  const dpx = overviewDpx(stage.h, W);
  p.offAxisDeg = def.offAxisDeg;
  p.pitchDeg = def.pitchDeg;
  p.targetX = 0;
  p.anchorX = stage.x + stage.w / 2;
  p.anchorY = stage.y + stage.h / 2;
  p.refSize = 1;
  p.sizePx = dpx;
  p.eyeOnAxis = false;
  switch (pose) {
    case "overview":
      return;
    case "telemetry": {
      if (!telemetryEmblem(stage)) {
        p.sizePx = dpx * POSE_PARAMS.telemetryScale;
        return;
      }
      // Narrow or short stage: a FACE emblem in the right gutter.
      const g = gutterOf(input, stage);
      const size = clamp(g.w - POSE_PARAMS.telemetryEmblemGutterPad, 48, POSE_PARAMS.telemetryEmblemMaxPx);
      p.offAxisDeg = POSES.face.offAxisDeg;
      p.pitchDeg = POSES.face.pitchDeg;
      p.targetX = lay.front.face;
      if (g.w >= 48) {
        p.anchorX = g.x + g.w / 2;
        p.anchorY = Math.max(size / 2 + 12, stage.y + stage.h / 2);
      }
      p.refSize = model.tubeSheetOD;
      p.sizePx = size;
      p.eyeOnAxis = true;
      return;
    }
    case "wide": {
      const g = gutterOf(input, stage);
      if (g.w < POSE_PARAMS.wideMinGutter / 2) return;
      p.targetX = lay.front.face;
      p.anchorX = g.x + g.w / 2;
      p.anchorY = POSE_PARAMS.wideFaceV * H;
      p.sizePx = Math.min(POSE_PARAMS.wideDpxMax, POSE_PARAMS.wideDpxK * g.w);
      return;
    }
    case "face":
      p.targetX = lay.front.face;
      p.refSize = model.tubeSheetOD;
      // Frame the face on the stage's visible part (the stage tucks under the first card).
      p.sizePx = POSE_PARAMS.faceDiameterK * Math.max(1, stage.h - POSE_PARAMS.stageTuckPx);
      p.anchorY = stage.y + Math.max(1, stage.h - POSE_PARAMS.stageTuckPx) / 2;
      p.eyeOnAxis = true;
      return;
    case "bonnet":
      p.targetX = (lay.front.channelFlangeBack + lay.front.cylEnd) / 2;
      p.sizePx = dpx * POSE_PARAMS.bonnetScale;
      return;
    case "section":
      p.sizePx = Math.min(dpx, (POSE_PARAMS.sectionFillW * stage.w) / (lay.front.tip - lay.rear.tip));
      return;
    case "porthole":
      p.targetX = lay.front.channelFlange;
      p.anchorX = POSE_PARAMS.portholeCx * W;
      p.anchorY = POSE_PARAMS.portholeCy * H;
      p.refSize = model.flangeOD;
      p.sizePx = 2 * POSE_PARAMS.portholeFlangeRK * W;
      return;
  }
}

const V4 = new Float64Array(4);
const CAM = new Float64Array(4);
const DIRS = new Float64Array(6);
const FWD = new Float64Array(3);

/** Eye direction (unit, target -> eye) for an off-axis angle (from +X toward +Z) and pitch (negative = looking down). */
function eyeDirection(offAxisDeg: number, pitchDeg: number, out: Float64Array, o: number) {
  const a = offAxisDeg * DEG;
  const e = -pitchDeg * DEG;
  out[o] = Math.cos(e) * Math.cos(a);
  out[o + 1] = Math.sin(e);
  out[o + 2] = Math.cos(e) * Math.sin(a);
}

function solveInto(input: CameraInput, p: Plan, out: CameraFrame) {
  const W = input.canvasW;
  const H = input.canvasH;
  const F = focalLength(H);
  const yaw = input.yawOffsetDeg;
  const pitch = input.pitchOffsetDeg;
  let d: number;
  if (p.eyeOnAxis) {
    // Eye on the axis (plus tilt), view direction tilted by offAxisDeg.
    eyeDirection(yaw, pitch, DIRS, 0);
    eyeDirection(p.offAxisDeg + yaw, p.pitchDeg + pitch, DIRS, 3);
    d = (F * p.refSize) / (p.sizePx * Math.cos(p.offAxisDeg * DEG));
  } else {
    eyeDirection(p.offAxisDeg + yaw, p.pitchDeg + pitch, DIRS, 0);
    DIRS[3] = DIRS[0];
    DIRS[4] = DIRS[1];
    DIRS[5] = DIRS[2];
    d = (F * p.refSize) / p.sizePx;
  }
  const eye = out.eye;
  eye[0] = p.targetX + DIRS[0] * d;
  eye[1] = DIRS[1] * d;
  eye[2] = DIRS[2] * d;
  FWD[0] = -DIRS[3];
  FWD[1] = -DIRS[4];
  FWD[2] = -DIRS[5];
  mat4LookDir(eye, FWD, out.view);

  // Lens shift: put the target on its anchor.
  mat4TransformVec4(out.view, p.targetX, 0, 0, 1, CAM);
  const depth = -CAM[2];
  const px = p.anchorX - (F * CAM[0]) / depth;
  const py = p.anchorY + (F * CAM[1]) / depth;
  mat4PerspectiveShift(F, W, H, px, py, CAMERA.near, Math.max(CAMERA.far, d * 40), out.proj);
  mat4Multiply(out.proj, out.view, out.viewProj);
  mat4RotateX(input.rollDeg * DEG, out.model);
  out.focalPx = F;
  out.principal.x = px;
  out.principal.y = py;
  out.targetSizePx = p.sizePx;
  out.shellRadiusPx = (0.5 * F) / depth;
}

function projectXY(frame: CameraFrame, x: number, y: number, z: number, W: number, H: number): boolean {
  mat4TransformVec4(frame.viewProj, x, y, z, 1, V4);
  if (V4[3] <= 1e-6) return false;
  CAM[0] = ((V4[0] / V4[3] + 1) / 2) * W;
  CAM[1] = ((1 - V4[1] / V4[3]) / 2) * H;
  CAM[2] = V4[3];
  return true;
}

function projectFace(frame: CameraFrame, face: { x: number; y: number; radiusPx: number }, x: number, W: number, H: number) {
  if (projectXY(frame, x, 0, 0, W, H)) {
    face.x = CAM[0];
    face.y = CAM[1];
    face.radiusPx = (0.5 * frame.focalPx) / CAM[2];
  } else {
    face.x = face.y = Number.NaN;
    face.radiusPx = 0;
  }
}

// Bounding-box accumulator (module scratch keeps finishFrame allocation-free).
const BOX = { x0: 0, y0: 0, x1: 0, y1: 0 };
function boxAdd(frame: CameraFrame, x: number, y: number, z: number, W: number, H: number) {
  if (!projectXY(frame, x, y, z, W, H)) return;
  if (CAM[0] < BOX.x0) BOX.x0 = CAM[0];
  if (CAM[0] > BOX.x1) BOX.x1 = CAM[0];
  if (CAM[1] < BOX.y0) BOX.y0 = CAM[1];
  if (CAM[1] > BOX.y1) BOX.y1 = CAM[1];
}
function boxCircle(frame: CameraFrame, x: number, r: number, W: number, H: number) {
  for (let k = 0; k < 16; k++) {
    const a = (Math.PI * 2 * k) / 16;
    boxAdd(frame, x, r * Math.cos(a), r * Math.sin(a), W, H);
  }
}

function finishFrame(input: CameraInput, pose: PoseName, out: CameraFrame) {
  const W = input.canvasW;
  const H = input.canvasH;
  const model = input.model;
  const lay = layoutFor(model, pose);

  projectFace(out, out.frontFace, lay.front.face, W, H);
  projectFace(out, out.rearFace, lay.rear.face, W, H);

  // Axis direction on screen (front -> rear).
  const dx = out.rearFace.x - out.frontFace.x;
  const dy = out.rearFace.y - out.frontFace.y;
  const dl = Math.hypot(dx, dy);
  const ok = Number.isFinite(dl) && dl > 1e-3;
  out.axisScreenDir.x = ok ? dx / dl : 0;
  out.axisScreenDir.y = ok ? dy / dl : 0;

  // VP = P * V * (axis, 0). +X and -X give the same homogeneous point.
  mat4TransformVec4(out.viewProj, -1, 0, 0, 0, V4);
  let vp: Point | null = null;
  if (pose !== "section" && Math.abs(V4[3]) > 1e-6) {
    const x = ((V4[0] / V4[3] + 1) / 2) * W;
    const y = ((1 - V4[1] / V4[3]) / 2) * H;
    if (Math.hypot(x - W / 2, y - H / 2) <= CAMERA.vpInfinityDiagonals * Math.hypot(W, H)) {
      vp = out.vanishing ?? { x: 0, y: 0 };
      vp.x = x;
      vp.y = y;
    }
  }
  out.vanishing = vp;

  // Bounding box from station circles, nozzle flanges and saddles.
  BOX.x0 = BOX.y0 = Infinity;
  BOX.x1 = BOX.y1 = -Infinity;
  const flR = model.flangeOD / 2;
  boxCircle(out, lay.rear.cylEnd, 0.5, W, H);
  boxCircle(out, lay.rear.channelFlange, flR, W, H);
  boxCircle(out, lay.rear.shellFlangeBack, flR, W, H);
  boxCircle(out, lay.front.shellFlangeBack, flR, W, H);
  boxAdd(out, lay.rear.tip, 0, 0, W, H);
  if (lay.showFrontBonnet) {
    boxCircle(out, lay.front.channelFlange, flR, W, H);
    boxCircle(out, lay.front.cylEnd, 0.5, W, H);
    if (lay.showFrontHead) boxAdd(out, lay.front.tip, 0, 0, W, H);
  }
  const drop = -0.5 - VESSEL_CLAMP.saddleDropR * 0.5;
  for (let i = 0; i < lay.saddleX.length; i++) {
    boxAdd(out, lay.saddleX[i], drop, -0.43, W, H);
    boxAdd(out, lay.saddleX[i], drop, 0.43, W, H);
  }
  for (let i = 0; i < model.nozzles.length; i++) {
    const n = model.nozzles[i];
    const a = n.angleDeg * DEG;
    const r = 0.5 + VESSEL_CLAMP.nozzleProjectionR * 0.5 + n.od;
    const x = -lay.halfL + n.xFrac * model.length;
    boxAdd(out, x - n.od, Math.cos(a) * r, -Math.sin(a) * r, W, H);
    boxAdd(out, x + n.od, Math.cos(a) * r, -Math.sin(a) * r, W, H);
  }
  const box = out.twinBox;
  if (BOX.x1 >= BOX.x0) {
    box.x = BOX.x0;
    box.y = BOX.y0;
    box.w = BOX.x1 - BOX.x0;
    box.h = BOX.y1 - BOX.y0;
  } else {
    box.x = box.y = box.w = box.h = 0;
  }
}

/**
 * Solves a pose against the measured layout. Pass `out` (from
 * createCameraFrame) to reuse its arrays - then nothing is allocated.
 */
export function solveCamera(input: CameraInput, out: CameraFrame = createCameraFrame()): CameraFrame {
  const W = Math.max(1, input.canvasW);
  const H = Math.max(1, input.canvasH);
  const inp = W === input.canvasW && H === input.canvasH ? input : { ...input, canvasW: W, canvasH: H };
  const stage = inp.stage && inp.stage.w > 0 && inp.stage.h > 0 ? inp.stage : defaultStage(W, H);
  const pose = inp.pose;
  const p = PLAN;
  plan(inp, stage, pose, p);
  solveInto(inp, p, out);
  finishFrame(inp, pose, out);
  if (pose === "wide") {
    // Length cap: the twin never spans more than 760 px.
    const lay = layoutFor(inp.model, pose);
    let span = 0;
    if (projectXY(out, lay.front.tip, 0, 0, W, H)) {
      const fx = CAM[0];
      const fy = CAM[1];
      if (projectXY(out, lay.rear.tip, 0, 0, W, H)) span = Math.hypot(fx - CAM[0], fy - CAM[1]);
    }
    if (span > POSE_PARAMS.wideMaxLengthPx) {
      p.sizePx *= POSE_PARAMS.wideMaxLengthPx / span;
      solveInto(inp, p, out);
      finishFrame(inp, pose, out);
    }
  }
  if (pose === "overview" || pose === "section" || (pose === "telemetry" && !telemetryEmblem(stage))) fitToStage(inp, stage, pose, p, out);
  return out;
}

// Union of the twin box over the swing + tilt extremes (module scratch, allocation-free).
const ENV = { x: 0, y: 0, w: 0, h: 0 };
let swungInput: CameraInput | null = null;

/**
 * The box the twin can occupy once the engine adds its swing and pointer tilt
 * (OVERVIEW / TELEMETRY: +-(swing + tilt) yaw; SECTION: tilt only; +-tilt pitch):
 * the union of the static box and the four extreme solves. Leaves `out` solved
 * at the static pose.
 */
function envelope(input: CameraInput, pose: PoseName, p: Plan, out: CameraFrame): typeof ENV {
  const b = out.twinBox;
  let x0 = b.x;
  let y0 = b.y;
  let x1 = b.x + b.w;
  let y1 = b.y + b.h;
  const yawAmp = (pose === "section" ? 0 : CAMERA.swingAmpDeg) + CAMERA.tiltYawDeg;
  const sw = (swungInput = Object.assign(swungInput ?? { ...input }, input));
  for (const sy of [-1, 1]) {
    for (const sp of [-1, 1]) {
      sw.yawOffsetDeg = input.yawOffsetDeg + sy * yawAmp;
      sw.pitchOffsetDeg = input.pitchOffsetDeg + sp * CAMERA.tiltPitchDeg;
      solveInto(sw, p, out);
      finishFrame(sw, pose, out);
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w);
      y1 = Math.max(y1, b.y + b.h);
    }
  }
  solveInto(input, p, out);
  finishFrame(input, pose, out);
  ENV.x = x0;
  ENV.y = y0;
  ENV.w = x1 - x0;
  ENV.h = y1 - y0;
  return ENV;
}

/**
 * Stage-framed poses: shrink (never grow, and never below stageFitMinPx)
 * until the twin's swing + tilt envelope - bonnet tips, saddles and nozzles
 * included - fits inside the stage less stageFitPadPx, then lens-shift it the
 * minimum distance that brings it inside. A twin that already fits keeps its
 * spec size and anchors.
 */
function fitToStage(input: CameraInput, stage: Rect, pose: PoseName, p: Plan, out: CameraFrame) {
  const pad = POSE_PARAMS.stageFitPadPx;
  const x0 = stage.x + pad;
  const y0 = stage.y + pad;
  const x1 = Math.max(x0 + 1, stage.x + stage.w - pad);
  const y1 = Math.max(y0 + 1, stage.y + stage.h - pad);
  let env = envelope(input, pose, p, out);
  // Box size is ~linear in sizePx (only the perspective depth ratio shifts); a few passes converge.
  for (let i = 0; i < 4; i++) {
    const k = Math.min((x1 - x0) / Math.max(env.w, 1e-6), (y1 - y0) / Math.max(env.h, 1e-6));
    if (k >= 1) break;
    // Floor on the projected shell diameter (2 x shellRadiusPx tracks sizePx linearly).
    const floor = POSE_PARAMS.stageFitMinPx / Math.max(2 * out.shellRadiusPx, 1e-6);
    const kk = Math.max(k * (i === 0 ? 1 : 0.999), floor);
    if (kk >= 1) break;
    p.sizePx *= kk;
    solveInto(input, p, out);
    finishFrame(input, pose, out);
    env = envelope(input, pose, p, out);
  }
  // Lens shift is a pure screen translation: move the envelope just enough to sit inside the padded stage.
  const shift = (lo: number, hi: number, a: number, size: number) => (size >= hi - lo ? (lo + hi) / 2 - (a + size / 2) : a < lo ? lo - a : a + size > hi ? hi - (a + size) : 0);
  const dx = shift(x0, x1, env.x, env.w);
  const dy = shift(y0, y1, env.y, env.h);
  if (dx === 0 && dy === 0) return;
  p.anchorX += dx;
  p.anchorY += dy;
  solveInto(input, p, out);
  finishFrame(input, pose, out);
}

/** The swing + tilt envelope of a solved stage-framed pose (tests and debugging; allocates). */
export function swingEnvelope(input: CameraInput): Rect {
  const out = solveCamera(input);
  const e = envelope(input, input.pose, PLAN, out);
  return { x: e.x, y: e.y, w: e.w, h: e.h };
}

/** Allocation-free projection of a twin-local (un-rolled) point; returns false when behind the camera. */
export function projectInto(frame: CameraFrame, x: number, y: number, z: number, canvasW: number, canvasH: number, out: { x: number; y: number; depth: number }): boolean {
  mat4TransformVec4(frame.viewProj, x, y, z, 1, V4);
  out.depth = V4[3];
  if (V4[3] <= 1e-6) {
    out.x = out.y = Number.NaN;
    return false;
  }
  out.x = ((V4[0] / V4[3] + 1) / 2) * canvasW;
  out.y = ((1 - V4[1] / V4[3]) / 2) * canvasH;
  return true;
}

/**
 * Projects a twin-local point (no roll applied - roll-invariant points such as
 * face and bolt-circle centres) to canvas px. depth = view-space distance;
 * depth <= 0 means behind the camera and x/y are NaN.
 */
export function projectPoint(frame: CameraFrame, p: [number, number, number], canvasW: number, canvasH: number): Point & { depth: number } {
  const out = { x: 0, y: 0, depth: 0 };
  projectInto(frame, p[0], p[1], p[2], canvasW, canvasH, out);
  return out;
}

// ---------------------------------------------------------------- pose selection and motion helpers

const WORKSPACE_POSE: Record<ModuleKind, PoseName> = {
  TubeSheet: "face",
  BonnetFlange: "bonnet",
  HeatExchangerFab: "section",
  GeneralArrangement: "section",
  // Storage tanks have no part on the exchanger twin: the overview pose.
  ShopTank: "overview",
  SiteTank: "overview",
};

/** Page -> pose: porthole on narrow canvases, wide when the right gutter is >= 200 px on modules. */
export function poseForPage(page: AmbientPage, workspaceModule: ModuleKind | null, layout: Pick<AmbientLayout, "canvas" | "column" | "narrow">): PoseName {
  if (layout.narrow || layout.canvas.w < CAMERA.narrowMaxW) return "porthole";
  if (page === "jobs") return "telemetry";
  if (page === "workspace") return workspaceModule ? WORKSPACE_POSE[workspaceModule] : "overview";
  const col = layout.column;
  if (col && layout.canvas.w - (col.x + col.w) >= POSE_PARAMS.wideMinGutter) return "wide";
  return "overview";
}

/** A change between these poses needs the 1.0 s haze-dip cut (angle delta > 15 deg). */
export function isLargePoseChange(a: PoseName, b: PoseName): boolean {
  if (a === b) return false;
  const da = Math.abs(POSES[a].offAxisDeg - POSES[b].offAxisDeg);
  const dp = Math.abs(POSES[a].pitchDeg - POSES[b].pitchDeg);
  return da > POSE_PARAMS.largeChangeDeg || dp > POSE_PARAMS.largeChangeDeg || a === "porthole" || b === "porthole";
}

/** OVERVIEW/TELEMETRY yaw swing: +-6 deg on a 96 s sine. */
export const swingYawDeg = (tSec: number) => CAMERA.swingAmpDeg * Math.sin((Math.PI * 2 * tSec) / CAMERA.swingPeriod);

/** Meridian roll for a pose at scene time t (deg). */
export const rollDegAt = (pose: PoseName, tSec: number) => (POSES[pose].rollDegPerSec * tSec) % 360;

/** Per-frame ease factor k = 1 - 0.94^(dt * 60). */
export const easeK = (dtSec: number) => 1 - Math.pow(CAMERA.easeBase, dtSec * 60);

/** First-order low-pass factor for time constant tau. */
export const lowPassK = (dtSec: number, tauSec: number) => 1 - Math.exp(-dtSec / Math.max(1e-6, tauSec));

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeInCubic = (t: number) => t * t * t;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);

/** Haze-dip match cut at elapsed ms: fog density, intensity, and whether the pose has jumped. */
export function hazeDip(elapsedMs: number): { fog: number; intensity: number; cut: boolean; done: boolean } {
  const { totalMs, cutAtMs, fogFrom, fogTo, intensityTo } = TRANSITIONS.hazeDip;
  const t = clamp(elapsedMs, 0, totalMs);
  const k = t < cutAtMs ? easeInCubic(t / cutAtMs) : 1 - easeOutCubic((t - cutAtMs) / (totalMs - cutAtMs));
  return { fog: fogFrom + (fogTo - fogFrom) * k, intensity: 1 + (intensityTo - 1) * k, cut: t >= cutAtMs, done: elapsedMs >= totalMs };
}
