import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { headCurve, headRadiusAtApexDistance, type GaNozzle, type GaSaddle, type GaSpec } from "./gaSpec";

/**
 * Procedural geometry for the General Arrangement 3D view, in millimetres, in the
 * spec's frame (x along the shell axis from the left tube-sheet face, y up, z to the viewer).
 * No WebGL context is needed to build any of this, so it is unit-testable.
 */

const TAU = Math.PI * 2;

/** Non-indexed, position + normal only - the common denominator for merging mixed primitives. */
function flat(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", ng.getAttribute("position"));
  out.setAttribute("normal", ng.getAttribute("normal"));
  return out;
}

export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (parts.length === 0) return new THREE.BufferGeometry();
  const merged = mergeGeometries(parts.map(flat), false) ?? new THREE.BufferGeometry();
  parts.forEach((p) => p.dispose());
  return merged;
}

/** Cylinder along +x centred on the origin. Angle 0 = +z, pi/2 = -y (bottom), pi = -z, 3pi/2 = +y (top). */
export function cylX(r: number, len: number, open = false, segments = 48, thetaStart = 0, thetaLength = TAU): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, segments, 1, open, thetaStart, thetaLength);
  g.rotateZ(-Math.PI / 2);
  return g;
}

/** Surface of revolution about the x axis from [x, r] points. */
export function revolveX(points: Array<[number, number]>, segments = 64): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(points.map(([x, r]) => new THREE.Vector2(Math.max(0, r), x)), segments);
  g.rotateZ(-Math.PI / 2);
  return g;
}

/** Plate in the y-z plane, extruded along +x from x0 by `depth`. The shape is drawn in (u, v) = (-z, y). */
function extrudeAlongX(shape: THREE.Shape, depth: number, x0: number, curveSegments = 24): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments });
  g.rotateY(Math.PI / 2);
  g.translate(x0, 0, 0);
  return g;
}

function discShape(rOuter: number, rInner: number, holes?: { pcd: number; count: number; dia: number }): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(0, 0, rOuter, 0, TAU, false);
  if (rInner > 0) {
    const p = new THREE.Path();
    p.absarc(0, 0, rInner, 0, TAU, true);
    s.holes.push(p);
  }
  if (holes) {
    for (let i = 0; i < holes.count; i++) {
      const a = ((i + 0.5) * TAU) / holes.count;
      const h = new THREE.Path();
      h.absarc((holes.pcd / 2) * Math.cos(a), (holes.pcd / 2) * Math.sin(a), holes.dia / 2, 0, TAU, true);
      s.holes.push(h);
    }
  }
  return s;
}

/** Flat ring / disc whose axis is x, occupying [x0, x0 + thk]. */
export function ringX(x0: number, thk: number, rOuter: number, rInner: number, holes?: { pcd: number; count: number; dia: number }): THREE.BufferGeometry {
  return extrudeAlongX(discShape(rOuter, rInner, holes), thk, x0, 20);
}

/** Open band of a cylinder (axis x) between two angles in the (u, v) plane, e.g. a saddle wrap plate. */
function bandX(rInner: number, rOuter: number, centerAngle: number, halfAngle: number, x0: number, len: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.absarc(0, 0, rOuter, centerAngle - halfAngle, centerAngle + halfAngle, false);
  s.absarc(0, 0, rInner, centerAngle + halfAngle, centerAngle - halfAngle, true);
  s.closePath();
  return extrudeAlongX(s, len, x0, 28);
}

// ---- shell, channels, heads, flanges ---------------------------------------------------------------

/** The main shell between the tube sheets (open cylinder, outer surface). */
export function mainShellGeometry(spec: GaSpec): THREE.BufferGeometry {
  const x0 = spec.tubeSheetThk - 8;
  const x1 = spec.layout.L - spec.tubeSheetThk + 5;
  const g = cylX(spec.ro, x1 - x0, true, 72);
  g.translate((x0 + x1) / 2, 0, 0);
  return g;
}

