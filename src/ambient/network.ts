/**
 * Agent network layout: workstation nodes snapped to tube-field mouths in the
 * free margins, linked to the twin's bolt circles along lattice rows and
 * columns (Manhattan routes).
 *
 * Slot order (spec layer 4): stage strip (<= 3, rear hub), right gutter
 * (front hub), left gutter (>= 160 px, routed along the bottom row), then a
 * bottom-row fallback. Slots are pre-filtered so every pair is >= 72 px
 * apart and clear of quiet cores (+ feather + 36 px) and the twin box; an
 * agent's slot is FNV-1a(agentId) with linear probing, so a workstation keeps
 * its spot across sessions for the same layout.
 *
 * Each link's points[0] is the lattice mouth where the dynamic tether from
 * the hub's nearest bolt attaches (the engine draws that tether, since the
 * bolts move with the twin swing). Pure TypeScript.
 */
import { LATTICE, NETWORK, RESOLVE } from "./constants";
import type { AgentNodeInput, Point, Rect } from "./types";

export interface NetworkInput {
  agents: AgentNodeInput[];
  canvasW: number;
  canvasH: number;
  narrow: boolean;
  /** All canvas px; quiet already scroll-adjusted to scroll 0 (and inflated). */
  quiet: Rect[];
  twinBox: Rect;
  column: Rect | null;
  stage: Rect | null;
  /** canvas px */
  hubFront: Point;
  hubRear: Point;
  /**
   * Lattice origin in canvas px (default 0,0). The tube field is anchored at the
   * ambient root (viewport x = 0), so pass { x: -canvas.x, y: 0 } when the canvas
   * rect starts at the sidebar edge; slots then never move when it collapses.
   */
  latticeOrigin?: Point;
}

export interface NetworkNode {
  id: string;
  x: number;
  y: number;
  online: boolean;
  isLocal: boolean;
  /** 0 = single agent, n = "n more" cluster node (double ring). */
  cluster: number;
  hub: "front" | "rear";
}

export interface NetworkLayout {
  nodes: NetworkNode[];
  /** points: x,y pairs in canvas px, hub-side first; Manhattan along lattice rows/cols. */
  links: Array<{ node: number; points: Float32Array }>;
  /** Dashed placeholder when no agents are paired. */
  ghost: Point | null;
}

/** 32-bit FNV-1a of a string (UTF-16 code units). */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------- lattice

export interface Lattice {
  pitch: number;
  rowStep: number;
  ox: number;
  oy: number;
}

