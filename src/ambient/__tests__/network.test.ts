import { describe, expect, it } from "vitest";
import { TYPICAL_VESSEL } from "../../components/cad/vesselSpec";
import { projectPoint, solveCamera } from "../camera";
import { NETWORK, RESOLVE } from "../constants";
import { fnv1a, isLaneRow, latticeFor, layoutNetwork, mouthX, rowY } from "../network";
import type { NetworkInput, NetworkLayout } from "../network";
import { buildTwinGeometry, toVesselModel } from "../twinGeometry";
import type { AgentNodeInput, Rect } from "../types";

const W = 1208;
const H = 809;
const model = toVesselModel(TYPICAL_VESSEL);
const STAGE: Rect = { x: 614, y: 0, w: 582, h: 177 };
const COLUMN: Rect = { x: 54, y: 0, w: 1100, h: 2000 };
const frame = solveCamera({ pose: "overview", canvasW: W, canvasH: H, stage: STAGE, model, yawOffsetDeg: 0, pitchOffsetDeg: 0, rollDeg: 0, column: COLUMN });
const geo = buildTwinGeometry(model, { shellRadiusPx: frame.shellRadiusPx, maxSegments: 1900 }, "overview");
// Title block + subtitle line box (already inflated), and an empty-state core lower down.
const QUIET: Rect[] = [
  { x: 38, y: 28, w: 552, h: 74 },
  { x: 38, y: 108, w: 470, h: 40 },
  { x: 900, y: 520, w: 200, h: 60 },
];

const agents = (n: number, online = true): AgentNodeInput[] => Array.from({ length: n }, (_, i) => ({ id: `agent-${i.toString(36)}-${i * 7919}`, online: online && i % 3 !== 2, isLocal: i === 1 }));

const base = (list: AgentNodeInput[], extra: Partial<NetworkInput> = {}): NetworkInput => ({
  agents: list,
  canvasW: W,
  canvasH: H,
  narrow: false,
  quiet: QUIET,
  twinBox: frame.twinBox,
  column: COLUMN,
  stage: STAGE,
  hubFront: projectPoint(frame, geo.boltFront.center, W, H),
  hubRear: projectPoint(frame, geo.boltRear.center, W, H),
  ...extra,
});

const inRect = (r: Rect, x: number, y: number, m = 0) => x >= r.x - m && x <= r.x + r.w + m && y >= r.y - m && y <= r.y + r.h + m;

function expectSafe(layout: NetworkLayout, input: NetworkInput) {
  const clear = RESOLVE.quietFeatherPx + NETWORK.quietClearPx;
  for (const n of layout.nodes) {
    for (const q of input.quiet) expect(inRect(q, n.x, n.y, clear)).toBe(false);
    expect(inRect(input.twinBox, n.x, n.y)).toBe(false);
    expect(n.x).toBeGreaterThanOrEqual(0);
    expect(n.x).toBeLessThanOrEqual(input.canvasW);
    expect(n.y).toBeGreaterThanOrEqual(0);
    expect(n.y).toBeLessThanOrEqual(input.canvasH);
  }
  for (let i = 0; i < layout.nodes.length; i++) {
    for (let j = i + 1; j < layout.nodes.length; j++) {
      const a = layout.nodes[i];
      const b = layout.nodes[j];
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(NETWORK.minSpacingPx);
    }
  }
}

describe("fnv1a", () => {
  it("matches the reference vectors", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("a")).toBe(0xe40c292c);
    expect(fnv1a("foobar")).toBe(0xbf9cf968);
  });
});