/** Channel / bonnet cylinder + straight face + torispherical head as one surface of revolution. */
export function headShellGeometry(spec: GaSpec, end: "front" | "rear"): THREE.BufferGeometry {
  const { layout: l, ro, flangeFaceOffset: off } = spec;
  const dir = end === "front" ? -1 : 1;
  const xs = end === "front" ? l.xsFront : l.xsRear;
  const xStart = end === "front" ? -off : l.L + off;
  const pts: Array<[number, number]> = [[xStart, ro], [xs, ro]];
  for (const [s, r] of headCurve(spec.headOuter, 14, 40)) pts.push([xs + dir * s, r]);
  pts[pts.length - 1][1] = 0;
  return revolveX(pts, 72);
}

/** Inner surface of the same (visible from inside in the cutaway). */
export function headInnerGeometry(spec: GaSpec, end: "front" | "rear"): THREE.BufferGeometry {
  const { layout: l, ri, flangeFaceOffset: off } = spec;
  const dir = end === "front" ? -1 : 1;
  const xs = end === "front" ? l.xsFront : l.xsRear;
  const xStart = end === "front" ? -off : l.L + off;
  const pts: Array<[number, number]> = [[xStart, ri], [xs, ri]];
  for (const [s, r] of headCurve(spec.headInner, 14, 40)) pts.push([xs + dir * s, r]);
  pts[pts.length - 1][1] = 0;
  return revolveX(pts, 72);
}

export interface FlangeStackGeometry {
  /** Channel body flange + tube sheet + gasket, per end. */
  flange: THREE.BufferGeometry;
  tubeSheet: THREE.BufferGeometry;
  gasket: THREE.BufferGeometry;
}

export function flangeStackGeometry(spec: GaSpec, end: "front" | "rear"): FlangeStackGeometry {
  const { layout: l, flangeOD, flangeThk, tubeSheetThk, boltPCD, boltCount, boltHoleDia, ri, flangeFaceOffset: off, gasketGap, gasketRingWidth } = spec;
  const holes = { pcd: boltPCD, count: boltCount, dia: boltHoleDia };
  const ro = flangeOD / 2;
  if (end === "front") {
    return {
      flange: ringX(-(off + flangeThk), flangeThk, ro, ri, holes),
      tubeSheet: ringX(0, tubeSheetThk, ro, 0, holes),
      gasket: ringX(-gasketGap, gasketGap, ri + gasketRingWidth, ri),
    };
  }
  return {
    flange: ringX(l.L + off, flangeThk, ro, ri, holes),
    tubeSheet: ringX(l.L - tubeSheetThk, tubeSheetThk, ro, 0, holes),
    gasket: ringX(l.L, gasketGap, ri + gasketRingWidth, ri),
  };
}

export interface BoltInstances {
  /** Studs: centre positions (all share one length). */
  studs: Array<[number, number, number]>;
  studLength: number;
  studRadius: number;
  /** Nut centres. */
  nuts: Array<[number, number, number]>;
  nutRadius: number;
  nutThk: number;
}

/** Stud + nut positions for both body flanges (instanced in the viewport). */
export function boltInstances(spec: GaSpec): BoltInstances {
  const { layout: l, flangeThk, tubeSheetThk, flangeFaceOffset: off, boltCount, boltPCD, boltHoleDia } = spec;
  const nutThk = boltHoleDia * 0.8;
  const protrude = nutThk + 6;
  const studLength = off + flangeThk + tubeSheetThk + 2 * protrude;
  const studs: Array<[number, number, number]> = [];
  const nuts: Array<[number, number, number]> = [];
  const ends = [
    { x0: -(off + flangeThk) - protrude, x1: tubeSheetThk + protrude },
    { x0: l.L - tubeSheetThk - protrude, x1: l.L + off + flangeThk + protrude },
  ];
  for (const { x0, x1 } of ends) {
    for (let i = 0; i < boltCount; i++) {
      const a = ((i + 0.5) * TAU) / boltCount;
      const y = (boltPCD / 2) * Math.cos(a);
      const z = (boltPCD / 2) * Math.sin(a);
      studs.push([(x0 + x1) / 2, y, z]);
      nuts.push([x0 + nutThk / 2 + 3, y, z], [x1 - nutThk / 2 - 3, y, z]);
    }
  }
  return { studs, studLength, studRadius: boltHoleDia / 2 - 1.2, nuts, nutRadius: boltHoleDia * 0.95, nutThk };
}

