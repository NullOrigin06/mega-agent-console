/**
 * Dependency-free store shared by the ambient background and the rest of the
 * app (useSyncExternalStore-compatible: subscribe + getSnapshot).
 *
 * - suspend/resume: anything that covers the background with its own heavy
 *   rendering or glass (the r3f twin, the command palette, modals) holds a
 *   reason while open; the engine stops rendering while any reason is held.
 *   Reasons are counted so two holders of the same reason don't cancel out.
 * - highlight: hover-linking from module tiles / Sidebar items.
 * - motion preference: persisted in localStorage (every access in try/catch,
 *   storage can throw in private windows); "auto" follows
 *   prefers-reduced-motion (and prefers-contrast: more) live.
 */
import type { AmbientMotionPref } from "../../ambient/types";
import type { ModuleKind } from "../../types/engineering";

export type AmbientSuspendReason = "twin3d" | "palette" | "modal";

export interface AmbientBusSnapshot {
  /** True while any suspend reason is held. */
  suspended: boolean;
  reasons: readonly AmbientSuspendReason[];
  highlight: ModuleKind | null;
  motionPref: AmbientMotionPref;
  reducedMotion: boolean;
  contrastMore: boolean;
  /** What the preference resolves to right now. */
  motion: "live" | "still";
  /**
   * False when nothing can move whatever the preference: the renderer is not
   * allowed (forced colours, jsdom) or the Canvas2D still replaced the engine.
   */
  motionAvailable: boolean;
}

export const MOTION_STORAGE_KEY = "mega.ambient.motion";

function readPref(): AmbientMotionPref {
  try {
    const raw = window.localStorage.getItem(MOTION_STORAGE_KEY);
    if (raw === "on" || raw === "off" || raw === "auto") return raw;
  } catch {
    // Storage blocked - fall through to the default.
  }
  return "auto";
}

function writePref(pref: AmbientMotionPref) {
  try {
    if (pref === "auto") window.localStorage.removeItem(MOTION_STORAGE_KEY);
    else window.localStorage.setItem(MOTION_STORAGE_KEY, pref);
  } catch {
    // Storage blocked - the preference just won't survive a reload.
  }
}

function query(media: string): MediaQueryList | null {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(media) : null;
  } catch {
    return null;
  }
}

const counts: Record<AmbientSuspendReason, number> = { twin3d: 0, palette: 0, modal: 0 };
const listeners = new Set<() => void>();
let highlighted: ModuleKind | null = null;
let pref: AmbientMotionPref | null = null;
let reducedMq: MediaQueryList | null | undefined;
let contrastMq: MediaQueryList | null | undefined;
let snapshot: AmbientBusSnapshot | null = null;
let available = true;

function ensureMedia() {
  if (reducedMq !== undefined) return;
  reducedMq = query("(prefers-reduced-motion: reduce)");
  contrastMq = query("(prefers-contrast: more)");
  const onChange = () => emit();
  reducedMq?.addEventListener?.("change", onChange);
  contrastMq?.addEventListener?.("change", onChange);
}

function build(): AmbientBusSnapshot {
  ensureMedia();
  if (pref === null) pref = readPref();
  const reasons = (Object.keys(counts) as AmbientSuspendReason[]).filter((r) => counts[r] > 0);
  const reducedMotion = Boolean(reducedMq?.matches);
  const contrastMore = Boolean(contrastMq?.matches);
  const motion = pref === "on" ? "live" : pref === "off" || reducedMotion || contrastMore ? "still" : "live";
  return { suspended: reasons.length > 0, reasons, highlight: highlighted, motionPref: pref, reducedMotion, contrastMore, motion, motionAvailable: available };
}

function emit() {
  snapshot = build();
  listeners.forEach((l) => l());
}

export const ambientBus = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot(): AmbientBusSnapshot {
    if (!snapshot) snapshot = build();
    return snapshot;
  },

  suspend(reason: AmbientSuspendReason) {
    counts[reason] += 1;
    if (counts[reason] === 1) emit();
  },

  resume(reason: AmbientSuspendReason) {
    if (counts[reason] === 0) return;
    counts[reason] -= 1;
    if (counts[reason] === 0) emit();
  },

  highlight(module: ModuleKind | null) {
    if (highlighted === module) return;
    highlighted = module;
    emit();
  },

  getMotionPref(): AmbientMotionPref {
    return ambientBus.getSnapshot().motionPref;
  },

  setMotionPref(next: AmbientMotionPref) {
    pref = next;
    writePref(next);
    emit();
  },

  /** Set by AmbientBackground / the controller: whether the renderer can animate at all. */
  setMotionAvailable(next: boolean) {
    if (available === next) return;
    available = next;
    emit();
  },

  /** Test helper: forget all in-memory state (storage is re-read lazily). */
  reset() {
    counts.twin3d = counts.palette = counts.modal = 0;
    highlighted = null;
    pref = null;
    available = true;
    snapshot = null;
  },
};
