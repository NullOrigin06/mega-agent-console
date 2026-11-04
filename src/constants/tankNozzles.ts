import type { NozzleItem, TankModuleKind } from "../types/engineering";
import { NOZZLE_RATINGS, NOZZLE_SCHEDULES, NOZZLE_TYPES } from "./nozzleDefaults";

/**
 * Nozzle schedules of the two tank modules - the same columns, lists and default rows as the desktop forms
 * (ShopTankDesignForm / SiteTankForm), so what is entered here is read exactly as in the software.
 */

// ---------------------------------------------------------------- Shop Tank

/** SG = sight glass, LG = level gauge, M = manhole. */
export const SHOP_TANK_NOZZLE_NUMBERS = ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9", "N10", "SG", "LG", "M1", "M2"];

/** "1/2" (inch) first, then the nominal bores the Shop Tank drawing has flange data for. */
export const SHOP_TANK_NOZZLE_SIZES = ["1/2", "15", "20", "25", "40", "50", "65", "80", "100", "125", "150", "200", "250", "300", "350", "400", "450", "500", "600"];

export const SHOP_TANK_LOCATIONS = ["Dish", "Shell"];

/** Size unit of a Shop Tank nozzle: nominal bore (mm) or inch. */
export const SHOP_TANK_UNITS = ["NB", "inch"];

/**
 * Defaults = the schedule of the Shop Tank template (editable / removable).
 * Elevation / Radius: Shell -> height above the bottom weld line (mm); Dish -> distance from the vessel centre (mm);
 * AUTO = shell I.D. / 2 - 150; "--" = none. N5 / N6 / SG / LG sit at fixed heights in the drawing template.
 */
export function getDefaultShopTankNozzles(): NozzleItem[] {
  const n = (nozzleNo: string, size: string, location: string, service: string, elevation: string, orientation: string): NozzleItem => ({
    nozzleNo, size, unit: "NB", schedule: "Sch 10S", type: "LJFF", rating: "150#", projection: "", service, orientation, remark: "-", location, elevation,
  });
  return [
    n("N1", "25", "Dish", "VENT TO CONDENSER", "--", "TOP"),
    n("N2", "100", "Dish", "CONDENSATE INLET(FROM REBOILER)", "AUTO", "270°"),
    n("N3", "25", "Dish", "CONDENSATE INLET(FROM VENT COND.)", "AUTO", "30°"),
    n("N4", "25", "Dish", "SPARE", "AUTO", "330°"),
    n("N5", "25", "Shell", "LEVEL INDICATOR (TOP)", "--", "135°"),
    n("N6", "25", "Shell", "LEVEL INDICATOR (BOTTOM)", "--", "135°"),
    n("N7", "100", "Dish", "OUTLET TO PUMP", "--", "BOTTOM"),
    n("N8", "40", "Shell", "DRAIN", "500", "90°"),
    n("N9", "25", "Shell", "INSTRUMENT", "900", "270°"),
    n("N10", "25", "Dish", "SPARE (ON DISH)", "AUTO", "180°"),
  ];
}

// ---------------------------------------------------------------- Site Tank

export const SITE_TANK_POSITIONS = ["ROOF", "SHELL"];

/** The software's Site Tank grid offers ApprovedNozzleData.Sizes: 1/2" and every bore up to 1000 NB. */
export const SITE_TANK_NOZZLE_SIZES = ["1/2", "15", "20", "25", "40", "50", "65", "80", "100", "125", "150", "200", "250", "300", "350", "400", "450", "500", "600", "700", "750", "800", "900", "1000"];

/** The approved fermentor schedule uses values the generic lists do not carry ("Sch 10s", "5 mm", "5 THK"). */
export const SITE_TANK_SCHEDULES = [...NOZZLE_SCHEDULES, "Sch 10s", "5 mm", "5 THK"];

export const SITE_TANK_NOZZLE_NUMBERS = [
  ...Array.from({ length: 50 }, (_, i) => `N${i + 1}`),
  "N9 A/B", "TW", "M1", "M2",
];

