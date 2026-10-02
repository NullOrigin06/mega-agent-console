import { useEffect, useSyncExternalStore } from "react";
import type { ModuleKind } from "../../types/engineering";
import { ambientBus, type AmbientBusSnapshot, type AmbientSuspendReason } from "./ambientBus";

export function useAmbientBus(): AmbientBusSnapshot {
  return useSyncExternalStore(ambientBus.subscribe, ambientBus.getSnapshot, ambientBus.getSnapshot);
}

/** Hold an ambient suspend reason while `active` is true (released on unmount). */
export function useAmbientSuspend(reason: AmbientSuspendReason, active: boolean) {
  useEffect(() => {
    if (!active) return;
    ambientBus.suspend(reason);
    return () => ambientBus.resume(reason);
  }, [reason, active]);
}

/**
 * Hover-linking handlers for a module tile: the background brightens that
 * module's region while hovered. Cleared on unmount too, since a clicked
 * tile navigates away without ever seeing pointerleave.
 */
export function useAmbientHighlight(module: ModuleKind) {
  useEffect(
    () => () => {
      if (ambientBus.getSnapshot().highlight === module) ambientBus.highlight(null);
    },
    [module],
  );
  return {
    onPointerEnter: () => ambientBus.highlight(module),
    onPointerLeave: () => ambientBus.highlight(null),
  };
}