// ---- internals ---------------------------------------------------------------------------------------

/** One tube, 8-sided, along x (tubes protrude 2 mm past each tube-sheet face); instanced per tube. */
export function tubeGeometry(spec: GaSpec): THREE.BufferGeometry {
  const g = cylX(spec.tubeOD / 2, spec.layout.L + 4, true, 8);
  g.translate(spec.layout.L / 2, 0, 0);
  return g;
}

/** Segmental baffle: a disc cut by a chord; `retainTop` keeps the upper part (cut at the bottom), otherwise the lower part. */
export function baffleGeometry(spec: GaSpec, retainTop: boolean): THREE.BufferGeometry {
  const rb = spec.ri - 3;
  const cutY = spec.ri - spec.baffleHeight;
  const theta = Math.asin(Math.max(-0.99, Math.min(0.99, cutY / rb)));
  const s = new THREE.Shape();
  s.moveTo(rb * Math.cos(theta), rb * Math.sin(theta));
  s.absarc(0, 0, rb, theta, Math.PI - theta, false);
  s.closePath();
  const g = extrudeAlongX(s, spec.baffleThk, -spec.baffleThk / 2, 40);
  if (!retainTop) g.scale(1, -1, 1);
  return g;
}

export function tieRodGeometry(spec: GaSpec, layout: Array<[number, number]>): THREE.BufferGeometry {
  const last = spec.baffleX.length > 0 ? spec.baffleX[spec.baffleX.length - 1] : spec.layout.L - 100;
  const x0 = 27;
  const x1 = last + 5;
  const parts: THREE.BufferGeometry[] = [];
  for (const [y, z] of layout) {
    const rod = cylX(spec.tieRodDia / 2, x1 - x0, false, 10);
    rod.translate((x0 + x1) / 2, y, z);
    parts.push(rod);
    const nut = cylX(spec.tieRodDia * 0.9, spec.tieRodDia * 0.8, false, 6);
    nut.translate(x1 + spec.tieRodDia * 0.4, y, z);
    parts.push(nut);
  }
  return mergeParts(parts);
}

/** Pass-partition plates in both channels (horizontal, on the shell axis). */
export function partitionPlateGeometry(spec: GaSpec): THREE.BufferGeometry {
  const { layout: l, ri, partitionPlateThk: t } = spec;
  const w = 2 * ri * 0.99;
  const front = new THREE.BoxGeometry(-6 - l.xsFront, t, w);
  front.translate((-6 + l.xsFront) / 2, 0, 0);
  const rear = new THREE.BoxGeometry(l.xsRear - (l.L + 6), t, w);
  rear.translate((l.xsRear + l.L + 6) / 2, 0, 0);
  return mergeParts([front, rear]);
}

// ---- saddles -----------------------------------------------------------------------------------------

/**
 * One saddle in local coordinates: x relative to the saddle centre line for the gusset side +x
 * (mirror with scale -1 for the rear saddle), y relative to the shell axis. Wrap plate, saddle (web)
 * plate, two ribs, gussets and the base plate with its anchor-bolt holes.
 */
