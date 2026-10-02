/**
 * GLSL shared by every pass: the std140 "S" UBO, the luminance helpers
 * (lum / capL / softclip), quiet(), ign(), the capsule + ring SDFs, the
 * nearest-lattice-mouth search and the flow LUT lookup. Every pass uses these
 * exact functions so the luminance budget means the same thing everywhere.
 *
 * UBO layout is one flat list of vec4 slots (UBO.* below = slot index; the
 * engine writes floats at slot * 4). Positions are "element px": CSS px from
 * the canvas element's top-left (viewport x 0, y = --ambient-top), y down.
 */
import { COLORS, FLOW_LUT, LATTICE, RESOLVE } from "../constants";

/** vec4 slot indices into the "S" uniform block. */
export const UBO = {
  V: 0, // bufW, bufH, device px per CSS px, flags (FLAG_*)
  CAM: 1, // rect the camera clip space maps to: x, y, w, h (element px, eased)
  COL: 2, // content column x0, y0, x1, y1 (scroll 0)
  STG: 3, // stage x0, y0, x1, y1 (scroll 0)
  BOX: 4, // projected twin box x0, y0, x1, y1
  T: 5, // scene time (wrapped), event clock, scrollY, running halo 0..1
  VP: 6, // old VP xy, new VP xy (point, or direction when at infinity)
  VPM: 7, // crossfade 0..1, old-at-infinity, new-at-infinity, lattice alpha mul
  PTR: 8, // crescent pointer offset xy (px), scan-band screen x, scan echo strength
  HZ: 9, // haze pool centre xy, radii xy
  HZ2: 10, // warp offset 1, warp offset 2, breathing, haze weight
  TINT: 11, // workspace tint rgb, amount
  FX: 12, // haze dip 0..1, twin weight, flow weight, network weight
  FX2: 13, // streak weight, glass weight, signal lost 0..1, scanline phase
  BAND: 14, // scan band x (twin-local), strength, sigma, print front (lines exist only at x < this)
  BAND2: 15, // emerald pass x, strength, x-ray on, mouth ripple 0..1
  MDL: 16, // L, front bonnet depth, rear bonnet depth, roll (rad)
  EYE: 17, // eye in the fixed twin frame xyz, px per unit at w = 1
  MVP: 18, // mat4 (4 slots): twin-local (fixed frame) -> clip, incl. swing + tilt
  IVP: 22, // mat4 (4 slots): inverse of MVP (glass rays)
  REGA: 26, // per-region alpha multiplier
  REGB: 27, // per-region alpha add
  REGT: 28, // per-region module-tint mix
  LAT: 29, // pitch, row step, mouth r, lane every
  HALO: 30, // streak region ellipse centre xy, radii xy
  FLOW: 31, // activity A, face-mouth radius (local), hub amber halo alpha, streak length k
  PH: 32, // phases (0..8): shell, tube, process, riser
  BOLT: 33, // front bolt circle x, r, rear x, r (twin-local)
  HUB: 34, // queued (eased), streak max px, section row tint 0/1, face mouth alpha
  CLS: 35, // 4 slots: alpha per ALPHA_CLASS id (pose overrides applied)
  C0: 39, // ivec4 instance ranges: streaks, wire, links, sprites
  C1: 40, // ivec4 segments, pipe segs, event-ring segs, link segs
  C2: 41, // ivec4 sprites: shell, tube, process, face mouths
  C3: 42, // ivec4 sprites: bolts per circle, x-ray, nodes, event sprites
  C4: 43, // ivec4 streak cell rect: start col, start row, cols, rows
  C5: 44, // ivec4 paths: shell first, shell count, tube first, tube count
  C6: 45, // ivec4 paths: process first, process count; quiet count; online agents
  LCUR: 46, // 4 slots: link current alpha per link index (16)
  EV: 50, // 8 slots: event pool (typeId, start, link index or -1, region or batch count)
  BC: 58, // broadcast links: up to 3 online link indices, count
  Q: 59, // 12 slots: quiet rects x0, y0, x1, y1 (element px at scroll 0)
  SIZE: 71,
} as const;

export const FLAG_SCANLINES = 1;
export const FLAG_GLASS = 2;
export const FLAG_LUM = 4;

