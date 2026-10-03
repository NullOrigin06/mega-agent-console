import { useEffect, useRef, useState } from "react";
import type { JobSummary, TankModuleKind } from "../../types/engineering";

export type HologramEventType = "dispatch" | "complete" | "fail";
export interface HologramEvent {
  type: HologramEventType;
  /** performance.now() when it happened (also makes repeated events distinct). */
  at: number;
}

/**
 * Live activity for one tank module, derived from the polled job list - the
 * tank hologram's equivalent of the ambient engine's useAmbientSignals:
 * `running` while a job of this module is queued/running, plus one event per
 * status transition seen after the first (silent) snapshot.
 */
export function useTankActivity(module: TankModuleKind, jobs: JobSummary[]): { running: boolean; event: HologramEvent | null } {
  const seen = useRef<Map<string, JobSummary["status"]> | null>(null);
  const [event, setEvent] = useState<HologramEvent | null>(null);
  const mine = jobs.filter((j) => j.module === module);
  const running = mine.some((j) => j.status === "running" || j.status === "queued");

  useEffect(() => {
    const prev = seen.current;
    const next = new Map(mine.map((j) => [j.id, j.status] as const));
    seen.current = next;
    if (!prev) return; // first snapshot: baseline only
    let type: HologramEventType | null = null;
    for (const [id, status] of next) {
      const before = prev.get(id);
      if (status === before) continue;
      if (status === "failed") type = "fail";
      else if (status === "completed" && type !== "fail") type = "complete";
      else if ((status === "running" || status === "queued") && !type) type = "dispatch";
    }
    if (type) setEvent({ type, at: performance.now() });
    // Re-run only when this module's statuses change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine.map((j) => `${j.id}:${j.status}`).join("|")]);

  return { running, event };
}
