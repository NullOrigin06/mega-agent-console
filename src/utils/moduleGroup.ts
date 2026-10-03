import type { ModuleKind } from "../types/engineering";

/**
 * UI grouping of module kinds. The legacy "GeneralArrangement" job kind is
 * part of the single user-facing "Heat Exchanger" module (kind
 * "HeatExchangerFab"); every other kind groups as itself. Old GA jobs still
 * exist and keep opening, they just live in the Heat Exchanger group.
 */
export function moduleGroup(kind: ModuleKind): ModuleKind {
  return kind === "GeneralArrangement" ? "HeatExchangerFab" : kind;
}

/** True when both kinds belong to the same user-facing module. */
export function sameModuleGroup(a: ModuleKind, b: ModuleKind): boolean {
  return moduleGroup(a) === moduleGroup(b);
}