describe("layoutNetwork", () => {
  it("gives the same slots for the same ids, whatever the input order", () => {
    const list = agents(8);
    const a = layoutNetwork(base(list));
    const b = layoutNetwork(base([...list].reverse()));
    const pos = (l: NetworkLayout) => Object.fromEntries(l.nodes.map((n) => [n.id, [n.x, n.y]]));
    expect(pos(b)).toEqual(pos(a));
    expect(a.nodes).toHaveLength(8);
  });

  it("keeps a workstation's slot when another agent goes offline", () => {
    const list = agents(5);
    const a = layoutNetwork(base(list));
    const b = layoutNetwork(base(list.map((x, i) => (i === 3 ? { ...x, online: false } : x))));
    const pos = (l: NetworkLayout) => Object.fromEntries(l.nodes.map((n) => [n.id, [n.x, n.y]]));
    expect(pos(b)).toEqual(pos(a));
  });

  it("never places a node in a quiet core (+feather +36 px) or the twin box, and spaces nodes >= 72 px", () => {
    for (const n of [1, 3, 8, 12, 20]) {
      const input = base(agents(n));
      expectSafe(layoutNetwork(input), input);
    }
    const narrow = base(agents(6), { canvasW: 390, canvasH: 750, narrow: true, column: null, stage: null, twinBox: { x: 226, y: -145, w: 265, h: 320 } });
    const l = layoutNetwork(narrow);
    expect(l.nodes.length).toBeLessThanOrEqual(NETWORK.narrowMaxNodes);
    expectSafe(l, narrow);
  });

  it("snaps nodes to lattice mouths (never on a pass-partition lane)", () => {
    const l = latticeFor(false);
    for (const n of layoutNetwork(base(agents(12))).nodes) {
      const row = Math.round(n.y / l.rowStep);
      expect(n.y).toBeCloseTo(rowY(l, row), 4);
      expect(isLaneRow(row)).toBe(false);
      const col = Math.round((n.x - (row % 2 ? l.pitch / 2 : 0)) / l.pitch);
      expect(n.x).toBeCloseTo(mouthX(l, row, col), 4);
    }
  });

  it("caps at 12 nodes plus one cluster node", () => {
    const l = layoutNetwork(base(agents(20), { quiet: QUIET.slice(0, 2) }));
    const clusters = l.nodes.filter((n) => n.cluster > 0);
    expect(clusters).toHaveLength(1);
    expect(l.nodes.length).toBe(13);
    expect(clusters[0].cluster).toBe(8);
    // The local agent is always shown individually.
    expect(l.nodes.some((n) => n.isLocal)).toBe(true);
  });

  it("folds the overflow into the cluster when slots run out", () => {
    const l = layoutNetwork(base(agents(20)));
    const clusters = l.nodes.filter((n) => n.cluster > 0);
    expect(clusters).toHaveLength(1);
    expect(l.nodes.length).toBeLessThanOrEqual(13);
    expect(clusters[0].cluster).toBe(20 - (l.nodes.length - 1));
  });

  it("routes links along rows and columns within the 32-segment budget", () => {
    const input = base(agents(12));
    const l = layoutNetwork(input);
    let segments = 0;
    for (const link of l.links) {
      const p = link.points;
      const node = l.nodes[link.node];
      expect(p[p.length - 2]).toBeCloseTo(node.x, 4);
      expect(p[p.length - 1]).toBeCloseTo(node.y, 4);
      for (let i = 2; i < p.length; i += 2) {
        segments++;
        const horizontal = Math.abs(p[i + 1] - p[i - 1]) < 1e-3;
        const vertical = Math.abs(p[i] - p[i - 2]) < 1e-3;
        expect(horizontal || vertical).toBe(true);
        // No run passes through the twin box interior.
        const midX = (p[i] + p[i - 2]) / 2;
        const midY = (p[i + 1] + p[i - 1]) / 2;
        expect(inRect({ x: input.twinBox.x + 2, y: input.twinBox.y + 2, w: input.twinBox.w - 4, h: input.twinBox.h - 4 }, midX, midY)).toBe(false);
      }
    }
    expect(segments).toBeLessThanOrEqual(NETWORK.maxLinkSegments);
    expect(l.links.length).toBeGreaterThan(0);
  });

  it("offers a ghost slot when no agents are paired", () => {
    const l = layoutNetwork(base([]));
    expect(l.nodes).toHaveLength(0);
    expect(l.ghost).not.toBeNull();
    for (const q of QUIET) expect(inRect(q, l.ghost!.x, l.ghost!.y)).toBe(false);
  });
});
