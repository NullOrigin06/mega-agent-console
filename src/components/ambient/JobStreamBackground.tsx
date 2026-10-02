import { useEffect, useRef } from "react";
import type { JobSummary } from "../../types/engineering";
import { createJobStream, type JobStream } from "./jobStream";
import { useAmbientBus, useAmbientSuspend } from "./useAmbientBus";

interface JobStreamBackgroundProps {
  jobs: JobSummary[];
  apiOk: boolean;
}

/**
 * The Jobs Dashboard's own full-page background (see jobStream.ts). It sits
 * over the ambient root and suspends the holographic-twin engine while
 * mounted, so only one background renders at a time.
 */
export function JobStreamBackground({ jobs, apiOk }: JobStreamBackgroundProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stream = useRef<JobStream | null>(null);
  const { motion } = useAmbientBus();
  useAmbientSuspend("page", true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = createJobStream(canvas);
    if (!s) return;
    stream.current = s;
    // Cards on this page turn slightly translucent so the stream shows through (ambient.css).
    document.documentElement.dataset.jobstream = "on";

    // Start the canvas at the sidebar's right edge (it collapses / goes off-canvas on mobile).
    const sidebar = document.querySelector(".sidebar");
    const placeLeft = () => {
      const right = sidebar ? Math.max(0, sidebar.getBoundingClientRect().right) : 0;
      if (rootRef.current) rootRef.current.style.left = `${window.innerWidth <= 900 ? 0 : right}px`;
    };
    placeLeft();

    const measureQuiet = () => s.setQuiet([...document.querySelectorAll("[data-ambient-quiet]")].map((el) => el.getBoundingClientRect()).map((r) => {
      const c = canvas.getBoundingClientRect();
      return new DOMRect(r.left - c.left, r.top - c.top, r.width, r.height);
    }));
    let measureRaf = 0;
    const scheduleMeasure = () => {
      if (!measureRaf) measureRaf = requestAnimationFrame(() => ((measureRaf = 0), measureQuiet()));
    };
    const ro = new ResizeObserver(() => {
      placeLeft();
      s.resize();
      scheduleMeasure();
    });
    ro.observe(canvas);
    if (sidebar) ro.observe(sidebar);
    const onResize = () => placeLeft();
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("scroll", scheduleMeasure, { passive: true });
    const onPointer = (e: PointerEvent) => s.setPointer(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5);
    window.addEventListener("pointermove", onPointer, { passive: true });
    const settle = window.setTimeout(measureQuiet, 300);
    return () => {
      window.clearTimeout(settle);
      if (measureRaf) cancelAnimationFrame(measureRaf);
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      delete document.documentElement.dataset.jobstream;
      window.removeEventListener("scroll", scheduleMeasure);
      window.removeEventListener("pointermove", onPointer);
      s.destroy();
      stream.current = null;
    };
  }, []);

  useEffect(() => {
    stream.current?.setInput({ jobs, apiOk });
  }, [jobs, apiOk]);

  useEffect(() => {
    stream.current?.setMode(motion);
  }, [motion]);

  return (
    <div ref={rootRef} className="jobstream-root" aria-hidden="true" role="presentation">
      <canvas ref={canvasRef} className="jobstream-canvas" />
    </div>
  );
}
