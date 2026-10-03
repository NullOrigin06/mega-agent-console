import { describe, expect, it } from "vitest";
import { buildTankInputs, defaultTankValues, tankDerived } from "../tankFields";
import { mockTankResult } from "../../mocks/tankMock";
import type { ShopTankInputs, SiteTankInputs } from "../../types/engineering";

describe("tank form validation (desktop rules)", () => {
  it("accepts the desktop defaults", () => {
    expect("inputs" in buildTankInputs("ShopTank", defaultTankValues("ShopTank"))).toBe(true);
    expect("inputs" in buildTankInputs("SiteTank", defaultTankValues("SiteTank"))).toBe(true);
  });

  it("reports the desktop messages per field", () => {
    const r = buildTankInputs("ShopTank", { ...defaultTankValues("ShopTank"), shellHeight: "0", shellId: "5000" });
    expect(r).toEqual({ fieldErrors: { shellId: "Diameter Out of Range (300 - 3000 mm).", shellHeight: "Shell Height must be > 0." } });
    const s = buildTankInputs("SiteTank", { ...defaultTankValues("SiteTank"), topConeAngle: "90" });
    expect(s).toEqual({ fieldErrors: { topConeAngle: "Cone angle must be between 0 and 90°." } });
  });

  it("forces stiffeners to 0 when Atmospheric (field hidden)", () => {
    const r = buildTankInputs("ShopTank", { ...defaultTankValues("ShopTank"), noOfStiffeners: "3" });
    expect("inputs" in r && (r.inputs as ShopTankInputs).noOfStiffeners).toBe(0);
    const v = buildTankInputs("ShopTank", { ...defaultTankValues("ShopTank"), designPressureType: "Full Vacuum", noOfStiffeners: "3" });
    expect("inputs" in v && (v.inputs as ShopTankInputs).noOfStiffeners).toBe(3);
  });

  it("derives H/D and volume like the desktop read-only boxes", () => {
    expect(tankDerived("ShopTank", { shellId: "1200", shellHeight: "1500" })).toEqual([
      { label: "H/D Ratio", value: "1.250" },
      { label: "Design Volume", value: "1.696", unit: "m³" },
    ]);
  });
});

describe("mock tank calculations match the desktop baselines", () => {
  it("Site Tank 675 m³ / 1500 / 1.15 -> ID 9100, H 10500, 7 courses", () => {
    const inputs = (buildTankInputs("SiteTank", defaultTankValues("SiteTank")) as { inputs: SiteTankInputs }).inputs;
    const r = mockTankResult({ module: "SiteTank", siteTank: inputs });
    const get = (k: string) => r.tankData.parameters.find((p) => p.key === k)?.actual;
    expect(r.shellId).toBe(9100);
    expect(get("TANK_HEIGHT")).toBe("10500.00");
    expect(get("NO_OF_FULL_COURSES")).toBe("7");
    expect(get("BOTTOM_SLOPE_ANGLE")).toBe("2.29");
  });

  it("Shop Tank 1200 x 1500 Atmospheric -> chart band 1200-1299", () => {
    const inputs = (buildTankInputs("ShopTank", defaultTankValues("ShopTank")) as { inputs: ShopTankInputs }).inputs;
    const r = mockTankResult({ module: "ShopTank", shopTank: inputs });
    const get = (k: string) => r.tankData.parameters.find((p) => p.key === k)?.actual;
    expect([get("SHELL_THK"), get("TOP_DISH_THK"), get("NO_OF_LEGS"), get("LEG_PIPE_SIZE")]).toEqual(["3", "4", "4", "80"]);
    expect(r.bom).toHaveLength(4);
  });
});