/** The approved Fermentor schedule (24-004-SFD-TK1331-32-FERMENTOR-R1), N1 - N17; same as the suite's SiteTankApprovedNozzles (every nozzle has a compass bearing, shell nozzles also an elevation). */
export function getDefaultSiteTankNozzles(): NozzleItem[] {
  const n = (
    nozzleNo: string, size: string, schedule: string, type: string, projection: string, service: string,
    position: string, orientation: string, elevation: string,
  ): NozzleItem => ({
    nozzleNo, size, unit: "NB", schedule, type, rating: "150#", projection, service, orientation, remark: "-", position, elevation,
  });
  return [
    n("N1", "250", "Sch 40", "SORF", "250", "CIP CLEANING NOZZLE INLET", "ROOF", "150°", "-"),
    n("N2", "500", "5 mm", "SORF", "500", "CO2 OUTLET", "ROOF", "35°", "-"),
    n("N3", "80", "Sch 10s", "SORF", "200", "SPENT WASH FEED", "ROOF", "90°", "-"),
    n("N4", "25", "Sch 10s", "SORF", "150", "NUTRIENT INLET", "ROOF", "60°", "-"),
    n("N5", "25", "Sch 10s", "SORF", "150", "ANTIFOAM INLET", "ROOF", "140°", "-"),
    n("N6", "25", "Sch 10s", "SORF", "150", "ACID INLET", "ROOF", "38°", "-"),
    n("N7", "25", "Sch 10s", "SORF", "150", "SPARE NOZZLE", "ROOF", "43°", "-"),
    n("N8", "125", "Sch 10s", "SORF", "200", "INLET FROM PRE-FREMENTOR", "ROOF", "132°", "-"),
    n("N9 A/B", "15", "5 THK", "SORF", "150", "FLUSHING FOR SG/LG", "ROOF", "72°", "-"),
    n("N10", "300", "Sch 10s", "LJFF", "4750", "RECIRCULATION INLET", "SHELL", "180°", "8500"),
    n("N11", "80", "Sch 10s", "SORF", "4725", "PROCESS AIR INLET", "SHELL", "125°", "665"),
    n("N12", "80", "Sch 10s", "SORF", "4700", "LEVEL TRANSMITTER", "SHELL", "90°", "300"),
    n("N13", "350", "Sch 10s", "LJFF", "4855", "OUTLET TO PUMP", "SHELL", "0°", "0"),
    n("N14", "25", "Sch 10s", "SORF", "4700", "SAMPLE POINT", "SHELL", "49°", "300"),
    n("N15", "200", "Sch 10s", "LJFF", "4700", "SAFETY SYSEM", "ROOF", "53°", "-"),
    n("N16", "250", "Sch 10s", "LJFF", "4700", "AGITATOR NOZZLE", "SHELL", "270°", "500"),
    n("N17", "150", "Sch 10s", "SORF", "200", "PROCESS WATER INLET", "ROOF", "180°", "-"),
  ];
}

// ---------------------------------------------------------------- shared

export function getDefaultTankNozzles(module: TankModuleKind): NozzleItem[] {
  return module === "ShopTank" ? getDefaultShopTankNozzles() : getDefaultSiteTankNozzles();
}

/** The next free nozzle number for "Add Nozzle". */
export function nextTankNozzleNo(module: TankModuleKind, nozzles: NozzleItem[]): string {
  const used = new Set(nozzles.map((n) => n.nozzleNo.trim().toUpperCase()));
  const pool = module === "ShopTank" ? SHOP_TANK_NOZZLE_NUMBERS : SITE_TANK_NOZZLE_NUMBERS;
  return pool.find((no) => !used.has(no.toUpperCase())) ?? `N${nozzles.length + 1}`;
}

/** A new row, like the desktop "Add Nozzle". */
export function createBlankTankNozzle(module: TankModuleKind, nozzleNo: string): NozzleItem {
  return module === "ShopTank"
    ? { nozzleNo, size: "50", unit: "NB", schedule: NOZZLE_SCHEDULES[0], type: "LJFF", rating: "150#", projection: "", service: "Process", orientation: "90°", remark: "-", location: "Shell", elevation: "500" }
    : { nozzleNo, size: "50", unit: "NB", schedule: NOZZLE_SCHEDULES[0], type: "SORF", rating: "150#", projection: "", service: "", orientation: "0°", remark: "-", position: "ROOF", elevation: "-" };
}

export { NOZZLE_RATINGS, NOZZLE_TYPES };