/** Data texture: RGBA32F, DATA_W wide; one section per row block. */
export const DATA_W = 1024;
export const DATA_ROWS = {
  seg: 0, // 5 rows: 2 texels per segment (x0 y0 z0 x1 | y1 z1 region class)
  path: 5, // 6 rows: 8 paths x 128 samples per row
  link: 11, // x0 y0 x1 y1 (canvas px); a link's tether segment comes first
  linkMeta: 12, // link index, distance from points[0] at x0 (-1 = tether), link length, node index
  node: 13, // x, y (canvas px), flags (NODE_*), change time (event clock)
  mouth: 14, // x y z (twin-local), kind + fill alpha (kind = floor, alpha = fract)
  xray: 15, // x y z
  pathMeta: 16, // PATH_KIND, world length, closed
  count: 17,
} as const;
export const MAX_SEGMENTS = (5 * DATA_W) / 2;
export const MAX_LINK_SEGMENTS = 64;

export const NODE_ONLINE = 1;
export const NODE_LOCAL = 2;
export const NODE_CLUSTER = 4;
export const NODE_REAR = 8;
export const NODE_GHOST = 16;

/** "#rrggbb" -> GLSL vec3 literal (sRGB-encoded, as blended). */
export function v3(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => (v / 255).toFixed(3);
  return `vec3(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** Number -> GLSL float literal ("12" -> "12.", "0.12" stays). */
export function f1(n: number): string {
  const r = +n.toFixed(5);
  return Number.isInteger(r) ? `${r}.` : String(r);
}

const C = COLORS;

export const COMMON = `#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
layout(std140) uniform S{vec4 V,CAM,COL,STG,BOX,T,VP,VPM,PTR,HZ,HZ2,TINT,FX,FX2,BAND,BAND2,MDL,EYE;mat4 MVP,IVP;vec4 REGA,REGB,REGT,LAT,HALO,FLOW,PH,BOLT,HUB,CLS[4];ivec4 C0,C1,C2,C3,C4,C5,C6;vec4 LCUR[4],EV[8],BC,Q[${RESOLVE.maxQuietRects}];};
const vec3 W3=vec3(.2126,.7152,.0722),BASE=${v3(C.base)},QBASE=${v3(C.quietBase)},CY=${v3(C.wire)},CYL=${v3(C.silhouette)},ICE=${v3(C.xray)},EM=${v3(C.completeRing)},RO=${v3(C.failure)},FOG=${v3(C.farFog)};
float lum(vec3 c){return dot(pow(max(c,0.),vec3(2.2)),W3);}
vec3 capL(vec3 c,float m){float l=lum(c);return l>m?c*pow(m/l,.4545):c;}
vec3 softclip(vec3 c){const float k=${RESOLVE.softclipKnee},h=${RESOLVE.softclipCeiling};float l=lum(c);if(l<=k)return c;return c*pow((k+(h-k)*(1.-exp(-(l-k)/(h-k))))/l,.4545);}
float ign(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
float qdist(vec2 p){const float r=${f1(RESOLVE.quietRadius)};float d=1e5;for(int i=0;i<${RESOLVE.maxQuietRects};i++){if(i>=C6.z)break;vec4 b=Q[i];b.yw-=T.z;vec2 q=abs(p-(b.xy+b.zw)*.5)-(b.zw-b.xy)*.5+r;d=min(d,length(max(q,0.))+min(max(q.x,q.y),0.)-r);}return d;}
float quiet(vec2 p){return smoothstep(0.,1.,smoothstep(0.,${f1(RESOLVE.quietFeatherPx)},qdist(p)));}
float sdCap(vec2 l,float hl){return length(vec2(max(abs(l.x)-hl,0.),l.y));}
float ring(float d,float r,float sc){return clamp(1.-abs(d-r)*sc,0.,1.);}
vec3 latNear(vec2 p){float P=LAT.x,h2=LAT.y*2.;vec2 a=vec2(floor(p.x/P+.5)*P,floor(p.y/h2+.5)*h2),b=vec2((floor(p.x/P)+.5)*P,(floor(p.y/h2)+.5)*h2);vec2 m=dot(p-a,p-a)<dot(p-b,p-b)?a:b;return vec3(m,floor(m.y/LAT.y+.5));}
bool lane(float row){return abs(mod(row,LAT.w)-${f1(LATTICE.laneRow)})<.5;}
uniform sampler2D uLut;
vec3 lut(float u,float row){return texture(uLut,vec2((clamp(u,0.,1.)*${f1(FLOW_LUT.width - 1)}+.5)/${f1(FLOW_LUT.width)},row*.5+.25)).rgb;}
`;
