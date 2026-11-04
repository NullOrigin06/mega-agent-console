import { describe, it, expect } from "vitest";
import { createBlankTankNozzle } from "../tankNozzles";
import { createBlankNozzle } from "../nozzleDefaults";

describe("a new nozzle row", () => {
  it("starts on Sch 10S in every module", () => {
    expect(createBlankTankNozzle("ShopTank", "N20").schedule).toBe("Sch 10S");
    expect(createBlankTankNozzle("SiteTank", "N20").schedule).toBe("Sch 10S");
    expect(createBlankNozzle("N20").schedule).toBe("Sch 10S");
  });
});

describe("the starting nozzle schedules", () => {
  it("use Sch 10S throughout for the Heat Exchanger", async () => {
    const { getDefaultNozzleSchedule } = await import("../nozzleDefaults");
    expect(getDefaultNozzleSchedule().every((n) => n.schedule === "Sch 10S")).toBe(true);
  });
});
