import type { DrawingStatus } from "../types/engineering";

/** Drawing kinds a Heat Exchanger job can produce: fabrication or general arrangement. */
export type DrawingKind = "fab" | "ga";

export const DRAWING_KINDS: readonly DrawingKind[] = ["fab", "ga"];

export const DRAWING_LABELS: Record<DrawingKind, string> = {
  fab: "Fabrication Drawing",
  ga: "General Arrangement Drawing",
};

export interface DrawingCardInfo {
  kind: DrawingKind;
  label: string;
  status: DrawingStatus;
  error?: string;
}

/** Ticks/unticks one drawing; the result is always in canonical order (fab, ga), nothing is ticked by default. */
export function toggleDrawing(selected: readonly DrawingKind[], kind: DrawingKind, checked?: boolean): DrawingKind[] {
  const has = selected.includes(kind);
  const want = checked ?? !has;
  const next = new Set(selected);
  if (want) next.add(kind);
  else next.delete(kind);
  return DRAWING_KINDS.filter((k) => next.has(k));
}

/** Drops ticks for drawings that no longer exist (defensive) and orders them canonically. */
export function normalizeSelection(selected: readonly DrawingKind[]): DrawingKind[] {
  return DRAWING_KINDS.filter((k) => selected.includes(k));
}

export function isAnyDrawingGenerating(statuses: readonly DrawingStatus[]): boolean {
  return statuses.includes("generating");
}

/** "Generate selected drawings" is enabled only with at least one tick, an agent, and nothing generating. */
export function canGenerateSelected(opts: {
  selected: readonly DrawingKind[];
  statuses: readonly DrawingStatus[];
  isTriggering: boolean;
  hasAgent: boolean;
}): boolean {
  return opts.selected.length > 0 && opts.hasAgent && !opts.isTriggering && !isAnyDrawingGenerating(opts.statuses);
}

/** Per-card status caption: a ticked, already generated drawing is a re-generation. */
export function cardActionHint(status: DrawingStatus, ticked: boolean): string | null {
  if (!ticked) return null;
  if (status === "generated") return "Will be re-generated";
  if (status === "failed") return "Will be retried";
  return "Will be generated";
}
