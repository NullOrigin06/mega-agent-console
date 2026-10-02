import { describe, expect, it } from "vitest";
import { TYPICAL_VESSEL } from "../../components/cad/vesselSpec";
import { createCameraFrame, isLargePoseChange, mat4Invert, mat4Multiply, poseForPage, projectPoint, solveCamera } from "../camera";
import type { CameraInput } from "../camera";
import { LOD } from "../constants";
import { toVesselModel, twinLod } from "../twinGeometry";
import type { PoseName, Rect } from "../types";

const model = toVesselModel(TYPICAL_VESSEL);
// 1440x900 reference: 232 px sidebar, ambient top 91 px.
const W = 1208;
const H = 809;
const STAGE: Rect = { x: 614, y: 0, w: 582, h: 177 };
const COLUMN: Rect = { x: 54, y: 0, w: 1100, h: 2000 };

const input = (pose: PoseName, extra: Partial<CameraInput> = {}): CameraInput => ({
  pose,
  canvasW: W,
  canvasH: H,
  stage: STAGE,
  model,
  yawOffsetDeg: 0,
  pitchOffsetDeg: 0,
  rollDeg: 0,
  column: COLUMN,
  ...extra,
});

const pct = (p: { x: number; y: number }) => ({ x: (100 * p.x) / W, y: (100 * p.y) / H });

describe("OVERVIEW at 1440x900", () => {
  const f = solveCamera(input("overview"));

  it("puts the front tube-sheet face centre at (86.2%, 12.6%) +-1.5%", () => {
    const p = pct(f.frontFace);
    expect(Math.abs(p.x - 86.2)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(p.y - 12.6)).toBeLessThanOrEqual(1.5);
  });

  it("puts the rear face at (65.9%, 9.6%) +-1.5%", () => {
    const p = pct(f.rearFace);
    expect(Math.abs(p.x - 65.9)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(p.y - 9.6)).toBeLessThanOrEqual(1.5);
  });

  it("projects the shell at D_px 110 +-6 (R_px ~55)", () => {
    expect(Math.abs(2 * f.shellRadiusPx - 110)).toBeLessThanOrEqual(6);
    expect(Math.abs(2 * f.frontFace.radiusPx - 123)).toBeLessThanOrEqual(6);
  });

  it("derives the VP off-canvas top-left, outside the twin box", () => {
    expect(f.vanishing).not.toBeNull();
    const vp = f.vanishing!;
    expect(vp.x).toBeLessThan(0);
    expect(vp.y).toBeLessThan(0.1 * H);
    // Spec: about (-16%, -2%).
    expect(Math.abs(pct(vp).x + 16)).toBeLessThanOrEqual(2);
    expect(Math.abs(pct(vp).y + 2)).toBeLessThanOrEqual(2);
    const b = f.twinBox;
    expect(vp.x >= b.x && vp.x <= b.x + b.w && vp.y >= b.y && vp.y <= b.y + b.h).toBe(false);
  });

  it("keeps the twin box in the stage band", () => {
    const b = f.twinBox;
    expect(b.x).toBeGreaterThan(STAGE.x);
    expect(b.x + b.w).toBeLessThanOrEqual(W);
    expect(b.y + b.h).toBeLessThan(0.3 * H);
  });

  it("projectPoint agrees with the frame anchors", () => {
    const p = projectPoint(f, [model.length / 2, 0, 0], W, H);
    expect(p.x).toBeCloseTo(f.frontFace.x, 3);
    expect(p.y).toBeCloseTo(f.frontFace.y, 3);
    expect(p.depth).toBeGreaterThan(0);
  });

  it("re-derives the VP from a tilted camera", () => {
    const tilted = solveCamera(input("overview", { yawOffsetDeg: 3, pitchOffsetDeg: 2 }));
    expect(tilted.vanishing!.x).not.toBeCloseTo(f.vanishing!.x, 0);
  });

  it("reuses the output frame", () => {
    const out = createCameraFrame();
    expect(solveCamera(input("overview"), out)).toBe(out);
    expect(out.frontFace.x).toBeCloseTo(f.frontFace.x, 3);
  });
});

