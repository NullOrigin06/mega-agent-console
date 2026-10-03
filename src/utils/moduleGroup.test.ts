import { describe, it, expect } from "vitest";
import { moduleGroup, sameModuleGroup } from "./moduleGroup";

describe("moduleGroup", () => {
  it("folds legacy General Arrangement jobs into Heat Exchanger", () => {
    expect(moduleGroup("GeneralArrangement")).toBe("HeatExchangerFab");
    expect(moduleGroup("HeatExchangerFab")).toBe("HeatExchangerFab");
  });
  it("leaves every other module as itself", () => {
    for (const k of ["TubeSheet", "BonnetFlange", "ShopTank", "SiteTank"] as const) expect(moduleGroup(k)).toBe(k);
  });
  it("compares by group", () => {
    expect(sameModuleGroup("GeneralArrangement", "HeatExchangerFab")).toBe(true);
    expect(sameModuleGroup("GeneralArrangement", "TubeSheet")).toBe(false);
  });
});
