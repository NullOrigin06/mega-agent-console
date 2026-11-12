/**
 * Plaster equipment relief: the landing page's hero background.
 *
 * How it works (the Immersive Garden technique, rebuilt from scratch with our
 * own subject):
 * - A real 3D mesh (a dense plane, ~300k vertices) is sculpted into a
 *   bas-relief of process equipment: a large tube sheet with drilled holes
 *   and a bolt circle, a flange, and a heat exchanger with nozzles and
 *   saddles. The sculpture is generated in the shader, so nothing is
 *   downloaded.
 * - At rest the relief is pressed almost flat into the wall (5% depth). A
 *   cursor "flowmap" - a texture that remembers where the pointer moved and
 *   fades - decides where it rises: there the geometry comes forward to full
 *   depth, then sinks back.
 * - Lit with a soft studio light, shadowed cavities and plaster grain, seen
 *   through a narrow 30-degree perspective camera that tilts toward the mouse.
 * - Idle: a slow automatic sweep. Pause button and prefers-reduced-motion: a
 *   still frame. Renders only while the hero is visible and the tab is shown.
 */

import { createFluid } from "./fluid.js";

const CFG = {
  mouseEase: 0.4,
  dissipation: 0.93, // trail fade per frame at 60 Hz (frame-rate corrected)
  falloff: 0.13, // trail stamp radius, in screen heights
  restDepth: 0.08, // relief depth at rest, as a fraction of full
  baseExtrude: 0.0, // extra resting extrusion everywhere
  idleAfterMs: 2600,
  fov: 30, // degrees, vertical
  distance: 10,
  depth: 0.8, // full relief depth, world units
  tilt: 0.2, // radians of tilt toward the pointer
  maxDpr: 1.25,
  grid: [640, 400], // mesh segments (x, y)
};

const NOISE = `
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}`;

