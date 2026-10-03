/**
 * Canvas2D still of the Duty Field, for no WebGL2, a failIfMajorPerformanceCaveat
 * rejection, software renderers and repeated context loss. One composed frame
 * (t = 37 s, roll 18 deg) from the same camera, twin geometry and network
 * layout as the GL engine: base + glow, the tube-sheet lattice, the twin wire,
 * the face ledger and the agent nodes, then the quiet cores and the top fade.
 * Called again on any data, resize or page change; never animates.
 */
import { createCameraFrame, defaultStage, poseForPage, projectInto, solveCamera, swingYawDeg } from "./camera";
import { CLASS_ALPHA, COLORS, CRESCENT, LATTICE, NETWORK, PAGE_WEIGHTS, RESOLVE, ROLLING_CLASS_MASK, TRANSITIONS, WIRE } from "./constants";
import { fnv1a, layoutNetwork } from "./network";
import { buildTwinGeometry, classAlphaTable, SEG_STRIDE, writeSilhouettes } from "./twinGeometry";
import type { RenderAmbientStill2D } from "./types";

const P = { x: 0, y: 0, depth: 0 };
const Q = { x: 0, y: 0, depth: 0 };

export const renderAmbientStill2D: RenderAmbientStill2D = (canvas, { state, layout, vessel, scrollY }) => {
  const ctx = canvas.getContext("2d");
  if (!ctx || !layout.viewportW) return;
  const s = canvas.width / layout.viewportW;
  const cssH = canvas.height / s;
  const cv = layout.canvas;
  // prefers-contrast: more - lattice and haze only (the CSS halves the root's alpha).
  const hc = state.contrastMore === true;
  const base = state.page === "workspace" && (state.workspaceModule === "ShopTank" || state.workspaceModule === "SiteTank") ? PAGE_WEIGHTS.tankWorkspace : PAGE_WEIGHTS[state.page];
  const w = hc ? { ...base, twin: 0, network: 0 } : base;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLORS.base;
  ctx.fillRect(0, 0, layout.viewportW, cssH);

  // Glow pool around the stage (the haze, baked).
  const stage = layout.stage && layout.stage.w > 0 ? layout.stage : defaultStage(cv.w, cv.h);
  const gx = cv.x + stage.x + stage.w / 2;
  const gy = stage.y + stage.h / 2;
  const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, stage.w * 0.62);
  g.addColorStop(0, COLORS.hazeHigh);
  g.addColorStop(1, "rgba(11,26,51,0)");
  ctx.globalAlpha = 0.8 * w.haze;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, layout.viewportW, cssH);

  // Lattice (origin = the root's top-left, like the poster and the GL pass).
  const narrow = layout.viewportW <= LATTICE.narrowMaxW;
  const pitch = narrow ? LATTICE.pitchNarrow : LATTICE.pitch;
  const step = narrow ? LATTICE.rowStepNarrow : LATTICE.rowStep;
  const r = narrow ? LATTICE.mouthRNarrow : LATTICE.mouthR;
  ctx.globalAlpha = CRESCENT.rimAlpha.margin * w.lattice;
  ctx.strokeStyle = COLORS.latticeRim;
  ctx.lineWidth = 1 / s;
  ctx.beginPath();
  for (let row = 0; row * step < cssH + r; row++) {
    if (row % LATTICE.laneEvery === LATTICE.laneRow) continue;
    for (let x = row % 2 ? pitch / 2 : 0; x < layout.viewportW + r; x += pitch) {
      ctx.moveTo(x + r, row * step);
      ctx.arc(x, row * step, r, 0, Math.PI * 2);
    }
  }
  ctx.stroke();

  // Twin wire, in the seeded still pose.
  const pose = poseForPage(state.page, state.workspaceModule, layout);
  const roll = (TRANSITIONS.stillRollDeg * Math.PI) / 180;
  const frame = solveCamera({ pose, canvasW: cv.w, canvasH: cv.h, stage, column: layout.column, model: vessel, yawOffsetDeg: swingYawDeg(TRANSITIONS.stillTime), pitchOffsetDeg: 0, rollDeg: 0 }, createCameraFrame());
  const geo = buildTwinGeometry(vessel, { shellRadiusPx: frame.shellRadiusPx, maxSegments: 900 }, pose);
  writeSilhouettes(frame.eye, vessel, geo.segments, geo.silhouetteStart);
  const alpha = classAlphaTable(pose);
  const proj = (x: number, y: number, z: number, rolls: boolean, out: typeof P) => {
    const c = Math.cos(roll);
    const sn = Math.sin(roll);
    return rolls ? projectInto(frame, x, c * y - sn * z, sn * y + c * z, cv.w, cv.h, out) : projectInto(frame, x, y, z, cv.w, cv.h, out);
  };
  ctx.save();
  ctx.translate(cv.x, 0);
  ctx.strokeStyle = COLORS.wire;
  const seg = geo.segments;
  for (let i = 0; i < geo.segmentCount; i++) {
    const o = i * SEG_STRIDE;
    const cls = seg[o + 7];
    const a = cls === 0 ? WIRE.meridian.far : (alpha[cls] ?? CLASS_ALPHA[cls] ?? 0);
    const rolls = ((ROLLING_CLASS_MASK >> cls) & 1) === 1;
    if (a <= 0 || !proj(seg[o], seg[o + 1], seg[o + 2], rolls, P) || !proj(seg[o + 3], seg[o + 4], seg[o + 5], rolls, Q)) continue;
    ctx.globalAlpha = a * w.twin;
    ctx.beginPath();
    ctx.moveTo(P.x, P.y);
    ctx.lineTo(Q.x, Q.y);
    ctx.stroke();
  }

  // Face ledger: completed mouths emerald, recent failures rose (same hash + probing as the GL pass).
  const n = geo.faceMouthCount;
  const taken = new Uint8Array(n);
  const mouthR = Math.max(1.2, frame.shellRadiusPx * 0.06);
  for (const e of state.signals.ledger) {
    if (!n || hc) break;
    let k = fnv1a(e.key) % n;
    for (let p = 0; p < n && taken[k]; p++) k = (k + 1) % n;
    if (taken[k]) break;
    taken[k] = 1;
    if (!proj(geo.faceMouths[k * 3], geo.faceMouths[k * 3 + 1], geo.faceMouths[k * 3 + 2], true, P)) continue;
    const done = e.status === "completed";
    ctx.globalAlpha = done ? Math.max(WIRE.ledger.doneFloor, WIRE.ledger.doneAlpha * Math.exp(-e.ageHours / WIRE.ledger.doneTauHours)) : WIRE.ledger.failAlpha;
    ctx.fillStyle = done ? COLORS.ledgerDone : COLORS.ledgerFail;
    ctx.beginPath();
    ctx.arc(P.x, P.y, mouthR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Agent network: links and nodes.
  const hub = (x: number) => (proj(x, 0, 0, false, P) ? { x: P.x, y: P.y } : { x: cv.w, y: 0 });
  const net = layoutNetwork({
    agents: state.signals.agents,
    canvasW: cv.w,
    canvasH: cv.h,
    narrow: layout.narrow,
    quiet: layout.quiet.map((q) => ({ x: q.x - cv.x, y: q.y - cv.y, w: q.w, h: q.h })),
    twinBox: frame.twinBox,
    column: layout.column,
    stage: layout.stage,
    hubFront: hub(geo.boltFront.center[0]),
    hubRear: hub(geo.boltRear.center[0]),
    latticeOrigin: { x: -cv.x, y: 0 },
  });
  ctx.lineWidth = 1;
  for (const link of net.links) {
    const node = net.nodes[link.node];
    ctx.globalAlpha = (node?.online ? NETWORK.linkAlpha : NETWORK.offline.linkAlpha) * w.network;
    ctx.strokeStyle = node?.online ? COLORS.linkOnline : COLORS.linkOffline;
    ctx.beginPath();
    for (let i = 0; i < link.points.length; i += 2) ctx.lineTo(link.points[i], link.points[i + 1]);
    ctx.stroke();
  }
  for (const node of net.nodes) {
    ctx.globalAlpha = (node.online ? NETWORK.node.ringAlpha : NETWORK.offline.ringAlpha) * w.network;
    ctx.strokeStyle = node.online ? COLORS.nodeRing : COLORS.nodeOffline;
    ctx.beginPath();
    ctx.arc(node.x, node.y, NETWORK.node.ringR, 0, Math.PI * 2);
    ctx.stroke();
    if (!node.online) continue;
    ctx.globalAlpha = NETWORK.node.coreAlpha * w.network;
    ctx.fillStyle = COLORS.nodeCore;
    ctx.beginPath();
    ctx.arc(node.x, node.y, NETWORK.node.coreR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Quiet cores (feathered with a shadow) and the 24 px top fade, both to exact base - the
  // GL resolve masks motifs there, it never paints a darker panel.
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLORS.base;
  ctx.shadowColor = COLORS.base;
  ctx.shadowBlur = (hc ? RESOLVE.quietFeatherHighContrastPx : RESOLVE.quietFeatherPx) * s;
  for (const q of layout.quiet.slice(0, RESOLVE.maxQuietRects)) {
    ctx.beginPath();
    ctx.roundRect(q.x, q.y - cv.y - scrollY, q.w, q.h, RESOLVE.quietRadius);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  const top = ctx.createLinearGradient(0, 0, 0, RESOLVE.topFadePx);
  top.addColorStop(0, COLORS.base);
  top.addColorStop(1, "rgba(5,7,13,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, layout.viewportW, RESOLVE.topFadePx);
};

export default renderAmbientStill2D;
