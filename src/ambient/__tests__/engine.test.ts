import { describe, expect, it, vi } from "vitest";
import createAmbientEngine from "../engine";
import { renderAmbientStill2D } from "../fallback2d";
import { toVesselModel } from "../twinGeometry";
import { TYPICAL_VESSEL } from "../../components/cad/vesselSpec";
import { COMMON, UBO } from "../shaders/common.glsl";

describe("ambient engine in jsdom (no WebGL)", () => {
  it("returns null and reports the fallback reason instead of throwing", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const onFallback = vi.fn();
    const engine = createAmbientEngine(document.createElement("canvas"), { onFallback });
    expect(engine).toBeNull();
    expect(onFallback).toHaveBeenCalledWith("no-webgl2");
    errors.mockRestore();
  });

  it("the Canvas2D still is a no-op without a 2D context", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const signals = { apiOk: true, running: 0, queued: 0, runningByModule: { TubeSheet: 0, BonnetFlange: 0, HeatExchangerFab: 0, ShopTank: 0, SiteTank: 0 }, activity: 0, ledger: [], agents: [], localAgentBusy: false };
    expect(() =>
      renderAmbientStill2D(document.createElement("canvas"), {
        state: { page: "modules", workspaceModule: null, highlight: null, signals },
        layout: { viewportW: 1440, viewportH: 900, canvas: { x: 232, y: 91, w: 1208, h: 809 }, stage: null, column: null, quiet: [], devicePixelRatio: 1, narrow: false, coarsePointer: false },
        vessel: toVesselModel(TYPICAL_VESSEL),
        scrollY: 0,
      }),
    ).not.toThrow();
    errors.mockRestore();
  });
});

describe("shared GLSL", () => {
  it("declares exactly the UBO slots the engine writes", () => {
    const block = /uniform S\{([^}]*)\}/.exec(COMMON)![1];
    let slots = 0;
    const at: Record<string, number> = {};
    for (const decl of block.split(";").filter(Boolean)) {
      const [type, names] = decl.trim().split(/\s+(.+)/);
      for (const n of names.split(",")) {
        const arr = /\[(\d+)\]/.exec(n);
        at[n.replace(/\[.*/, "")] = slots;
        slots += (type === "mat4" ? 4 : 1) * (arr ? Number(arr[1]) : 1);
      }
    }
    expect(slots).toBe(UBO.SIZE);
    for (const [name, slot] of Object.entries(UBO)) if (name !== "SIZE") expect([name, at[name]]).toEqual([name, slot]);
  });
});