/* The sculpture. Units: the visible screen height spans y = -1..1, and x spans -aspect..aspect. */
const SCULPT = `
uniform float uAspect;
uniform highp int uScene;   // 0 hero wall, 1 tube sheet, 2 flange, 3 exchanger, 4 shop tank, 5 site tank
uniform float uSide;  // module rows: -1 part on the left, 1 on the right
uniform float uZoom;  // close-ups: magnification of the part
uniform vec2 uCenter; // close-ups: point of the part shown at the centre
const float SQ3 = 1.7320508;

float cap(float d, float r, float edge) { return 1.0 - smoothstep(r - edge, r + edge, d); }

// Raised pipe between two points. Segment endpoints meet exactly, so changes
// in direction form a continuous piping run rather than isolated decoration.
float pipeSegment(vec2 p, vec2 a, vec2 b, float radius) {
  vec2 v = b - a;
  float t = clamp(dot(p - a, v) / max(dot(v, v), 0.00001), 0.0, 1.0);
  float d = length(p - (a + t * v));
  return 0.20 * sqrt(max(0.0, 1.0 - (d * d) / (radius * radius)));
}

// Holes on a ring, by angular repetition: distance to the nearest of n holes at radius rr.
float ringHoles(vec2 q, float rr, float n) {
  float a = atan(q.y, q.x);
  float sector = 6.2831853 / n;
  float la = mod(a + sector * 0.5, sector) - sector * 0.5;
  vec2 h = vec2(cos(la), sin(la)) * length(q);
  return length(h - vec2(rr, 0.0));
}

// Distance to the nearest tube hole on a 30-degree triangular pitch (pass lane every 10th row).
float latticeHole(vec2 q, float P) {
  float rowH = P * SQ3 * 0.5;
  float j0 = floor(q.y / rowH);
  float best = 1e5;
  for (int dj = -1; dj <= 1; dj++) {
    float j = j0 + float(dj);
    if (mod(j, 10.0) == 4.0) continue;
    float off = mod(j, 2.0) * 0.5 * P;
    float i = floor((q.x - off) / P + 0.5);
    for (int di = -1; di <= 1; di++) {
      vec2 c = vec2((i + float(di)) * P + off, j * rowH + rowH * 0.5);
      best = min(best, length(q - c));
    }
  }
  return best;
}

// Distance to the nearest tube hole on a 30 degree triangular pitch. Only holes whose centre lies
// inside the tube limit exist, so no hole is cut in half at the edge; the row on the centreline is
// left out as the pass partition lane.
float tubeHole(vec2 q, float P, float limit) {
  float rowH = P * SQ3 * 0.5;
  float j0 = floor(q.y / rowH + 0.5);
  float best = 1e5;
  for (int dj = -1; dj <= 1; dj++) {
    float j = j0 + float(dj);
    if (j == 0.0) continue;
    float off = mod(j, 2.0) * 0.5 * P;
    float i = floor((q.x - off) / P + 0.5);
    for (int di = -1; di <= 1; di++) {
      vec2 c = vec2((i + float(di)) * P + off, j * rowH);
      if (length(c) > limit) continue;
      best = min(best, length(q - c));
    }
  }
  return best;
}

float tubeSheet(vec2 p, vec2 c, float R) {
  vec2 q = p - c;
  float d = length(q);
  if (d > R + 0.05) return 0.0;
  float plate = cap(d, R, 0.012) * 0.55;
  float rim = cap(d, R, 0.012) * (1.0 - cap(d, R * 0.86, 0.01)) * 0.12;
  float h = plate + rim;
#ifndef COARSE
  float P = R * 0.066;        // 31.75 mm pitch on a 25.4 mm tube, about 24 tubes across
  float limit = R * 0.775;    // outer tube limit
  float face = 1.0;           // 1 on the machined plate face, 0 inside a tube joint
  if (d < limit + P) {
    float hd = tubeHole(q, P, limit);
    float bore = cap(hd, P * 0.315, 0.0022);                 // tube inside diameter
    float wall = cap(hd, P * 0.40, 0.0022) - bore;           // tube end standing proud of the plate
    float seat = cap(hd, P * 0.47, 0.003);                   // shallow dish left by rolling the joint
    h += wall * 0.04 - seat * 0.028 - bore * 0.36;
    face = 1.0 - seat;
    // Pass partition groove along the centreline lane.
    h -= exp(-pow(q.y / (P * 0.11), 2.0)) * cap(abs(q.x), limit, 0.01) * 0.04;
  }
  // Gasket land between the tube field and the bolting rim.
  h += (cap(d, R * 0.845, 0.003) - cap(d, R * 0.80, 0.003)) * 0.03;
  // 28 bolt holes, each with a spot face.
  float bd = ringHoles(q, R * 0.93, 28.0);
  h -= cap(bd, R * 0.019, 0.003) * 0.42 + cap(bd, R * 0.033, 0.003) * 0.045;
  // Turned face: fine concentric tool marks.
  h += sin(d * 430.0) * 0.0016 * face * cap(d, R * 0.985, 0.01);
#endif
  return h;
}

float flange(vec2 p, vec2 c, float Ro, float Ri) {
  vec2 q = p - c;
  float d = length(q);
  if (d > Ro + 0.05) return 0.0;
  float ring = cap(d, Ro, 0.01) * (1.0 - cap(d, Ri, 0.01)) * 0.42;
  float face = cap(d, Ri + 0.1, 0.008) * (1.0 - cap(d, Ri, 0.01)) * 0.1;
#ifdef COARSE
  return ring + face;
#else
  float boltDistance = ringHoles(q, (Ro + Ri) * 0.5 + 0.03, 12.0);
  float bolts = cap(boltDistance, 0.024, 0.003) * 0.34;
  float spotface = cap(boltDistance, 0.038, 0.003) * 0.045;
  float groove = exp(-pow((d - (Ri + 0.07)) / 0.007, 2.0)) * 0.035;
  return ring + face - bolts - spotface - groove;
#endif
}

// Side view of a shell-and-tube exchanger: shell, two elliptical heads, nozzles, saddles.
float exchanger(vec2 p, vec2 c, float L, float r) {
  vec2 q = p - c;
  if (abs(q.x) > L * 0.5 + r + 0.05 || q.y > r + 0.32 || q.y < -r - 0.25) return 0.0;
  float h = 0.0;
  float shellX = L * 0.5;
  // Shell (cylinder profile) and heads (half ellipsoids).
  float ex = max(abs(q.x) - shellX, 0.0) / (r * 0.55);
  float k = 1.0 - (q.y * q.y) / (r * r) - ex * ex;
  if (k > 0.0) h = max(h, 0.5 * sqrt(k));
  // Head-to-shell flanges (girth rings).
  for (int s = -1; s <= 1; s += 2) {
    float gx = abs(q.x - float(s) * shellX);
    if (gx < 0.03 && abs(q.y) < r * 1.08) h = max(h, 0.52 * sqrt(max(0.0, 1.0 - pow(q.y / (r * 1.08), 2.0))));
  }
  // Nozzles on top.
  for (int s = -1; s <= 1; s += 2) {
    float nx = q.x - float(s) * L * 0.3;
    if (abs(nx) < 0.07 && q.y > 0.0 && q.y < r + 0.26) h = max(h, 0.4 * sqrt(max(0.0, 1.0 - pow(nx / 0.07, 2.0))));
    if (abs(nx) < 0.11 && abs(q.y - (r + 0.25)) < 0.025) h = max(h, 0.42 * sqrt(max(0.0, 1.0 - pow(nx / 0.11, 2.0))));
    float weld = length(vec2(nx * 1.5, (q.y - r * 0.8) * 3.0));
    h += exp(-pow((weld - 0.105) / 0.015, 2.0)) * 0.035;
  }
  // Saddles underneath.
  for (int s = -1; s <= 1; s += 2) {
    float sx = q.x - float(s) * L * 0.28;
    float w = 0.09 + 0.05 * clamp((-q.y - r * 0.6) / 0.2, 0.0, 1.0);
    if (abs(sx) < w && q.y < -r * 0.55 && q.y > -r - 0.2) h = max(h, 0.3 * (1.0 - smoothstep(w - 0.015, w, abs(sx))));
  }
  return h;
}

// Vertical shop-built vessel: shell, dished heads, legs, side nozzle, manway.
float shopTank(vec2 p, vec2 c) {
  vec2 q = p - c;
  float w = 0.3;
  float h = 0.0;
  float top = 0.42, bot = -0.5;
  if (abs(q.x) < w) {
    float prof = 0.5 * sqrt(max(0.0, 1.0 - pow(q.x / w, 2.0)));
    if (q.y < top && q.y > bot) h = prof;
    float ht = 1.0 - pow(q.x / w, 2.0) - pow((q.y - top) / 0.16, 2.0);
    if (q.y >= top && ht > 0.0) h = max(h, 0.5 * sqrt(ht));
    float hb = 1.0 - pow(q.x / w, 2.0) - pow((q.y - bot) / 0.12, 2.0);
    if (q.y <= bot && hb > 0.0) h = max(h, 0.5 * sqrt(hb));
  }
  for (int s = -1; s <= 1; s += 2) {          // legs
    float lx = q.x - float(s) * w * 0.7;
    if (abs(lx) < 0.035 && q.y < bot && q.y > bot - 0.34) h = max(h, 0.28 * sqrt(max(0.0, 1.0 - pow(lx / 0.035, 2.0))));
  }
  if (q.x > 0.0 && q.x < w + 0.2 && abs(q.y - 0.18) < 0.06) h = max(h, 0.36 * sqrt(max(0.0, 1.0 - pow((q.y - 0.18) / 0.06, 2.0)))); // nozzle
  float mw = length(q - vec2(-0.05, -0.12));
  h += cap(mw, 0.11, 0.008) * (1.0 - cap(mw, 0.08, 0.008)) * 0.06; // manway ring
  return h;
}

// Field-erected storage tank: courses, cone roof, wind girder, stair.
float siteTank(vec2 p, vec2 c) {
  vec2 q = p - c;
  float w = 0.75;
  float h = 0.0;
  float base = -0.55, eave = 0.2;
  if (abs(q.x) < w && q.y > base && q.y < eave) {
    h = 0.34 * sqrt(max(0.0, 1.0 - pow(q.x / w, 2.0))) + 0.06;
    float course = abs(fract((q.y - base) / 0.15) - 0.5);
    h -= (1.0 - smoothstep(0.0, 0.06, 0.5 - course)) * 0.025; // course seams
  }
  float roof = eave + (1.0 - abs(q.x) / (w + 0.04)) * 0.24;
  if (abs(q.x) < w + 0.04 && q.y >= eave && q.y < roof) h = max(h, 0.3 * (1.0 - (q.y - eave) / 0.3));
  if (abs(q.y - eave) < 0.02 && abs(q.x) < w + 0.06) h = max(h, 0.42); // wind girder
  float st = abs((q.x - 0.15) - (q.y - base) * 1.1);                // stair stringer
  if (st < 0.025 && q.y > base && q.y < eave && q.x > 0.1) h = max(h, 0.44);
  if (abs(q.y - base) < 0.03 && abs(q.x) < w + 0.1) h = max(h, 0.2); // base ring
  return h;
}

float heightAt(vec2 p) {
  float a = uAspect;
  if (uScene != 0) {
    p = uCenter + p / uZoom;
    vec2 c = vec2(uSide * a * 0.5, 0.0);
    if (uScene == 1) return tubeSheet(p, c, 0.82);
    if (uScene == 2) return flange(c + (p - c) / 1.85, c, 0.42, 0.2);
    if (uScene == 3) { c.y = -0.14; return exchanger(c + (p - c) / 1.75, c, 1.15, 0.2); }
    if (uScene == 4) { c.y = 0.06; return shopTank(c + (p - c) / 1.3, c); }
    c.y = 0.08;
    return siteTank(c + (p - c) / 1.1, c);
  }
  float h = 0.0;
  h = max(h, tubeSheet(p, vec2(a * 0.52, 0.12), 0.78));
  h = max(h, flange(p, vec2(-a * 0.72, -0.52), 0.42, 0.2));
  h = max(h, exchanger(p, vec2(-a * 0.36, 0.62), 1.15, 0.2));
  // A connected process sketch: exchanger to vertical vessel and onward to
  // the flanged line. It is illustrative, not an engineering plant layout.
  vec2 tankCenter = vec2(-a * 0.92, -0.02);
  h = max(h, shopTank(p, tankCenter));
  vec2 inlet = vec2(-a * 0.36 - 0.345, 1.06);
  vec2 elbow1 = vec2(tankCenter.x, 1.06);
  vec2 tankTop = tankCenter + vec2(0.0, 0.58);
  h = max(h, pipeSegment(p, inlet, elbow1, 0.026));
  h = max(h, pipeSegment(p, elbow1, tankTop, 0.026));
  vec2 tankOutlet = tankCenter + vec2(0.30, 0.18);
  vec2 elbow2 = vec2(-a * 0.72, tankOutlet.y);
  vec2 flangeTop = vec2(-a * 0.72, -0.10);
  h = max(h, pipeSegment(p, tankOutlet, elbow2, 0.027));
  h = max(h, pipeSegment(p, elbow2, flangeTop, 0.027));
  vec2 exchangerOutlet = vec2(-a * 0.36 + 0.345, 1.06);
  vec2 elbow3 = vec2(a * 0.52, 1.06);
  vec2 sheetTop = vec2(a * 0.52, 0.90);
  h = max(h, pipeSegment(p, exchangerOutlet, elbow3, 0.025));
  h = max(h, pipeSegment(p, elbow3, sheetTop, 0.025));
  // A faint drafting border keeps flat areas from looking empty.
  float frame = abs(abs(p.y) - 0.94) < 0.004 ? 0.05 : 0.0;
  return max(h, frame);
}
`;

