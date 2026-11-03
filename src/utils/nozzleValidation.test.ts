import { describe, it, expect } from "vitest";
import { validateNozzles, buildWorkspaceRequest, DEFAULT_WORKSPACE_FIELDS } from "./workspaceValidation";
import { getDefaultNozzleSchedule } from "../constants/nozzleDefaults";
import type { NozzleItem } from "../types/engineering";

const row = (over: Partial<NozzleItem> = {}): NozzleItem => ({
  nozzleNo: "N1", size: "100", unit: "NB", schedule: "Sch 40", type: "LJFF", rating: "150#", projection: "250",
  service: "Process In", orientation: "0°", remark: "-", ...over,
});

describe("validateNozzles - the software's Nozzle Validation", () => {
  it("accepts the default schedule", () => {
    expect(validateNozzles(getDefaultNozzleSchedule())).toBeNull();
  });

  it("needs at least one nozzle", () => {
    expect(validateNozzles([])).toBe("At least one nozzle must be defined in the Nozzle Schedule before generating drawings.");
  });

  it.each([
    ["nozzleNo", "Nozzle No."],
    ["size", "Size NB/inch"],
    ["unit", "Nozzle Size Unit"],
    ["schedule", "SCH./THK."],
    ["type", "Type"],
    ["rating", "Rating"],
    ["projection", "Proj. From Centre"],
    ["service", "Service"],
    ["orientation", "Nozzle Orientation"],
  ] as const)("every column is required: %s", (key, name) => {
    expect(validateNozzles([row({ [key]: "  " })])).toContain(`'${name}' is required.`);
  });

  it("names the nozzle and row in the message", () => {
    expect(validateNozzles([row(), row({ nozzleNo: "N2", service: "" })])).toBe("Nozzle 'N2' (Row 2): 'Service' is required.");
  });

  it("a nozzle number may be used once only, whatever its case", () => {
    expect(validateNozzles([row(), row({ nozzleNo: "n1" })])).toBe("Nozzle 'n1' (Row 2): Nozzle No. 'n1' is used more than once.");
  });

  it("a plain-number size or projection must be greater than zero, text stays allowed", () => {
    expect(validateNozzles([row({ size: "0" })])).toContain("'Size NB/inch' must be greater than zero.");
    expect(validateNozzles([row({ projection: "-5" })])).toContain("'Proj. From Centre' must be greater than zero.");
    expect(validateNozzles([row({ size: "1/2", projection: "SEE DRG" })])).toBeNull();
  });
});

describe("the exchanger workspace request", () => {
  it("is refused with the nozzle problem, before anything is sent", () => {
    const res = buildWorkspaceRequest("TubeSheet", DEFAULT_WORKSPACE_FIELDS, {}, [row(), row()]);

    expect("error" in res && res.error).toContain("used more than once");
  });

  it("is built when the schedule is fine", () => {
    const res = buildWorkspaceRequest("BonnetFlange", DEFAULT_WORKSPACE_FIELDS, { date: "03-11-2026" }, getDefaultNozzleSchedule());

    expect("request" in res && res.request.projectInfo?.date).toBe("03-11-2026");
  });
});