export function saddleGeometry(spec: GaSpec, s: GaSaddle): THREE.BufferGeometry {
  const Rw = spec.ro + s.wrapThk;
  const b = s.baseElevWidth / 2;
  const baseTop = -(s.baseDepth - s.baseThk);
  const hw = s.webWidth / 2;
  const top = (z: number) => -Math.sqrt(Math.max(0, Rw * Rw - z * z));
  const parts: THREE.BufferGeometry[] = [];

  // wrap plate on the shell (bottom, centred at 270 deg of the shape plane)
  const wrapHalf = Math.asin(Math.min(0.99, (hw + 14.5) / Rw));
  parts.push(bandX(spec.ro + 0.6, Rw, (3 * Math.PI) / 2, wrapHalf, -(b + 12), 2 * b + 50));

  // saddle (web) plate: top follows the wrap plate, runs down to the base plate
  const web = new THREE.Shape();
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const u = -hw + (2 * hw * i) / steps;
    if (i === 0) web.moveTo(u, top(u));
    else web.lineTo(u, top(u));
  }
  web.lineTo(hw, baseTop);
  web.lineTo(-hw, baseTop);
  web.closePath();
  parts.push(extrudeAlongX(web, 12, -(b - 10), 4));

  // ribs: outer pair of vertical plates along the axis
  const rib = s.ribOuterSpacing / 2;
  for (const sg of [-1, 1]) {
    const zc = sg * (rib + s.ribThk / 2);
    const h = Math.abs(top(zc) - baseTop);
    const box = new THREE.BoxGeometry(2 * b - 4, h, s.ribThk);
    box.translate(0, (top(zc) + baseTop) / 2, zc);
    parts.push(box);
  }

  // gussets on the +x side: centre and over each rib
  for (const zc of [0, -(rib + s.ribThk / 2), rib + s.ribThk / 2]) {
    const yTop = top(zc);
    const tri = new THREE.Shape();
    tri.moveTo(b - 2, baseTop);
    tri.lineTo(b + 38, yTop);
    tri.lineTo(b - 2, yTop);
    tri.closePath();
    const g = new THREE.ExtrudeGeometry(tri, { depth: s.ribThk, bevelEnabled: false });
    g.translate(0, 0, zc - s.ribThk / 2);
    parts.push(g);
  }

  // base plate with anchor-bolt holes
  const bw = s.baseWidth / 2;
  const base = new THREE.Shape();
  base.moveTo(-b, -bw);
  base.lineTo(b, -bw);
  base.lineTo(b, bw);
  base.lineTo(-b, bw);
  base.closePath();
  for (const sg of [-1, 1]) {
    const hole = new THREE.Path();
    hole.absarc(0, (sg * s.anchorCC) / 2, s.anchorHoleDia / 2, 0, TAU, true);
    base.holes.push(hole);
  }
  const bg = new THREE.ExtrudeGeometry(base, { depth: s.baseThk, bevelEnabled: false, curveSegments: 12 });
  bg.rotateX(-Math.PI / 2); // extrusion -> +y, shape y -> -z
  bg.translate(0, -s.baseDepth, 0);
  parts.push(bg);

  return mergeParts(parts);
}

// ---- trunnions, lugs, name plate ---------------------------------------------------------------------

/** One trunnion (100 NB neck + blind flange + shell pad) pointing to +z (side = 1) or -z (side = -1), at x = 0. */
export function trunnionGeometry(spec: GaSpec, side: 1 | -1): THREE.BufferGeometry {
  const t = spec.trunnion;
  const neckStart = Math.sqrt(Math.max(0, spec.ro * spec.ro - t.neckR * t.neckR)) - 4;
  const neckEnd = t.faceR - t.flangeThk;
  const parts: THREE.BufferGeometry[] = [];

  const neck = new THREE.CylinderGeometry(t.neckR, t.neckR, neckEnd - neckStart, 24, 1, true);
  neck.translate(0, (neckStart + neckEnd) / 2, 0);
  parts.push(neck);

  const flange = new THREE.CylinderGeometry(t.flangeR, t.flangeR, t.flangeThk, 40);
  flange.translate(0, neckEnd + t.flangeThk / 2, 0);
  parts.push(flange);

  const boss = new THREE.CylinderGeometry(t.flangeR * 0.62, t.flangeR * 0.62, 3, 32);
  boss.translate(0, t.faceR + 1.5, 0);
  parts.push(boss);

  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) * TAU) / 8;
    const bolt = new THREE.CylinderGeometry(7, 7, 8, 6);
    bolt.translate(Math.cos(a) * t.flangeR * 0.82, t.faceR + 4, Math.sin(a) * t.flangeR * 0.82);
    parts.push(bolt);
  }

  // local +y -> world +/-z
  const body = mergeParts(parts);
  body.rotateX(side * (Math.PI / 2));
  const half = (t.padHalfAngleDeg * Math.PI) / 180;
  // The shape plane has +z at angle pi, -z at angle 0.
  const pad = bandX(spec.ro + 0.6, spec.ro + 5, side === 1 ? Math.PI : 0, half, -100, 200);
  return mergeParts([body, pad]);
}

