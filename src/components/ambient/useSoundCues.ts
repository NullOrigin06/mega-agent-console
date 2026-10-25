import { useEffect, useRef, useSyncExternalStore } from "react";
import type { JobSummary } from "../../types/engineering";
import { soundKit } from "./soundKit";

/** Controls that get a hover tick and a click tap. */
const INTERACTIVE = [
  "button:not(:disabled)",
  "a[href]",
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  "[cmdk-item]",
  ".job-row",
].join(",");

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(soundKit.subscribe, soundKit.isEnabled, soundKit.isEnabled);
}

/**
 * Wires the sound kit to the console: hover/click on any control, a low-pass
 * whoosh when the page changes, and a chime when a job finishes (a low tone
 * when it fails). The kit itself decides whether anything is audible (off by
 * default, silent while ambient motion is paused).
 */
export function useSoundCues({ pageKey, jobs }: { pageKey: string; jobs: JobSummary[] }) {
  // Hover and click, delegated from the document so every control is covered.
  useEffect(() => {
    let lastHovered: Element | null = null;
    const unlock = () => soundKit.unlock();
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = (e.target as Element | null)?.closest?.(INTERACTIVE) ?? null;
      if (el === lastHovered) return;
      lastHovered = el;
      if (el) soundKit.play("hover");
    };
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.(INTERACTIVE)) soundKit.play("click");
    };
    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("keydown", unlock, true);
    document.addEventListener("pointerover", onOver, { passive: true });
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", unlock, true);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  // Page change: whoosh (not on first mount).
  const lastPage = useRef<string | null>(null);
  useEffect(() => {
    if (lastPage.current !== null && lastPage.current !== pageKey) soundKit.play("whoosh");
    lastPage.current = pageKey;
  }, [pageKey]);

  // Job finished: chime on completed, low tone on failed. The first snapshot is a silent baseline.
  const known = useRef<Map<string, JobSummary["status"]> | null>(null);
  useEffect(() => {
    const prev = known.current;
    const next = new Map(jobs.map((j) => [j.id, j.status] as const));
    known.current = next;
    if (!prev) return;
    let completed = false;
    let failed = false;
    for (const j of jobs) {
      const before = prev.get(j.id);
      if (before !== "running" && before !== "queued") continue;
      if (j.status === "completed") completed = true;
      else if (j.status === "failed") failed = true;
    }
    // One cue per refresh, failure wins.
    if (failed) soundKit.play("failed");
    else if (completed) soundKit.play("complete");
  }, [jobs]);
}
