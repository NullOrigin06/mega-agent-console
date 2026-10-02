# Ambient engine — module contracts (build-time notes)

`types.ts` is the public contract between the React wrapper and the engine.
This file pins the **internal** contracts between the pure math modules and
the GL engine so they can be built in parallel. All math modules are pure
TypeScript (no DOM, no GL) and unit-testable in Vitest/jsdom.

## constants.ts (math builder owns)
Every alpha, hex, multiplier, cap and count from the spec, exported as
`const` objects (no enums). The GL engine and the luminance-budget test read
these; nobody hard-codes a number twice. Includes
`LATTICE = { pitch: 34, pitchNarrow: 28, rowStep: pitch*sqrt(3)/2, mouthR: 13.6, mouthRNarrow: 11.2, laneEvery: 10 }`
and `TIERS` (T1..T3 table) and `ALPHA_CLASS` ids used by twinGeometry.

## camera.ts (math builder owns)
```ts
export interface CameraInput {
  pose: PoseName;
  canvasW: number; canvasH: number;          // canvas px
  stage: Rect | null;                         // canvas px
  model: VesselModel;
  yawOffsetDeg: number; pitchOffsetDeg: number; // swing + cursor tilt, already eased
  rollDeg: number;                            // meridian roll about the vessel axis
}
export interface CameraFrame {
  view: Float32Array; proj: Float32Array; viewProj: Float32Array; // twin-local -> clip
  model: Float32Array;                        // roll about +X (and explode offsets are in geometry)
  /** Vanishing point of the vessel axis in canvas px; null when at infinity (section). */
  vanishing: Point | null;
  /** Projected twin bounding box in canvas px. */
  twinBox: Rect;
  shellRadiusPx: number;                      // R_px used for LOD
  frontFace: { x: number; y: number; radiusPx: number };
  rearFace: { x: number; y: number; radiusPx: number };
}
export function solveCamera(input: CameraInput): CameraFrame;
export function projectPoint(frame: CameraFrame, p: [number, number, number], canvasW: number, canvasH: number): Point & { depth: number };
// plus a tiny mat4/vec3 kit: perspective, lookAt, multiply, rotateX/Y, invert as needed
```
Pose numbers (spec): overview FOV 30 deg vertical, view 36 deg off axis (camera in front-right of the front face), pitch -4, principal point = stage centre (lens shift), D_px = clamp(80, 0.62*stage.h, 132). 1440x900 reference (canvas 1208x809, stage x 614..1196, h 177): front face centre ~(86.2%, 12.6%), rear face ~(65.9%, 9.6%), VP ~(-16%, -2%). telemetry = overview with D_px x 0.7. face 10 deg off axis, face diameter 0.9*stage.h. bonnet 62 deg, scale 1.4 on the front channel. section 8 deg off side view, pitch -6, VP -> null. porthole end-on (90 deg yaw, -6 pitch) centred (92% w, 6% h), outer flange radius 0.34*w. wide: face centre in right gutter, D_px = min(160, 0.62*gutterW), length cap 760 px.

## twinGeometry.ts (math builder owns)
```ts
export function toVesselModel(spec: VesselSpec): VesselModel;   // clamps per spec
export const SEG_STRIDE = 8; // x0,y0,z0, x1,y1,z1 (twin-local), region (0..3), alphaClass (ALPHA_CLASS id)
export interface BoltCircle { center: [number, number, number]; radius: number; count: number; } // in the YZ plane at x = center[0]
export interface TwinGeometry {
  segments: Float32Array; segmentCount: number;
  boltFront: BoltCircle; boltRear: BoltCircle;
  faceMouths: Float32Array; faceMouthCount: number; // stride 3, twin-local, on the front face (x = +L/2)
  baffleX: number[];                                 // baffle stations
  xrayDots: Float32Array; xrayDotCount: number;      // stride 3, 37 per baffle
}
export function buildTwinGeometry(model: VesselModel, lod: { shellRadiusPx: number; maxSegments: number }, pose: PoseName): TwinGeometry;
```
LOD per spec: meridians clamp(round(R/4.5),8,16); ring segs clamp(round(2*pi*R/7),24,64); shell rings 9 if spacing >= 14 px else 5; bolts every 2nd if spacing < 6 px; face mouths 61/91/127/169 by pitch >= 9 px; total <= maxSegments.

## paths.ts (math builder owns)
```ts
export const PATH_SAMPLES = 128;
export interface Range { start: number; count: number; }
export interface FlowPaths {
  data: Float32Array;   // PATH_SAMPLES * pathCount * 4 : x,y,z twin-local, w = arclength fraction 0..1
  pathCount: number;
  shell: Range;          // serpentine streamlines (12), rear N1 -> front N2, peaks locked to baffles at +/-0.72R
  tube: Range;           // tube lanes (7: axis + hex ring at 0.45R), front -> rear
  process: Range;        // P1 supply, P2 return, P3/P4 risers (twin-local, long runs that leave the frame)
  lengths: Float32Array; // world arclength per path (twin-local units) for px/s speed conversion
}
export function buildFlowPaths(model: VesselModel, pose: PoseName): FlowPaths;
```

## network.ts (math builder owns)
```ts
export interface NetworkInput {
  agents: AgentNodeInput[]; canvasW: number; canvasH: number; narrow: boolean;
  quiet: Rect[]; twinBox: Rect; column: Rect | null; stage: Rect | null;   // all canvas px (quiet already scroll-adjusted to scroll 0)
  hubFront: Point; hubRear: Point;                                          // canvas px
}
export interface NetworkNode { id: string; x: number; y: number; online: boolean; isLocal: boolean; cluster: number /* 0 = single, n = "n more" */; hub: "front" | "rear"; }
export interface NetworkLayout {
  nodes: NetworkNode[];
  links: Array<{ node: number; points: Float32Array /* x,y pairs, canvas px, Manhattan along lattice rows/cols */ }>;
  ghost: Point | null;   // dashed placeholder when no agents are paired
}
export function layoutNetwork(input: NetworkInput): NetworkLayout;
export function fnv1a(s: string): number;
```
Slots snap to lattice mouths (LATTICE pitch, triangular, origin at canvas 0,0), FNV-1a(agentId) + linear probing, >= 72 px spacing, clear of quiet+feather+36 px and twinBox, max 12 + one cluster.

## lut.ts / noise.ts / events.ts (math builder owns)
```ts
export function oklchToSrgb(l: number, c: number, hDeg: number): [number, number, number]; // 0..1, gamut-clipped
export function buildFlowLut(): Uint8Array; // 64 x 2 RGBA8: row 0 cold (#5aa3ec -> #86a1ed -> #a5a2e7), row 1 hot (#c2a975 -> #c4a580 -> #c1a28a)
export function buildValueNoise(size?: number): Uint8Array; // size^2 R8, tileable
export interface EventPool { push(ev: AmbientEvent, nowSec: number): void; pack(nowSec: number, out: Float32Array /* 8 * 4 */): number /* live count */; clear(): void; }
export function createEventPool(): EventPool; // <= 3 concurrent, queue <= 6 (oldest dropped), extras 700 ms apart
// packed vec4 per event: (typeId, startTimeSec, param0, param1)
```

## GL engine (gl builder owns): engine.ts, gl.ts, tiers.ts, shaders/*.ts, fallback2d.ts
- `engine.ts` default-exports `createAmbientEngine: CreateAmbientEngine` and is a module-level singleton.
- Shaders are TS modules exporting template strings (`export const HAZE_FRAG = \`#version 300 es ...\``).
- Consumes the math modules above only through these signatures.
