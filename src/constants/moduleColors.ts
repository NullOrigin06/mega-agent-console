import type { ModuleKind } from "../types/engineering";

/**
 * One fixed colour per module, shared by every chart and the 3D twin so a
 * module reads the same everywhere. Colour follows the module, never its
 * rank or position, so filtering never repaints the survivors.
 *
 * These are the data-viz reference palette's first three categorical slots
 * (dark-surface steps), validated all-pairs against this app's card surface
 * (#131c30): every check passes, worst CVD ΔE 9.4, worst normal-vision ΔE
 * 20.9. The app's own accent blue/purple fail that check (ΔE 1.3 for
 * deuteranopia) - don't swap them in.
 */
/** Shared chart colour for both storage-tank modules (neutral slate, >= 3:1 on #131c30). */
export const TANK_COLOR = "#8b97ab";

export const MODULE_COLORS: Record<ModuleKind, string> = {
  TubeSheet: "#3987e5",
  BonnetFlange: "#d95926",
  HeatExchangerFab: "#199e70",
  // Same vessel family as the heat exchanger: shares its colour (a fourth hue fails the CVD checks above);
  // tooltips and the table view still name the exact module.
  GeneralArrangement: "#199e70",
  // Past three categories no ordering of the palette stays distinguishable
  // all-pairs (validated: 5 hues fail CVD + normal-vision floors), so the two
  // storage tanks fold into one neutral "Storage tanks" colour; tooltips and
  // the table view still name the exact module.
  ShopTank: TANK_COLOR,
  SiteTank: TANK_COLOR,
};

export const MODULE_SHORT_NAMES: Record<ModuleKind, string> = {
  TubeSheet: "Tube Sheet",
  BonnetFlange: "Bonnet Flange",
  HeatExchangerFab: "Heat Exchanger",
  // Legacy GA jobs are grouped under Heat Exchanger (see utils/moduleGroup.ts).
  GeneralArrangement: "Heat Exchanger",
  ShopTank: "Shop Tank",
  SiteTank: "Site Tank",
};
