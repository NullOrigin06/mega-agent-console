import { describe, it, expect } from "vitest";
import { buildWorkspaceRequest, DEFAULT_WORKSPACE_FIELDS } from "./workspaceValidation";
import { getDefaultGaNozzleSchedule, NOZZLE_SIZES, NOZZLE_SIZES_GA } from "../constants/nozzleDefaults";
import { MODULE_OPTIONS } from "../constants/modules";
import type { ProjectInfo } from "../types/engineering";

const PROJECT: ProjectInfo = { customerName: "MEGA CLIENT", drawingTitle: "GENERAL ARRANGEMENT DRG FOR" };

describe("General Arrangement module", () => {
  it("is registered as an exchanger-family module with a preview and badge", () => {
    const ga = MODULE_OPTIONS.find((m) => m.kind === "GeneralArrangement");
    expect(ga).toBeTruthy();
    expect(ga?.family).toBe("exchanger");
    expect(ga?.badge).toBe("GA-DRG");
    expect(typeof ga?.preview).toBe("function");
  });

  it("starts from the reference condenser schedule, with positions left blank", () => {
    const nozzles = getDefaultGaNozzleSchedule();
    expect(nozzles.map((n) => n.nozzleNo)).toEqual(["N1", "N2", "N3", "N4", "N5", "N6", "N7"]);
    expect(nozzles.every((n) => (n.position ?? "") === "")).toBe(true);
    expect(nozzles.find((n) => n.nozzleNo === "N3")?.size).toBe("500");
    expect(NOZZLE_SIZES_GA).toContain("500");
    expect(NOZZLE_SIZES).not.toContain("500");      // the other modules keep the desktop form's list
  });

  it("sends the nozzle Position through to the API request", () => {
    const nozzles = getDefaultGaNozzleSchedule();
    nozzles[0] = { ...nozzles[0], position: "-307" };
    const res = buildWorkspaceRequest("GeneralArrangement", DEFAULT_WORKSPACE_FIELDS, PROJECT, nozzles);
    expect("request" in res).toBe(true);
    if ("request" in res) {
      expect(res.request.module).toBe("GeneralArrangement");
      expect(res.request.nozzles?.[0].position).toBe("-307");
    }
  });

  it("rejects a non-numeric GA Position but only for the GA module", () => {
    const nozzles = getDefaultGaNozzleSchedule();
    nozzles[1] = { ...nozzles[1], position: "abc" };
    const ga = buildWorkspaceRequest("GeneralArrangement", DEFAULT_WORKSPACE_FIELDS, PROJECT, nozzles);
    expect("error" in ga && ga.error).toMatch(/N2.*GA Position/);

    const hx = buildWorkspaceRequest("HeatExchangerFab", DEFAULT_WORKSPACE_FIELDS, PROJECT, nozzles);
    expect("request" in hx).toBe(true);
  });
});
