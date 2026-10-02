import { describe, expect, it } from "vitest";
import { TYPICAL_VESSEL } from "../../components/cad/vesselSpec";
import { PATHS, PATH_KIND } from "../constants";
import { PATH_SAMPLES, buildFlowPaths, samplePath } from "../paths";
import { baffleStations, baffleWindowSign, toVesselModel } from "../twinGeometry";
import type { PoseName } from "../types";

const model = toVesselModel(TYPICAL_VESSEL);

describe("buildFlowPaths", () => {
  it("packs shell, tube and process ranges with arclength fractions 0..1", () => {
    const p = buildFlowPaths(model, "overview");
    expect(p.shell).toEqual({ start: 0, count: PATHS.shellStreamlines });
    expect(p.tube).toEqual({ start: 12, count: 7 });
    expect(p.process.count).toBe(4);
    expect(p.data.length).toBe(p.pathCount * PATH_SAMPLES * 4);
    for (let i = 0; i < p.pathCount; i++) {
      let prev = -1;
      for (let k = 0; k < PATH_SAMPLES; k++) {
        const w = p.data[(i * PATH_SAMPLES + k) * 4 + 3];
        expect(w).toBeGreaterThan(prev);
        prev = w;
      }
      expect(p.data[(i * PATH_SAMPLES) * 4 + 3]).toBe(0);
      expect(prev).toBeCloseTo(1, 6);
      expect(p.lengths[i]).toBeGreaterThan(0);
    }
  });

  it("spaces samples evenly along the arclength", () => {
    const p = buildFlowPaths(model, "overview");
    const steps: number[] = [];
    for (let k = 1; k < PATH_SAMPLES; k++) {
      const a = (k - 1) * 4;
      const b = k * 4;
      steps.push(Math.hypot(p.data[b] - p.data[a], p.data[b + 1] - p.data[a + 1], p.data[b + 2] - p.data[a + 2]));
    }
    const mean = steps.reduce((s, v) => s + v, 0) / steps.length;
    // Chords run slightly short of the arc only where the stream turns into a nozzle.
    for (const s of steps) expect(Math.abs(s - mean) / mean).toBeLessThan(0.1);
  });

  it("crosses each baffle window on alternate sides (serpentine locked to the stations)", () => {
    const p = buildFlowPaths(model, "overview");
    const stations = baffleStations(model);
    const mid = 5; // a near-central streamline
    const pt = new Float32Array(3);
    stations.forEach((x, i) => {
      // Find the sample nearest the station.
      let best = 0;
      let bestD = Infinity;
      for (let k = 0; k < PATH_SAMPLES; k++) {
        const d = Math.abs(p.data[(mid * PATH_SAMPLES + k) * 4] - x);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      samplePath(p, mid, best / (PATH_SAMPLES - 1), pt);
      expect(Math.sign(pt[1])).toBe(baffleWindowSign(model, i));
      // Inside the window: beyond the cut chord (R - cut = 0.25).
      expect(Math.abs(pt[1])).toBeGreaterThan(0.25);
    });
  });

  it("runs the cold lanes front to rear and stays inside the shell", () => {
    const p = buildFlowPaths(model, "overview");
    for (let i = p.tube.start; i < p.tube.start + p.tube.count; i++) {
      expect(p.kinds[i]).toBe(PATH_KIND.TUBE);
      const x0 = p.data[i * PATH_SAMPLES * 4];
      const x1 = p.data[((i + 1) * PATH_SAMPLES - 1) * 4];
      expect(x0).toBeGreaterThan(x1);
    }
    for (let i = p.shell.start; i < p.shell.count; i++) {
      for (let k = 8; k < PATH_SAMPLES - 8; k++) {
        const o = (i * PATH_SAMPLES + k) * 4;
        expect(Math.hypot(p.data[o + 1], p.data[o + 2])).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it("drops what each pose hides", () => {
    const counts = (pose: PoseName) => {
      const p = buildFlowPaths(model, pose);
      return [p.shell.count, p.tube.count, p.process.count];
    };
    expect(counts("face")[0]).toBe(0);
    expect(counts("bonnet")[0]).toBe(0);
    expect(buildFlowPaths(model, "bonnet").kinds.includes(PATH_KIND.RISER_IN)).toBe(false);
    const porthole = buildFlowPaths(model, "porthole");
    expect(porthole.closed[porthole.tube.start]).toBe(1);
    expect(porthole.kinds[porthole.process.start]).toBe(PATH_KIND.HOT_RING);
    for (const pose of ["overview", "telemetry", "wide", "face", "bonnet", "section", "porthole"] as PoseName[]) {
      expect(buildFlowPaths(model, pose).pathCount).toBeLessThanOrEqual(PATHS.maxPaths);
    }
  });
});
