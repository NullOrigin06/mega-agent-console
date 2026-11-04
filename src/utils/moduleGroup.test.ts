import { describe, it, expect } from "vitest";
import { moduleGroup, sameModuleGroup } from "./moduleGroup";

describe("moduleGroup", () => {
  it("folds legacy General Arrangement, Tube Sheet and Bonnet Flange jobs into Heat Exchanger", () => {
    for (const k of ["GeneralArrangement", "TubeSheet", "BonnetFlange", "HeatExchangerFab"] as const) expect(moduleGroup(k)).toBe("HeatExchangerFab");
  });
  it("leaves the tanks as themselves", () => {
    for (const k of ["ShopTank", "SiteTank"] as const) expect(moduleGroup(k)).toBe(k);
  });
  it("compares by group", () => {
    expect(sameModuleGroup("GeneralArrangement", "HeatExchangerFab")).toBe(true);
    expect(sameModuleGroup("TubeSheet", "BonnetFlange")).toBe(true);
    expect(sameModuleGroup("TubeSheet", "ShopTank")).toBe(false);
  });
});
