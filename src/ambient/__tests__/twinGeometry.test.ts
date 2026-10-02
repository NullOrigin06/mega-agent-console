import { describe, expect, it } from "vitest";
import { TYPICAL_VESSEL } from "../../components/cad/vesselSpec";
import type { VesselSpec } from "../../components/cad/vesselSpec";
import { solveCamera } from "../camera";
import { ALPHA_CLASS, ALPHA_CLASS_COUNT, EVENT_RINGS, VESSEL_CLAMP, WIRE } from "../constants";
import { SEG_STRIDE, baffleStations, baffleWindowSign, buildTwinGeometry, classAlphaTable, segmentBudget, toVesselModel, tubeFieldRadius, writeEventRing, writeSilhouettes } from "../twinGeometry";
import type { PoseName } from "../types";

const model = toVesselModel(TYPICAL_VESSEL);
const POSES: PoseName[] = ["overview", "telemetry", "wide", "face", "bonnet", "section", "porthole"];

describe("toVesselModel", () => {
  it("normalises TYPICAL_VESSEL to D = 1", () => {
    expect(model.length).toBeCloseTo(3.75, 6);
    expect(model.bonnetFront).toBeCloseTo(0.625, 6);
    expect(model.tubeSheetOD).toBeCloseTo(1.1875, 6);
    expect(model.boltPCD).toBeCloseTo(1.125, 6);
    expect(model.boltQty).toBe(24);
    expect(model.baffleQty).toBe(6);
    expect(model.nozzles.map((n) => n.xFrac)).toEqual([0.1, 0.9]);
    expect(model.nozzles[0].od).toBeCloseTo(0.125, 6);
  });

  it("applies the spec clamps", () => {
    const wild: VesselSpec = {
      ...TYPICAL_VESSEL,
      tubeLength: 800 * 10,
      baffleQty: 30,
      boltQty: 4,
      nozzles: [
        { id: "N1", sizeMm: 5, angleDeg: -90, service: "in" },
        { id: "N2", sizeMm: 900, angleDeg: 450, service: "out" },
      ],
    };
    const m = toVesselModel(wild);
    expect(m.length).toBe(VESSEL_CLAMP.lengthMax);
    expect(m.baffleQty).toBe(VESSEL_CLAMP.baffleMax);
    expect(m.boltQty).toBe(VESSEL_CLAMP.boltMin);
    expect(m.nozzles[0].od).toBe(VESSEL_CLAMP.nozzleOdMin);
    expect(m.nozzles[1].od).toBe(VESSEL_CLAMP.nozzleOdMax);
    expect(m.nozzles[0].angleDeg).toBe(270);
    expect(m.nozzles[1].angleDeg).toBe(90);
    const short = toVesselModel({ ...TYPICAL_VESSEL, tubeLength: 400, boltQty: 200, baffleQty: -3 });
    expect(short.length).toBe(VESSEL_CLAMP.lengthMin);
    expect(short.boltQty).toBe(VESSEL_CLAMP.boltMax);
    expect(short.baffleQty).toBe(0);
  });

  it("survives garbage input", () => {
    const m = toVesselModel({ ...TYPICAL_VESSEL, shellId: 0, tubeLength: Number.NaN, nozzles: [] });
    expect(Number.isFinite(m.length)).toBe(true);
    expect(m.nozzles).toEqual([]);
    expect(() => buildTwinGeometry(m, { shellRadiusPx: 55, maxSegments: 1900 }, "overview")).not.toThrow();
  });
});