// The mesh carries the large forms; holes and bolt holes come from per-pixel shading (no spikes).
const VERT = `#version 300 es
precision highp float;
#define COARSE
in vec2 aPos;          // sculpture units
uniform mat4 uMVP;
uniform float uUnit;   // world units per sculpture unit
uniform float uDepth;
uniform float uScroll; // sculpture units
uniform float uRest;
uniform float uBase;
uniform sampler2D tFlow;
out vec2 vP;
${SCULPT}
void main() {
  vec2 p = aPos + vec2(0.0, uScroll);
  vec4 flat0 = uMVP * vec4(aPos * uUnit, 0.0, 1.0);
  vec2 suv = flat0.xy / flat0.w * 0.5 + 0.5;
  float e = smoothstep(0.0, 1.0, clamp(uBase + textureLod(tFlow, suv, 0.0).a, 0.0, 1.0));
  float h = heightAt(p) * mix(uRest, 1.0, e);
  vP = p;
  gl_Position = uMVP * vec4(aPos * uUnit, h * uDepth, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vP;
out vec4 outColor;
uniform sampler2D tFlow;
uniform vec2 uRes;
uniform float uRest;
uniform float uBase;
uniform float uTime;
uniform vec3 uPlaster;
uniform vec3 uTint;
uniform sampler2D tDye;
uniform float uDyeAmount;
uniform float uRainbow;
${NOISE}
${SCULPT}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
void main() {
  vec2 suv = gl_FragCoord.xy / uRes;
  vec4 flow = texture(tFlow, suv);
  float e = smoothstep(0.0, 1.0, clamp(uBase + flow.a, 0.0, 1.0));
  float s = mix(uRest, 1.0, e);
  vec2 p = vP;
  float px = 1.6 / uRes.y;        // about one screen pixel in sculpture units
  float h = heightAt(p);
  float hx = heightAt(p + vec2(px, 0.0)) - heightAt(p - vec2(px, 0.0));
  float hy = heightAt(p + vec2(0.0, px)) - heightAt(p - vec2(0.0, px));
  vec3 n = normalize(vec3(-hx * s, -hy * s, 2.0 * px * 1.6));

  // Ambient occlusion: lower than the neighbourhood = darker.
  float r = 0.035;
  float around = (heightAt(p + vec2(r, 0.0)) + heightAt(p - vec2(r, 0.0)) + heightAt(p + vec2(0.0, r)) + heightAt(p - vec2(0.0, r))) * 0.25;
  float ao = 1.0 - clamp((around - h) * 1.6 * s, 0.0, 0.45);

  vec3 L = normalize(vec3(-0.5, 0.6, 0.62));
  float diff = 0.78 + 0.3 * dot(n, L);
  float grain = 0.97 + 0.045 * (vnoise(p * 260.0) * 0.6 + vnoise(p * 60.0) * 0.4);
  float grad = mix(1.03, 0.94, length(suv - vec2(0.15, 0.95)) * 0.7);
  vec3 col = uPlaster * diff * ao * grain * grad;
  vec3 halfV = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = max(0.0, pow(max(dot(n, halfV), 0.0), 36.0) - pow(halfV.z, 36.0));
  col += uTint * spec * 0.5 * e;
  col *= 1.0 + 0.3 * e;

  // Iridescent sheen on tilted surfaces where the trail is moving.
  float tilt = 1.0 - n.z;
  float hue = fract(atan(n.y, n.x) / 6.2831853 + uTime * 0.02 - 0.52);
  vec3 sheen = mix(uTint, hsv2rgb(vec3(hue, 0.35, 1.0)), uRainbow);
  float amount = smoothstep(0.04, 0.3, tilt) * smoothstep(0.02, 0.35, flow.b) * 0.4;
  col = mix(col, col * 0.55 + sheen * 0.5, amount);

  // Fluid dye: coloured swirls stirred into the plaster, strongest on raised, lit faces.
  vec3 dye = texture(tDye, suv).rgb * uDyeAmount;
  float dl = clamp(max(dye.r, max(dye.g, dye.b)), 0.0, 1.0);
  // Stain, not paint: the plaster keeps its light and shade, the dye shifts its colour.
  vec3 hueOnly = dye / max(dl, 1e-3);
  vec3 stained = col * mix(vec3(1.0), 0.55 + 0.75 * hueOnly, 0.85) * (0.9 + 0.25 * tilt);
  col = mix(col, stained, smoothstep(0.0, 0.45, dl));
  outColor = vec4(col, 1.0);
}`;