describe("other poses", () => {
  it("SECTION has its VP at infinity and a horizontal axis", () => {
    const f = solveCamera(input("section"));
    expect(f.vanishing).toBeNull();
    expect(Math.abs(f.axisScreenDir.x)).toBeGreaterThan(0.99);
  });

  it("FACE lands the VP on the face centre", () => {
    const f = solveCamera(input("face"));
    expect(f.vanishing).not.toBeNull();
    expect(Math.hypot(f.vanishing!.x - f.frontFace.x, f.vanishing!.y - f.frontFace.y)).toBeLessThan(2);
    // Face diameter = 0.9 x stageH (tube-sheet OD).
    expect(Math.abs(2 * f.frontFace.radiusPx * model.tubeSheetOD - 0.9 * STAGE.h)).toBeLessThan(4);
  });

  it("TELEMETRY is the overview at 0.7x", () => {
    const o = solveCamera(input("overview"));
    const t = solveCamera(input("telemetry"));
    expect(t.shellRadiusPx / o.shellRadiusPx).toBeCloseTo(0.7, 2);
  });

  it("PORTHOLE centres the face at (92%, 6%) on a phone canvas", () => {
    const f = solveCamera({ ...input("porthole"), canvasW: 390, canvasH: 750, stage: null, column: null });
    expect(f.frontFace.x / 390).toBeCloseTo(0.92, 1);
    expect(f.frontFace.y / 750).toBeCloseTo(0.06, 1);
  });

  it("WIDE puts the face in a >= 200 px gutter", () => {
    const column = { x: 120, y: 0, w: 1100, h: 2000 };
    const f = solveCamera({ ...input("wide"), canvasW: 1688, canvasH: 989, column, stage: { x: 700, y: 0, w: 900, h: 177 } });
    expect(f.frontFace.x).toBeGreaterThan(column.x + column.w);
    expect(f.frontFace.y / 989).toBeCloseTo(0.2, 1);
  });

  it("view matrices are invertible", () => {
    const f = solveCamera(input("bonnet"));
    const inv = mat4Invert(f.view)!;
    const id = mat4Multiply(f.view, inv);
    for (let i = 0; i < 16; i++) expect(id[i]).toBeCloseTo(i % 5 === 0 ? 1 : 0, 4);
  });
});

describe("LOD numbers", () => {
  it("matches the spec at R_px 55 in OVERVIEW", () => {
    const l = twinLod(model, 55, "overview");
    expect(l.meridians).toBe(12);
    expect(l.ringSegments).toBe(49);
    expect(l.shellRings).toBe(LOD.shellRingsDense);
    expect(l.boltCount).toBe(24);
    expect(l.mouthCount).toBe(91);
  });

  it("clamps at the extremes and uses 127-169 mouths in FACE", () => {
    expect(twinLod(model, 10, "overview")).toMatchObject({ meridians: 8, ringSegments: 24, mouthCount: 61 });
    expect(twinLod(model, 500, "overview")).toMatchObject({ meridians: 16, ringSegments: 64 });
    const face = solveCamera(input("face"));
    const l = twinLod(model, face.shellRadiusPx, "face");
    expect([127, 169]).toContain(l.mouthCount);
    expect(twinLod(model, 55, "section").mouthCount).toBe(0);
  });

  it("thins bolts that would crowd", () => {
    expect(twinLod({ ...model, boltQty: 48 }, 12, "overview").boltCount).toBe(24);
  });
});

describe("pose selection", () => {
  const layout = { canvas: { x: 232, y: 91, w: W, h: H }, column: COLUMN, narrow: false };
  it("maps pages to poses", () => {
    expect(poseForPage("modules", null, layout)).toBe("overview");
    expect(poseForPage("jobs", null, layout)).toBe("telemetry");
    expect(poseForPage("workspace", "TubeSheet", layout)).toBe("face");
    expect(poseForPage("workspace", "BonnetFlange", layout)).toBe("bonnet");
    expect(poseForPage("workspace", "HeatExchangerFab", layout)).toBe("section");
    expect(poseForPage("modules", null, { ...layout, narrow: true })).toBe("porthole");
    expect(poseForPage("modules", null, { ...layout, canvas: { ...layout.canvas, w: 1500 } })).toBe("wide");
  });

  it("flags large pose changes for the haze dip", () => {
    expect(isLargePoseChange("overview", "telemetry")).toBe(false);
    expect(isLargePoseChange("overview", "face")).toBe(true);
    expect(isLargePoseChange("overview", "section")).toBe(true);
  });
});
