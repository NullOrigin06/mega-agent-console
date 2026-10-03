import { describe, it, expect } from "vitest";
import { buildWorkspaceRequest, DEFAULT_WORKSPACE_FIELDS } from "./workspaceValidation";
import { getDefaultNozzleSchedule, NOZZLE_SIZES, NOZZLE_SIZES_GA } from "../constants/nozzleDefaults";
import { MODULE_OPTIONS } from "../constants/modules";
import type { ProjectInfo } from "../types/engineering";

const PROJECT: ProjectInfo = { customerName: "MEGA CLIENT", drawingTitle: "HEAT EXCHANGER" };

describe("merged Heat Exchanger module", () => {
  it("is the only registry entry for the HX/GA pair", () => {
    expect(MODULE_OPTIONS.find((m) => m.kind === "GeneralArrangement")).toBeUndefined();
    const hx = MODULE_OPTIONS.find((m) => m.kind === "HeatExchangerFab");
    expect(hx?.title).toBe("Heat Exchanger");
    expect(hx?.badge).toBe("HX-FAB / GA");
    expect(hx?.family).toBe("exchanger");
    expect(typeof hx?.preview).toBe("function");
    expect(hx?.description).toMatch(/general-arrangement/i);
  });

  it("offers the larger nozzle sizes only through the GA list", () => {
    expect(NOZZLE_SIZES_GA).toContain("500");
    expect(NOZZLE_SIZES).not.toContain("500");
  });

  it("sends nozzle Position and GA title-block values through, with module HeatExchangerFab", () => {
    const nozzles = getDefaultNozzleSchedule();
    nozzles[0] = { ...nozzles[0], position: "-307" };
    const res = buildWorkspaceRequest(
      "HeatExchangerFab", DEFAULT_WORKSPACE_FIELDS,
      { ...PROJECT, gaDrawingNo: "25-005-GAD-1", gaDrawingTitle: "" }, nozzles
    );
    expect("request" in res).toBe(true);
    if ("request" in res) {
      expect(res.request.module).toBe("HeatExchangerFab");
      expect(res.request.nozzles?.[0].position).toBe("-307");
      expect(res.request.projectInfo?.gaDrawingNo).toBe("25-005-GAD-1");
      expect(res.request.projectInfo).not.toHaveProperty("gaDrawingTitle"); // blank values are dropped
    }
  });

  it("rejects a non-numeric GA Position for Heat Exchanger but not for other modules", () => {
    const nozzles = getDefaultNozzleSchedule();
    nozzles[1] = { ...nozzles[1], position: "abc" };
    const hx = buildWorkspaceRequest("HeatExchangerFab", DEFAULT_WORKSPACE_FIELDS, PROJECT, nozzles);
    expect("error" in hx && hx.error).toMatch(/N2.*GA Position/);
    const ts = buildWorkspaceRequest("TubeSheet", DEFAULT_WORKSPACE_FIELDS, PROJECT, nozzles);
    expect("request" in ts).toBe(true);
  });

  it("accepts blank and numeric positions", () => {
    const nozzles = getDefaultNozzleSchedule();
    nozzles[0] = { ...nozzles[0], position: " 120.5 " };
    nozzles[1] = { ...nozzles[1], position: "" };
    expect("request" in buildWorkspaceRequest("HeatExchangerFab", DEFAULT_WORKSPACE_FIELDS, PROJECT, nozzles)).toBe(true);
  });
});
