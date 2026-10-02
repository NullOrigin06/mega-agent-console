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
export const MODULE_COLORS: Record<ModuleKind, string> = {
  TubeSheet: "#3987e5",
  BonnetFlange: "#d95926",
  HeatExchangerFab: "#199e70",
};

export const MODULE_SHORT_NAMES: Record<ModuleKind, string> = {
  TubeSheet: "Tube Sheet",
  BonnetFlange: "Bonnet Flange",
  HeatExchangerFab: "HX Fab",
};
