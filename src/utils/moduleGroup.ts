import type { ModuleKind } from "../types/engineering";

/**
 * UI grouping of module kinds. The legacy "GeneralArrangement", "TubeSheet" and "BonnetFlange" job kinds are
 * part of the single user-facing "Heat Exchanger" module (kind "HeatExchangerFab"): they share its inputs and
 * its job now makes their drawings. Every other kind groups as itself. Old jobs still exist and keep opening,
 * they just live in the Heat Exchanger group.
 */
export function moduleGroup(kind: ModuleKind): ModuleKind {
  return kind === "GeneralArrangement" || kind === "TubeSheet" || kind === "BonnetFlange" ? "HeatExchangerFab" : kind;
}

/** True when both kinds belong to the same user-facing module. */
export function sameModuleGroup(a: ModuleKind, b: ModuleKind): boolean {
  return moduleGroup(a) === moduleGroup(b);
}