/** Lifting-lug plate standing on the dome, in the x-y plane (local origin: the dome surface point). */
export function lugGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-55, -45);
  s.lineTo(55, -45);
  s.lineTo(55, 100);
  s.absarc(0, 100, 55, 0, Math.PI, false);
  s.lineTo(-55, -45);
  const hole = new THREE.Path();
  hole.absarc(0, 100, 22, 0, TAU, true);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: 16, bevelEnabled: false, curveSegments: 20 });
  g.translate(0, 0, -8);
  return g;
}

/** Where the lifting lugs stand: 100 mm from the apex on the dome, one at the front, two at the rear. */
export function lugPlacements(spec: GaSpec): Array<{ x: number; y: number; z: number }> {
  const sFromApex = 100;
  const r = headRadiusAtApexDistance(spec.headOuter, sFromApex);
  const out: Array<{ x: number; y: number; z: number }> = [];
  const front = spec.layout.apexFrontOuter + sFromApex;
  const rear = spec.layout.apexRearOuter - sFromApex;
  const zs = (n: number) => (n <= 1 ? [0] : Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * 110));
  for (const z of zs(spec.lugsFront)) out.push({ x: front, y: r, z });
  for (const z of zs(spec.lugsRear)) out.push({ x: rear, y: r, z });
  return out;
}

/** Name plate on the rear head: bracket (painted) + plate (brass). */
export function namePlateGeometry(spec: GaSpec): { bracket: THREE.BufferGeometry; plate: THREE.BufferGeometry } {
  const x0 = spec.layout.apexRearOuter - 6;
  const bracket = new THREE.BoxGeometry(55, 60, 60);
  bracket.translate(x0 + 27.5, 0, 0);
  const plate = new THREE.BoxGeometry(3, 217, 150);
  plate.translate(x0 + 55 + 1.5, 0, 0);
  return { bracket, plate };
}

// ---- nozzles -----------------------------------------------------------------------------------------

export interface NozzleParts {
  /** Stainless: neck, raised face, spool, coupling. */
  steel: THREE.BufferGeometry;
  /** Painted loose flanges. */
  paint: THREE.BufferGeometry | null;
  /** Studs and nuts of the counter-flange joint. */
  bolts: THREE.BufferGeometry | null;
}

function lathe(points: Array<[number, number]>, segments: number): THREE.BufferGeometry {
  return new THREE.LatheGeometry(points.map(([r, h]) => new THREE.Vector2(Math.max(0, r), h)), segments);
}

/** A flange plate with bolt holes, axis +y, occupying h in [h0, h0 + thk]. */
function flangePlate(h0: number, thk: number, rOuter: number, rBore: number, pcd: number, count: number, holeDia: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(discShape(rOuter, rBore, { pcd, count, dia: holeDia }), { depth: thk, bevelEnabled: false, curveSegments: 16 });
  g.rotateX(-Math.PI / 2); // extrusion z -> +y
  g.translate(0, h0, 0);
  return g;
}

/**
 * One nozzle in its own frame: axis +y, origin on the shell axis. The viewport rotates it to the
 * nozzle's side and moves it to its x. Mirrors GadNozzleLibrary.DrawFlanged / DrawCounterFlange:
 * flanged neck with raised face and bolted loose flange, counter flange + capped 150 mm spool for
 * >= 450 NB, screwed coupling with plug for <= 25 NB.
 */
