import { describe, expect, it } from "vitest";
import { TYPICAL_VESSEL } from "../../components/cad/vesselSpec";
import { solveCamera, swingEnvelope, telemetryEmblem } from "../camera";
import { CAMERA, POSE_PARAMS } from "../constants";
import { toVesselModel } from "../twinGeometry";
import type { PoseName, Rect } from "../types";

const model = toVesselModel(TYPICAL_VESSEL);

/**
 * Command Center layouts as quietZones measures them after the stage change
 * (stage right = column right - 24): 232 px sidebar, ambient top 91 px,
 * .main-content max 1400 px with 24 px padding, header max 1100 px, title max 520 px.
 */
const CASES: Array<{ name: string; W: number; H: number; stage: Rect; column: Rect }> = [
  { name: "1366x768", W: 1134, H: 677, stage: { x: 584, y: 0, w: 502, h: 177 }, column: { x: 24, y: 0, w: 1086, h: 2000 } },
  { name: "1440x900", W: 1208, H: 809, stage: { x: 614, y: 0, w: 546, h: 177 }, column: { x: 24, y: 0, w: 1160, h: 2000 } },
  { name: "1440x900 (lead measurement)", W: 1208, H: 809, stage: { x: 606, y: 0, w: 539, h: 177 }, column: { x: 43, y: 0, w: 1126, h: 2000 } },
  { name: "1920x1080", W: 1688, H: 989, stage: { x: 854, y: 0, w: 642, h: 177 }, column: { x: 168, y: 0, w: 1352, h: 2000 } },
];

const inside = (b: Rect, r: Rect, pad = 0) => b.x >= r.x + pad - 0.5 && b.y >= r.y + pad - 0.5 && b.x + b.w <= r.x + r.w - pad + 0.5 && b.y + b.h <= r.y + r.h - pad + 0.5;

describe("the whole twin fits inside the stage", () => {
  for (const c of CASES) {
    for (const pose of ["overview", "telemetry"] as PoseName[]) {
      it(`${pose} at ${c.name}`, () => {
        const inp = { pose, canvasW: c.W, canvasH: c.H, stage: c.stage, column: c.column, model, yawOffsetDeg: 0, pitchOffsetDeg: 0, rollDeg: 0 };
        const f = solveCamera(inp);
        const b = f.twinBox;
        expect(b.w).toBeGreaterThan(0.45 * c.stage.w * (pose === "telemetry" ? 0.6 : 1));
        expect(inside(b, c.stage, POSE_PARAMS.stageFitPadPx)).toBe(true);
        // The engine's swing (+-6 deg) and pointer tilt (+-3 / +-2 deg) stay inside the stage too.
        expect(inside(swingEnvelope(inp), c.stage, POSE_PARAMS.stageFitPadPx)).toBe(true);
        for (const yaw of [-1, 1]) {
          for (const pitch of [-1, 1]) {
            const t = solveCamera({ ...inp, yawOffsetDeg: yaw * (CAMERA.swingAmpDeg + CAMERA.tiltYawDeg), pitchOffsetDeg: pitch * CAMERA.tiltPitchDeg });
            expect(inside(t.twinBox, c.stage, 0)).toBe(true);
          }
        }
        expect(inside(b, { x: 0, y: 0, w: c.W, h: c.H })).toBe(true);
        // Bonnet tips (the twin's extreme axial points) are on canvas and in the stage.
        for (const face of [f.frontFace, f.rearFace]) {
          expect(face.x).toBeGreaterThan(c.stage.x);
          expect(face.x).toBeLessThan(c.stage.x + c.stage.w);
        }
        expect(f.vanishing).not.toBeNull();
      });
    }
  }
});

describe("workspace and job pages", () => {
  const W = 1208;
  const H = 809;
  const column: Rect = { x: 24, y: 0, w: 1160, h: 2000 };

  it("SECTION fits its swing + tilt envelope inside a workspace stage", () => {
    // .module-workspace-header text block (<= 520 px) at >= 1024 px: stage = right half, ~150 px tall.
    const stage: Rect = { x: 604, y: 0, w: 556, h: 150 };
    const inp = { pose: "section" as PoseName, canvasW: W, canvasH: H, stage, column, model, yawOffsetDeg: 0, pitchOffsetDeg: 0, rollDeg: 0 };
    expect(inside(swingEnvelope(inp), stage, POSE_PARAMS.stageFitPadPx)).toBe(true);
    expect(solveCamera(inp).twinBox.w).toBeGreaterThan(0.5 * stage.w);
  });

  it("TELEMETRY on job detail's one-row header uses the FACE emblem, not a 30 px twin", () => {
    // .detail-header-nav: 24 px padding + ~32 px button row + 20 px gap - 12 = ~64 px.
    const stage: Rect = { x: 604, y: 0, w: 556, h: 64 };
    expect(telemetryEmblem(stage)).toBe(true);
    const f = solveCamera({ pose: "telemetry", canvasW: W, canvasH: H, stage, column, model, yawOffsetDeg: 0, pitchOffsetDeg: 0, rollDeg: 0 });
    expect(f.targetSizePx).toBeGreaterThanOrEqual(48);
    expect(f.frontFace.radiusPx * 2).toBeGreaterThanOrEqual(40);
  });

  it("the stage fit never shrinks the shell below stageFitMinPx", () => {
    const stage: Rect = { x: 604, y: 0, w: 556, h: 60 };
    const f = solveCamera({ pose: "overview", canvasW: W, canvasH: H, stage, column, model, yawOffsetDeg: 0, pitchOffsetDeg: 0, rollDeg: 0 });
    expect(2 * f.shellRadiusPx).toBeGreaterThanOrEqual(POSE_PARAMS.stageFitMinPx - 1);
  });
});