export function latticeFor(narrow: boolean, origin?: Point): Lattice {
  return {
    pitch: narrow ? LATTICE.pitchNarrow : LATTICE.pitch,
    rowStep: narrow ? LATTICE.rowStepNarrow : LATTICE.rowStep,
    ox: origin?.x ?? 0,
    oy: origin?.y ?? 0,
  };
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Every 10th row is an empty pass-partition lane. */
export const isLaneRow = (row: number) => mod(row, LATTICE.laneEvery) === LATTICE.laneRow;

export const rowY = (l: Lattice, row: number) => l.oy + row * l.rowStep;

/** x of mouth `col` on `row` (odd rows are offset by half a pitch). */
export const mouthX = (l: Lattice, row: number, col: number) => l.ox + col * l.pitch + (mod(row, 2) === 1 ? l.pitch / 2 : 0);

/** Nearest non-lane row to y. */
function nearestRow(l: Lattice, y: number): number {
  const r = Math.round((y - l.oy) / l.rowStep);
  if (!isLaneRow(r)) return r;
  return Math.abs(rowY(l, r - 1) - y) <= Math.abs(rowY(l, r + 1) - y) ? r - 1 : r + 1;
}

/** Nearest mouth on a row to x. */
function nearestCol(l: Lattice, row: number, x: number): number {
  return Math.round((x - l.ox - (mod(row, 2) === 1 ? l.pitch / 2 : 0)) / l.pitch);
}

/** x of the even-row column nearest x (vertical runs follow these; odd-row rims clear them by 3.4 px). */
const evenColumnX = (l: Lattice, x: number) => l.ox + Math.round((x - l.ox) / l.pitch) * l.pitch;

// ---------------------------------------------------------------- blocking

interface Blocker {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function inflate(r: Rect, m: number): Blocker {
  return { x0: r.x - m, y0: r.y - m, x1: r.x + r.w + m, y1: r.y + r.h + m };
}

const inside = (b: Blocker, x: number, y: number) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;

/** Axis-aligned segment vs box. */
function segmentHits(b: Blocker, ax: number, ay: number, bx: number, by: number): boolean {
  const x0 = Math.min(ax, bx);
  const x1 = Math.max(ax, bx);
  const y0 = Math.min(ay, by);
  const y1 = Math.max(ay, by);
  return x1 >= b.x0 && x0 <= b.x1 && y1 >= b.y0 && y0 <= b.y1;
}

// ---------------------------------------------------------------- layout

type Zone = "strip" | "right" | "left" | "bottom" | "narrowBottom" | "narrowRight";

interface Slot {
  x: number;
  y: number;
  row: number;
  zone: Zone;
}

interface Ctx {
  input: NetworkInput;
  l: Lattice;
  /** Node blockers: quiet + feather + 36 px, twin box + clearance. */
  nodeBlock: Blocker[];
  /** Link blockers: the same quiet zones and the twin box. */
  linkBlock: Blocker[];
  rightColX: number | null;
  leftColX: number | null;
  bottomRow: number;
}

function slotFree(ctx: Ctx, slots: Slot[], x: number, y: number): boolean {
  const { canvasW: W, canvasH: H } = ctx.input;
  const pad = NETWORK.node.localR + 2;
  if (x < pad || x > W - pad || y < pad || y > H - pad) return false;
  if (ctx.nodeBlock.some((b) => inside(b, x, y))) return false;
  return slots.every((s) => Math.hypot(s.x - x, s.y - y) >= NETWORK.minSpacingPx);
}

function columnInGutter(l: Lattice, gx0: number, gx1: number): number | null {
  if (gx1 - gx0 < 0) return null;
  let x = evenColumnX(l, (gx0 + gx1) / 2);
  if (x < gx0) x += l.pitch;
  if (x > gx1) x -= l.pitch;
  return x >= gx0 && x <= gx1 ? x : null;
}

function addColumnSlots(ctx: Ctx, slots: Slot[], colX: number, gx0: number, gx1: number, v0: number, v1: number, zone: Zone, max = Infinity) {
  const { l } = ctx;
  const H = ctx.input.canvasH;
  const r0 = Math.ceil((v0 * H - l.oy) / l.rowStep);
  const r1 = Math.floor((v1 * H - l.oy) / l.rowStep);
  let added = 0;
  for (let r = r0; r <= r1 && added < max; r++) {
    if (isLaneRow(r)) continue;
    const y = rowY(l, r);
    // Even rows sit on the column; odd rows take the half-pitch neighbour that stays in the gutter.
    let x = colX;
    if (mod(r, 2) === 1) {
      const a = colX + l.pitch / 2;
      const b = colX - l.pitch / 2;
      const centre = (gx0 + gx1) / 2;
      const okA = a >= gx0 && a <= gx1;
      const okB = b >= gx0 && b <= gx1;
      if (!okA && !okB) continue;
      x = okA && (!okB || Math.abs(a - centre) <= Math.abs(b - centre)) ? a : b;
    }
    if (!slotFree(ctx, slots, x, y)) continue;
    slots.push({ x, y, row: r, zone });
    added++;
  }
}

function buildSlots(ctx: Ctx): Slot[] {
  const { input, l } = ctx;
  const W = input.canvasW;
  const H = input.canvasH;
  const slots: Slot[] = [];
  const col = input.column;

  if (input.narrow) {
    // Porthole: bottom edge (v 0.93..0.97) and a right-edge column below v 0.5.
    const rows: number[] = [];
    for (let r = Math.ceil((NETWORK.narrowBottomV[0] * H - l.oy) / l.rowStep); rowY(l, r) <= NETWORK.narrowBottomV[1] * H; r++) if (!isLaneRow(r)) rows.push(r);
    for (const r of rows) {
      for (let c = nearestCol(l, r, W - 24); mouthX(l, r, c) > 16; c--) {
        const x = mouthX(l, r, c);
        if (slotFree(ctx, slots, x, rowY(l, r))) slots.push({ x, y: rowY(l, r), row: r, zone: "narrowBottom" });
      }
    }
    const cx = columnInGutter(l, W - 40, W - 14);
    if (cx !== null) {
      ctx.rightColX = cx;
      addColumnSlots(ctx, slots, cx, W - 40, W - 14, NETWORK.narrowGutterVMin, NETWORK.narrowBottomV[0] - 0.02, "narrowRight");
    }
    return slots;
  }

  // 1. Stage strip: the hub row left of the twin, at most 3.
  if (input.stage && input.twinBox.w > 0) {
    const r = nearestRow(l, input.hubRear.y);
    const xMax = input.twinBox.x - NETWORK.twinClearPx - NETWORK.node.localR;
    let added = 0;
    for (let c = nearestCol(l, r, xMax); added < NETWORK.stageStripMax; c--) {
      const x = mouthX(l, r, c);
      if (x > xMax) continue;
      if (x < input.stage.x) break;
      if (slotFree(ctx, slots, x, rowY(l, r))) {
        slots.push({ x, y: rowY(l, r), row: r, zone: "strip" });
        added++;
      }
    }
  }
  // 2. Right gutter.
  if (col) {
    const gx0 = col.x + col.w + NETWORK.rightGutterCardGapPx;
    const gx1 = W - NETWORK.node.localR - 2;
    if (W - (col.x + col.w) >= NETWORK.rightGutterMinPx) {
      ctx.rightColX = columnInGutter(l, gx0, gx1);
      if (ctx.rightColX !== null) addColumnSlots(ctx, slots, ctx.rightColX, gx0, gx1, NETWORK.rightGutterV[0], NETWORK.rightGutterV[1], "right");
    }
    // 3. Left gutter (wide viewports only).
    if (col.x >= NETWORK.leftGutterMinPx) {
      const lx0 = NETWORK.node.localR + 2;
      const lx1 = col.x - NETWORK.rightGutterCardGapPx;
      ctx.leftColX = columnInGutter(l, lx0, lx1);
      if (ctx.leftColX !== null) addColumnSlots(ctx, slots, ctx.leftColX, lx0, lx1, NETWORK.rightGutterV[0], NETWORK.rightGutterV[1], "left");
    }
  }
  return slots;
}

/** Bottom-row fallback slots (behind cards, glimpsed in gaps) - only used when the margins run out. */
function fallbackSlots(ctx: Ctx, slots: Slot[], need: number) {
  const { l } = ctx;
  const W = ctx.input.canvasW;
  const r = ctx.bottomRow;
  const y = rowY(l, r);
  for (let c = nearestCol(l, r, W - 24); mouthX(l, r, c) > W * 0.3 && slots.length < need; c--) {
    const x = mouthX(l, r, c);
    if (slotFree(ctx, slots, x, y)) slots.push({ x, y, row: r, zone: "bottom" });
  }
}

// ---------------------------------------------------------------- routing

/**
 * Shortest Manhattan routes on the lattice, one Dijkstra per hub: vertical
 * runs on even-row columns, horizontal runs on mouth rows (never on a lane
 * row), a turn penalty so routes keep few segments, a surcharge behind the
 * content column (prefer gutters and the bottom row) and a tether cost from
 * the hub so the dynamic bolt tether stays short.
 */
const TURN_PX = 120;
const COLUMN_COST = 4;
const TETHER_COST = 3;
const TETHER_MAX_PX = 240;

interface Router {
  k0: number;
  r0: number;
  cols: number;
  rows: number;
  dist: Float64Array;
  prev: Int32Array;
}

/** Drops zero-length and collinear interior points. */
function simplify(pts: number[]): number[] {
  const out: number[] = [pts[0], pts[1]];
  for (let i = 2; i < pts.length; i += 2) {
    const x = pts[i];
    const y = pts[i + 1];
    const n = out.length;
    if (Math.abs(out[n - 2] - x) < 0.01 && Math.abs(out[n - 1] - y) < 0.01) continue;
    if (n >= 4) {
      const ax = out[n - 4];
      const ay = out[n - 3];
      const bx = out[n - 2];
      const by = out[n - 1];
      if ((Math.abs(ax - bx) < 0.01 && Math.abs(bx - x) < 0.01) || (Math.abs(ay - by) < 0.01 && Math.abs(by - y) < 0.01)) {
        out[n - 2] = x;
        out[n - 1] = y;
        continue;
      }
    }
    out.push(x, y);
  }
  return out;
}

/** Tiny binary min-heap of (cost, state). */
function createHeap() {
  const cost: number[] = [];
  const state: number[] = [];
  const swap = (i: number, j: number) => {
    [cost[i], cost[j]] = [cost[j], cost[i]];
    [state[i], state[j]] = [state[j], state[i]];
  };
  return {
    get size() {
      return cost.length;
    },
    push(c: number, s: number) {
      cost.push(c);
      state.push(s);
      let i = cost.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (cost[p] <= cost[i]) break;
        swap(i, p);
        i = p;
      }
    },
    pop(): [number, number] {
      const top: [number, number] = [cost[0], state[0]];
      const lc = cost.pop()!;
      const ls = state.pop()!;
      if (cost.length) {
        cost[0] = lc;
        state[0] = ls;
        let i = 0;
        for (;;) {
          const a = 2 * i + 1;
          const b = a + 1;
          let m = i;
          if (a < cost.length && cost[a] < cost[m]) m = a;
          if (b < cost.length && cost[b] < cost[m]) m = b;
          if (m === i) break;
          swap(i, m);
          i = m;
        }
      }
      return top;
    },
  };
}

function buildRouter(ctx: Ctx, hub: Point): Router {
  const { l, input } = ctx;
  const W = input.canvasW;
  const H = input.canvasH;
  const k0 = Math.ceil((0 - l.ox) / l.pitch);
  const k1 = Math.floor((W - l.ox) / l.pitch);
  const r0 = Math.ceil((0 - l.oy) / l.rowStep);
  const r1 = Math.floor((H - l.oy) / l.rowStep);
  const cols = Math.max(0, k1 - k0 + 1);
  const rows = Math.max(0, r1 - r0 + 1);
  const n = cols * rows;
  const dist = new Float64Array(n * 2).fill(Infinity);
  const prev = new Int32Array(n * 2).fill(-1);
  const px = (i: number) => l.ox + (k0 + (i % cols)) * l.pitch;
  const py = (i: number) => rowY(l, r0 + Math.floor(i / cols));
  const blocked = new Uint8Array(n);
  for (let i = 0; i < n; i++) blocked[i] = ctx.linkBlock.some((b) => inside(b, px(i), py(i))) ? 1 : 0;
  const col = input.column;
  const edgeCost = (a: number, b: number, len: number) => {
    const x = (px(a) + px(b)) / 2;
    // Vertical runs inside the column and horizontal runs off the bottom row cost extra.
    const behind = col && x > col.x && x < col.x + col.w && r0 + Math.floor(a / cols) !== ctx.bottomRow;
    return len * (behind ? COLUMN_COST : 1);
  };
  const heap = createHeap();
  for (let i = 0; i < n; i++) {
    if (blocked[i]) continue;
    const d = Math.hypot(px(i) - hub.x, py(i) - hub.y);
    if (d > TETHER_MAX_PX) continue;
    for (let axis = 0; axis < 2; axis++) {
      dist[i * 2 + axis] = d * TETHER_COST;
      heap.push(d * TETHER_COST, i * 2 + axis);
    }
  }
  while (heap.size) {
    const [c, s] = heap.pop();
    if (c > dist[s]) continue;
    const i = s >> 1;
    const axis = s & 1;
    const k = i % cols;
    const r = Math.floor(i / cols);
    const tryEdge = (j: number, nextAxis: number, len: number) => {
      if (blocked[j]) return;
      for (const b of ctx.linkBlock) if (segmentHits(b, px(i), py(i), px(j), py(j))) return;
      const nc = c + edgeCost(i, j, len) + (nextAxis !== axis ? TURN_PX : 0);
      const t = j * 2 + nextAxis;
      if (nc < dist[t]) {
        dist[t] = nc;
        prev[t] = s;
        heap.push(nc, t);
      }
    };
    if (!isLaneRow(r0 + r)) {
      if (k > 0) tryEdge(i - 1, 0, l.pitch);
      if (k < cols - 1) tryEdge(i + 1, 0, l.pitch);
    }
    if (r > 0) tryEdge(i - cols, 1, l.rowStep);
    if (r < rows - 1) tryEdge(i + cols, 1, l.rowStep);
  }
  return { k0, r0, cols, rows, dist, prev };
}

/** Route from the hub-side tether mouth to slot s (canvas px, hub side first), or null when unreachable. */
function routeTo(ctx: Ctx, router: Router, s: Slot): number[] | null {
  const { l } = ctx;
  const { k0, r0, cols, rows, dist, prev } = router;
  const r = s.row - r0;
  if (r < 0 || r >= rows) return null;
  // Odd-row mouths sit half a pitch off the even columns: end on either neighbour column.
  const base = (s.x - l.ox) / l.pitch;
  const ks = mod(s.row, 2) === 1 ? [Math.floor(base), Math.ceil(base)] : [Math.round(base)];
  let best = -1;
  for (const kk of ks) {
    const k = kk - k0;
    if (k < 0 || k >= cols) continue;
    for (let axis = 0; axis < 2; axis++) {
      const t = (r * cols + k) * 2 + axis;
      if (Number.isFinite(dist[t]) && (best < 0 || dist[t] < dist[best])) best = t;
    }
  }
  if (best < 0) return null;
  const pts: number[] = [];
  for (let t = best; t >= 0; t = prev[t]) {
    const i = t >> 1;
    pts.push(l.ox + (k0 + (i % cols)) * l.pitch, rowY(l, r0 + Math.floor(i / cols)));
  }
  // Collected target -> source; flip pairs to hub side first.
  const out: number[] = [];
  for (let i = pts.length - 2; i >= 0; i -= 2) out.push(pts[i], pts[i + 1]);
  out.push(s.x, s.y);
  return simplify(out);
}

export function layoutNetwork(input: NetworkInput): NetworkLayout {
  const l = latticeFor(input.narrow, input.latticeOrigin);
  const quietM = RESOLVE.quietFeatherPx + NETWORK.quietClearPx;
  const twinM = NETWORK.twinClearPx + NETWORK.node.localR;
  const quietBlock = input.quiet.map((q) => inflate(q, quietM));
  const twin = input.twinBox.w > 0 ? [inflate(input.twinBox, twinM)] : [];
  const ctx: Ctx = {
    input,
    l,
    nodeBlock: [...quietBlock, ...twin],
    // Links may run right up to the twin (the tether starts there), never through it.
    linkBlock: [...quietBlock, ...(input.twinBox.w > 0 ? [inflate(input.twinBox, -1)] : [])],
    rightColX: null,
    leftColX: null,
    bottomRow: nearestRow(l, input.canvasH - NETWORK.bottomRowFromBottomPx),
  };
  if (rowY(l, ctx.bottomRow) > input.canvasH - 8) ctx.bottomRow -= isLaneRow(ctx.bottomRow - 1) ? 2 : 1;

  const maxNodes = input.narrow ? NETWORK.narrowMaxNodes : NETWORK.maxNodes;
  const slots = buildSlots(ctx);
  const agents = [...input.agents].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // A cluster takes one extra slot ("12 nodes plus one n-more node"; porthole keeps 4 in total).
  const wantCluster = agents.length > maxNodes;
  const need = Math.min(agents.length, maxNodes) + (wantCluster && !input.narrow ? 1 : 0);
  if (slots.length < need && !input.narrow) fallbackSlots(ctx, slots, need);

  const nodes: NetworkNode[] = [];
  const links: NetworkLayout["links"] = [];
  if (agents.length === 0) {
    const g = slots.find((s) => s.zone === "right") ?? slots[0];
    return { nodes, links, ghost: g ? { x: g.x, y: g.y } : null };
  }
  if (slots.length === 0) return { nodes, links, ghost: null };

  // Who gets a node: the local agent, then online, then by id; the rest fold into the cluster.
  const ranked = [...agents].sort((a, b) => Number(b.isLocal) - Number(a.isLocal) || Number(b.online) - Number(a.online) || (a.id < b.id ? -1 : 1));
  const capacity = Math.min(slots.length, input.narrow ? maxNodes : maxNodes + 1);
  const singles = ranked.length <= capacity && ranked.length <= maxNodes ? ranked.length : Math.min(maxNodes, capacity - 1);
  const shown = new Set(ranked.slice(0, singles).map((a) => a.id));
  const hidden = ranked.length - singles;

  const routers: { front?: Router; rear?: Router } = {};
  const taken = new Uint8Array(slots.length);
  const place = (key: string): number => {
    let i = fnv1a(key) % slots.length;
    for (let k = 0; k < slots.length; k++, i = (i + 1) % slots.length) {
      if (!taken[i]) {
        taken[i] = 1;
        return i;
      }
    }
    return -1;
  };
  const push = (slotIndex: number, node: Omit<NetworkNode, "x" | "y" | "hub">) => {
    const s = slots[slotIndex];
    nodes.push({ ...node, x: s.x, y: s.y, hub: s.zone === "strip" ? "rear" : "front" });
    const hub = s.zone === "strip" ? "rear" : "front";
    routers[hub] ??= buildRouter(ctx, hub === "rear" ? input.hubRear : input.hubFront);
    const route = routeTo(ctx, routers[hub], s);
    // A node right beside the hub keeps a zero-length run: the tether alone reaches it.
    if (route) links.push({ node: nodes.length - 1, points: new Float32Array(route.length >= 4 ? route : [s.x, s.y, s.x, s.y]) });
  };
  // Agents placed in id order so probing collisions resolve the same way every session.
  for (const a of agents) {
    if (!shown.has(a.id)) continue;
    const i = place(a.id);
    if (i >= 0) push(i, { id: a.id, online: a.online, isLocal: a.isLocal, cluster: 0 });
  }
  if (hidden > 0) {
    const i = place("__cluster__");
    if (i >= 0) push(i, { id: "__cluster__", online: ranked.slice(singles).some((a) => a.online), isLocal: false, cluster: hidden });
  }

  // Link budget: <= 32 capsule segments; drop the longest routes first.
  let segs = links.reduce((n, k) => n + k.points.length / 2 - 1, 0);
  while (segs > NETWORK.maxLinkSegments && links.length) {
    let worst = 0;
    for (let i = 1; i < links.length; i++) if (links[i].points.length > links[worst].points.length) worst = i;
    segs -= links[worst].points.length / 2 - 1;
    links.splice(worst, 1);
  }
  return { nodes, links, ghost: null };
}