export function nozzleParts(n: GaNozzle, shellRo: number): NozzleParts {
  const f = n.flange;
  const rp = f.pipeOD / 2;
  const rb = Math.max(1, rp - f.wall);
  const segs = rp > 60 ? 48 : 28;
  const r0 = Math.sqrt(Math.max(0, shellRo * shellRo - rp * rp)) - 8;

  if (n.kind === "coupling") {
    const parts: THREE.BufferGeometry[] = [];
    const neckTop = shellRo + 22;
    const neck = new THREE.CylinderGeometry(rp * 1.05, rp * 1.05, neckTop - r0, 20);
    neck.translate(0, (r0 + neckTop) / 2, 0);
    parts.push(neck);
    const bodyH0 = shellRo + 20;
    const bodyH1 = shellRo + 46;
    const body = new THREE.CylinderGeometry(rp * 1.6, rp * 1.6, bodyH1 - bodyH0, 6);
    body.translate(0, (bodyH0 + bodyH1) / 2, 0);
    parts.push(body);
    const plug = new THREE.CylinderGeometry(rp * 1.15, rp * 1.15, n.reachR - bodyH1, 6);
    plug.translate(0, (bodyH1 + n.reachR) / 2, 0);
    parts.push(plug);
    return { steel: mergeParts(parts), paint: null, bolts: null };
  }

  const faceR = n.faceR;
  const ro = f.flangeOD / 2;
  const rf = f.raisedFaceOD / 2;
  const rFront = faceR - f.raisedFaceH;
  const rBack = rFront - f.thk;
  const steelParts: THREE.BufferGeometry[] = [
    lathe(
      [
        [rb, r0],
        [rp, r0],
        [rp, rFront - 1],
        [rf, rFront - 1],
        [rf, faceR],
        [rb, faceR],
        [rb, r0],
      ],
      segs,
    ),
  ];
  const paintParts: THREE.BufferGeometry[] = [flangePlate(rBack, f.thk, ro, rp, f.pcd, f.holeCount, f.holeDia)];
  let bolts: THREE.BufferGeometry | null = null;

  if (n.counterFlange) {
    const mFace = faceR + 3;
    const mFront = mFace + f.raisedFaceH;
    const mBack = mFront + f.thk;
    const cap = mFace + 150;
    steelParts.push(
      lathe(
        [
          [0, cap],
          [rp, cap],
          [rp, mFront - 1],
          [rf, mFront - 1],
          [rf, mFace],
          [0, mFace],
        ],
        segs,
      ),
    );
    paintParts.push(flangePlate(mFront, f.thk, ro, rp, f.pcd, f.holeCount, f.holeDia));
    // bolted joint: studs through both flanges with a nut at each end
    const b: THREE.BufferGeometry[] = [];
    const h0 = rBack - 8;
    const h1 = mBack + 8;
    const studR = Math.max(3, f.holeDia / 2 - 1.5);
    const nutH = f.holeDia * 0.8;
    for (let i = 0; i < f.holeCount; i++) {
      const a = ((i + 0.5) * TAU) / f.holeCount;
      const x = (f.pcd / 2) * Math.cos(a);
      const z = (f.pcd / 2) * Math.sin(a);
      const stud = new THREE.CylinderGeometry(studR, studR, h1 - h0, 8);
      stud.translate(x, (h0 + h1) / 2, z);
      b.push(stud);
      for (const hn of [h0 + nutH / 2, h1 - nutH / 2]) {
        const nut = new THREE.CylinderGeometry(f.holeDia * 0.95, f.holeDia * 0.95, nutH, 6);
        nut.translate(x, hn, z);
        b.push(nut);
      }
    }
    bolts = mergeParts(b);
  }

  return { steel: mergeParts(steelParts), paint: mergeParts(paintParts), bolts };
}