// Flowmap: rg = velocity (encoded 0..1), b = speed, a = extrusion.
const FLOW_VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FLOW_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D tMap;
uniform vec2 uMouse;
uniform vec2 uVel;
uniform float uAspect;
uniform float uFalloff;
uniform float uDissipation;
uniform float uDelta;
uniform float uTime;
uniform float uStrength;
${NOISE}
void main() {
  vec4 d = texture(tMap, vUv);
  vec2 vel = d.rg * 2.0 - 1.0;
  float friction = 1.0 / uDissipation - 1.0;
  float fade = 1.0 / (1.0 + uDelta * friction);
  vel *= fade;
  float mag = d.b * fade;
  float ext = d.a * mix(fade, 1.0, 0.45);
  vec2 c = vUv - uMouse;
  c.x *= uAspect;
  float fall = smoothstep(uFalloff, 0.0, length(c)) * uStrength;
  vec2 v = uVel * 40.0;
  float m = 1.0 - pow(1.0 - min(1.0, length(v)), 2.0);
  float n = 0.25 + 0.75 * smoothstep(0.3, 1.0, vnoise(vUv * vec2(uAspect, 1.0) * 6.0 + uTime * 0.12));
  vel += v * fall * n * uDelta;
  mag += m * fall * n * uDelta;
  ext += m * 3.2 * fall * (0.45 + 0.55 * n) * uDelta;
  outColor = vec4(clamp(vel, -1.0, 1.0) * 0.5 + 0.5, clamp(mag, 0.0, 1.0), clamp(ext, 0.0, 1.0));
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader error");
  return s;
}