describe("buildTwinGeometry", () => {
  it("respects the segment budget in every pose", () => {
    for (const pose of POSES) {
      for (const max of [600, 700, 1300, 1900]) {
        for (const r of [20, 55, 120]) {
          const g = buildTwinGeometry(model, { shellRadiusPx: r, maxSegments: max }, pose);
          expect(g.segmentCount).toBeLessThanOrEqual(max);
          expect(g.segmentCount).toBeGreaterThan(0);
          expect(g.totalSegmentCount).toBe(g.segmentCount + EVENT_RINGS.slots * EVENT_RINGS.segments);
          expect(g.segments.length).toBe(g.totalSegmentCount * SEG_STRIDE);
        }
      }
    }
  });

  it("fits the 1440 overview in <= 1,900 segments without shedding detail", () => {
    const f = solveCamera({ pose: "overview", canvasW: 1208, canvasH: 809, stage: { x: 614, y: 0, w: 582, h: 177 }, model, yawOffsetDeg: 0, pitchOffsetDeg: 0, rollDeg: 0 });
    const budget = segmentBudget(f.twinBox, 1900);
    expect(budget).toBeLessThanOrEqual(1900);
    const g = buildTwinGeometry(model, { shellRadiusPx: f.shellRadiusPx, maxSegments: budget }, "overview");
    expect(g.segmentCount).toBeLessThanOrEqual(budget);
    expect(g.lod.meridians).toBe(12);
    expect(g.faceMouthCount).toBe(91);
  });

  it("tags every segment with a valid region and alpha class, and finite coordinates", () => {
    for (const pose of POSES) {
      const g = buildTwinGeometry(model, { shellRadiusPx: 55, maxSegments: 1900 }, pose);
      for (let i = 0; i < g.totalSegmentCount; i++) {
        const o = i * SEG_STRIDE;
        for (let k = 0; k < 6; k++) expect(Number.isFinite(g.segments[o + k])).toBe(true);
        expect([0, 1, 2, 3]).toContain(g.segments[o + 6]);
        const cls = g.segments[o + 7];
        expect(Number.isInteger(cls) && cls >= 0 && cls < ALPHA_CLASS_COUNT).toBe(true);
        if (i >= g.segmentCount) expect(cls).toBe(ALPHA_CLASS.EVENT_RING);
      }
      // Silhouettes come first.
      expect(g.segments[7]).toBe(ALPHA_CLASS.SILHOUETTE);
      expect(g.segments[SEG_STRIDE + 7]).toBe(ALPHA_CLASS.SILHOUETTE);
    }
  });

  it("uses the near-half cutaway in SECTION and hides the shell side of the front bonnet in FACE", () => {
    const section = buildTwinGeometry(model, { shellRadiusPx: 55, maxSegments: 1900 }, "section");
    const classes = new Set<number>();
    for (let i = 0; i < section.segmentCount; i++) classes.add(section.segments[i * SEG_STRIDE + 7]);
    expect(classes.has(ALPHA_CLASS.SECTION_NEAR)).toBe(true);
    expect(classes.has(ALPHA_CLASS.LANE)).toBe(true);
    expect(classes.has(ALPHA_CLASS.MERIDIAN)).toBe(false);
    const face = buildTwinGeometry(model, { shellRadiusPx: 67, maxSegments: 1900 }, "face");
    let maxX = -Infinity;
    for (let i = 0; i < face.segmentCount; i++) maxX = Math.max(maxX, face.segments[i * SEG_STRIDE], face.segments[i * SEG_STRIDE + 3]);
    expect(maxX).toBeLessThanOrEqual(model.length / 2 + 0.01);
  });

  it("places baffles, face mouths, X-ray dots and bolt circles", () => {
    const g = buildTwinGeometry(model, { shellRadiusPx: 55, maxSegments: 1900 }, "overview");
    const L = model.length;
    expect(g.baffleX).toEqual(baffleStations(model));
    g.baffleX.forEach((x, i) => expect(x).toBeCloseTo(-L / 2 + (L * (i + 1)) / 7, 6));
    expect(baffleWindowSign(model, 0)).toBe(-1);
    expect(baffleWindowSign(model, 1)).toBe(1);
    const field = tubeFieldRadius(model);
    for (let i = 0; i < g.faceMouthCount; i++) {
      expect(g.faceMouths[i * 3]).toBeCloseTo(L / 2, 2);
      expect(Math.hypot(g.faceMouths[i * 3 + 1], g.faceMouths[i * 3 + 2])).toBeLessThanOrEqual(field + 1e-6);
    }
    expect(g.faceMouths[1]).toBe(0); // centre-out ordering
    expect(g.xrayDotCount).toBe(6 * WIRE.xrayDotsPerBaffle);
    expect(g.boltFront.count).toBe(24);
    expect(g.boltFront.radius).toBeCloseTo(0.5625, 6);
    expect(g.boltFront.center[0]).toBeGreaterThan(L / 2);
    expect(g.boltRear.center[0]).toBeLessThan(-L / 2);
  });

  it("explodes the front channel in BONNET", () => {
    const o = buildTwinGeometry(model, { shellRadiusPx: 55, maxSegments: 1900 }, "overview");
    const b = buildTwinGeometry(model, { shellRadiusPx: 55, maxSegments: 1900 }, "bonnet");
    expect(b.boltFront.center[0] - o.boltFront.center[0]).toBeCloseTo(VESSEL_CLAMP.explodeR * 0.5, 6);
  });
});

describe("per-frame writers", () => {
  it("writes the two shell silhouettes as tangent generators", () => {
    const g = buildTwinGeometry(model, { shellRadiusPx: 55, maxSegments: 1900 }, "overview");
    const f = solveCamera({ pose: "overview", canvasW: 1208, canvasH: 809, stage: { x: 614, y: 0, w: 582, h: 177 }, model, yawOffsetDeg: 0, pitchOffsetDeg: 0, rollDeg: 0 });
    writeSilhouettes(f.eye, model, g.segments, g.silhouetteStart);
    for (let k = 0; k < 2; k++) {
      const o = k * SEG_STRIDE;
      const y = g.segments[o + 1];
      const z = g.segments[o + 2];
      expect(Math.hypot(y, z)).toBeCloseTo(0.5, 5);
      // Tangent: (p - eye) is perpendicular to the radial direction in the YZ plane.
      expect((f.eye[1] - y) * y + (f.eye[2] - z) * z).toBeCloseTo(0, 4);
    }
    writeSilhouettes([10, 0, 0], model, g.segments, 0);
    expect(g.segments[0]).toBe(0);
    expect(g.segments[3]).toBe(0);
  });

  it("writes event rings into the reserved range only", () => {
    const g = buildTwinGeometry(model, { shellRadiusPx: 55, maxSegments: 1900 }, "overview");
    const before = g.segments.slice(0, g.segmentCount * SEG_STRIDE);
    const first = writeEventRing(g, 2, [model.length / 2, 0, 0], 0.3, 1);
    expect(first).toBe(g.segmentCount + 2 * EVENT_RINGS.segments);
    expect(g.segments.slice(0, g.segmentCount * SEG_STRIDE)).toEqual(before);
    expect(Math.hypot(g.segments[first * SEG_STRIDE + 1], g.segments[first * SEG_STRIDE + 2])).toBeCloseTo(0.3, 5);
  });

  it("applies pose alpha overrides", () => {
    expect(classAlphaTable("section")[ALPHA_CLASS.BAFFLE]).toBeCloseTo(0.3, 6);
    expect(classAlphaTable("bonnet")[ALPHA_CLASS.SHELL_RING]).toBeCloseTo(0.1, 6);
    expect(classAlphaTable("overview")[ALPHA_CLASS.NOZZLE]).toBeCloseTo(0.24, 6);
  });
});