function program(gl, vert, frag) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.bindAttribLocation(p, 0, "aPos");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link error");
  const u = {};
  const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/* Minimal column-major 4x4 matrices. */
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
function multiply(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function translateZ(z) {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, z, 1];
}
function rotX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}
function rotY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ plaster?: string, tint?: string, onState?: (s: {paused: boolean, available: boolean}) => void }} opts
 */
export function createRelief(canvas, opts = {}) {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
  if (!gl) {
    opts.onState?.({ paused: true, available: false });
    return null;
  }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const flowProg = program(gl, FLOW_VERT, FLOW_FRAG);
  // 1x1 black texture so scenes without fluid sample "no dye".
  const noDye = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, noDye);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  const reliefProg = program(gl, VERT, FRAG);
  const plaster = hexToRgb(opts.plaster ?? "#ebe7df");
  const scene = opts.scene ?? 0;
  const side = opts.side ?? 1;
  const grid = opts.grid ?? CFG.grid;
  const falloff = opts.falloff ?? CFG.falloff;
  const dissipation = opts.dissipation ?? CFG.dissipation;
  const rainbow = opts.rainbow ?? 0.55;
  const idleSweep = (opts.idleSweep ?? true) && !reduce.matches;
  const restDepth = opts.restDepth ?? CFG.restDepth;
  const scrollFactor = opts.scrollFactor ?? 0.25;
  const zoom = opts.zoom ?? 1;
  // Reduced motion: nothing moves on its own (no idle sweep, no drifting tilt), but the
  // relief still answers the visitor's own cursor.
  const tilt = reduce.matches ? 0 : opts.tilt ?? CFG.tilt;
  const center = opts.center ?? [0, 0];
  const tint = hexToRgb(opts.tint ?? "#7abfc5");

  // Full-screen triangle for the flowmap pass.
  const triVao = gl.createVertexArray();
  gl.bindVertexArray(triVao);
  const tri = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, tri);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // Optional fluid simulation (hero only): dye stirred into the plaster by the cursor.
  let fluid = null;
  if (opts.fluid) {
    try {
      fluid = createFluid(gl, triVao);
    } catch (err) {
      console.warn("Fluid simulation unavailable.", err);
    }
  }

  // The relief mesh: a dense grid, rebuilt when the aspect ratio changes.
  const meshVao = gl.createVertexArray();
  const meshPos = gl.createBuffer();
  const meshIdx = gl.createBuffer();
  let indexCount = 0, meshAspect = 0;
  const buildMesh = (aspect) => {
    const [nx, ny] = grid;
    const halfW = aspect * 1.2, halfH = 1.2; // margin for tilt and scroll
    const pos = new Float32Array((nx + 1) * (ny + 1) * 2);
    let k = 0;
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      pos[k++] = -halfW + (2 * halfW * i) / nx;
      pos[k++] = -halfH + (2 * halfH * j) / ny;
    }
    const idx = new Uint32Array(nx * ny * 6);
    k = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = c; idx[k++] = b; idx[k++] = d; idx[k++] = c;
    }
    gl.bindVertexArray(meshVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, meshPos);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    indexCount = idx.length;
    meshAspect = aspect;
  };

  const makeTarget = (w, h) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0.5, 0.5, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fb, w, h };
  };

  let W = 1, H = 1, cssW = 1, cssH = 1, flowA = null, flowB = null;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, CFG.maxDpr);
    const r = canvas.getBoundingClientRect();
    cssW = Math.max(1, r.width);
    cssH = Math.max(1, r.height);
    W = Math.round(cssW * dpr);
    H = Math.round(cssH * dpr);
    canvas.width = W;
    canvas.height = H;
    const fw = Math.max(64, Math.round(cssW / 4)), fh = Math.max(64, Math.round(cssH / 4));
    if (!flowA || flowA.w !== fw || flowA.h !== fh) {
      for (const target of [flowA, flowB]) {
        if (target) { gl.deleteFramebuffer(target.fb); gl.deleteTexture(target.tex); }
      }
      flowA = makeTarget(fw, fh);
      flowB = makeTarget(fw, fh);
    }
    const aspect = cssW / cssH;
    if (Math.abs(aspect - meshAspect) > 0.02) {
      buildMesh(aspect);
      fluid?.resize(cssW, cssH);
    }
  };

  const target = { x: 0.6, y: 0.55 }, mouse = { x: 0.6, y: 0.55 }, vel = { x: 0, y: 0 };
  const tiltNow = { x: 0, y: 0 };
  let lastMove = -1e9, scroll = 0;
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    if (e.clientY < r.top || e.clientY > r.bottom) return;
    target.x = (e.clientX - r.left) / r.width;
    target.y = 1 - (e.clientY - r.top) / r.height;
    lastMove = performance.now();
  };
  const onScroll = () => { scroll = window.scrollY; };
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });

  let raf = 0, last = 0, paused = reduce.matches, visible = true, time = 0;

  // Pastel dye that slowly cycles hue: teal, lilac, peach, sage.
  const dyeColor = () => {
    const h = (time * 0.05) % 1, s = 0.6, v = 0.34;
    const k = (n) => (n + h * 6) % 6;
    const f = (n) => v - v * s * Math.max(0, Math.min(k(n), 4 - k(n), 1));
    return [f(5), f(3), f(1)];
  };
  const stir = () => {
    if (!fluid) return;
    const speed = Math.hypot(vel.x, vel.y);
    if (speed > 0.0004) fluid.splat(mouse.x, mouse.y, vel.x, vel.y, dyeColor());
  };

  const flowStep = (dt, strength) => {
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(flowProg.p);
    gl.bindVertexArray(triVao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, flowB.fb);
    gl.viewport(0, 0, flowB.w, flowB.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, flowA.tex);
    const u = flowProg.u;
    gl.uniform1i(u.tMap, 0);
    gl.uniform2f(u.uMouse, mouse.x, mouse.y);
    gl.uniform2f(u.uVel, vel.x, vel.y);
    gl.uniform1f(u.uAspect, cssW / cssH);
    gl.uniform1f(u.uFalloff, falloff);
    gl.uniform1f(u.uDissipation, dissipation);
    gl.uniform1f(u.uDelta, dt * 60);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uStrength, strength);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    [flowA, flowB] = [flowB, flowA];
  };

  const draw = () => {
    const aspect = cssW / cssH;
    const fovy = (CFG.fov * Math.PI) / 180;
    const visH = 2 * CFG.distance * Math.tan(fovy / 2);
    const unit = visH / 2;
    const model = multiply(rotY(tiltNow.x), rotX(tiltNow.y));
    const mvp = multiply(multiply(perspective(fovy, aspect, 1, 40), translateZ(-CFG.distance)), model);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.clearColor(plaster[0] * 0.95, plaster[1] * 0.95, plaster[2] * 0.95, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(reliefProg.p);
    gl.bindVertexArray(meshVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, flowA.tex);
    const u = reliefProg.u;
    gl.uniform1i(u.tFlow, 0);
    gl.uniformMatrix4fv(u.uMVP, false, mvp);
    gl.uniform1f(u.uUnit, unit);
    gl.uniform1f(u.uDepth, CFG.depth);
    gl.uniform1f(u.uScroll, ((scroll * scrollFactor) / cssH) * 2);
    gl.uniform1f(u.uRest, restDepth);
    gl.uniform1f(u.uBase, CFG.baseExtrude);
    gl.uniform1f(u.uAspect, aspect);
    gl.uniform1i(u.uScene, scene);
    gl.uniform1f(u.uSide, side);
    gl.uniform1f(u.uZoom, zoom);
    gl.uniform2f(u.uCenter, center[0], center[1]);
    gl.uniform2f(u.uRes, W, H);
    gl.uniform1f(u.uTime, time);
    gl.uniform3fv(u.uPlaster, plaster);
    gl.uniform3fv(u.uTint, tint);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fluid ? fluid.dyeTexture() : noDye);
    gl.uniform1i(u.tDye, 1);
    gl.uniform1f(u.uDyeAmount, fluid ? 1 : 0);
    gl.uniform1f(u.uRainbow, rainbow);
    gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_INT, 0);
  };

  const updatePointer = (now) => {
    if (idleSweep && now - lastMove > CFG.idleAfterMs) {
      target.x = 0.55 + 0.33 * Math.sin(time * 0.29);
      target.y = 0.5 + 0.32 * Math.sin(time * 0.43 + 1.3);
    }
    const px = mouse.x, py = mouse.y;
    mouse.x += (target.x - mouse.x) * CFG.mouseEase;
    mouse.y += (target.y - mouse.y) * CFG.mouseEase;
    vel.x = mouse.x - px;
    vel.y = mouse.y - py;
    // The whole wall tilts gently toward the pointer.
    tiltNow.x += ((mouse.x - 0.5) * tilt - tiltNow.x) * 0.05;
    tiltNow.y += ((0.5 - mouse.y) * tilt - tiltNow.y) * 0.05;
  };

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    time += dt;
    updatePointer(now);
    flowStep(dt, 1);
    if (fluid) {
      stir();
      fluid.step(dt);
    }
    draw();
  };

  // A still frame for pause and reduced motion: one gentle raised sweep.
  const still = () => {
    for (let i = 0; i < 48; i++) {
      const t = i / 48;
      const px = mouse.x, py = mouse.y;
      mouse.x = 0.3 + 0.6 * t;
      mouse.y = 0.3 + 0.4 * Math.sin(t * 3.1);
      vel.x = mouse.x - px;
      vel.y = mouse.y - py;
      flowStep(1 / 60, i === 0 ? 0 : 1);
      if (fluid && i > 0) {
        stir();
        fluid.step(1 / 60);
      }
    }
    draw();
  };

  const start = () => {
    if (raf || paused || !visible || document.hidden) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    visible ? start() : stop();
  });
  io.observe(canvas);
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener("visibilitychange", onVis);
  const ro = new ResizeObserver(() => {
    resize();
    if (paused) still();
  });
  ro.observe(canvas);

  resize();
  if (paused) still();
  else start();
  opts.onState?.({ paused, available: true });

  const api = {
    isPaused: () => paused,
    setPaused(next) {
      paused = next;
      if (paused) {
        stop();
        still();
      } else start();
      opts.onState?.({ paused, available: true });
    },
    destroy() {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      reduce.removeEventListener?.("change", onMotionChange);
    },
  };
  const onMotionChange = (e) => api.setPaused(e.matches);
  reduce.addEventListener?.("change", onMotionChange);
  return api;
}
