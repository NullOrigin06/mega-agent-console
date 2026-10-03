import { useEffect, useRef } from "react";
import type { Polyline } from "./tankHologramGeometry";
import type { HologramEvent } from "../modules/useTankActivity";
import { useAmbientBus } from "../ambient/useAmbientBus";

interface TankHologramProps {
  wire: Polyline[];
  /** A job of this module is queued/running: faster turn, brighter, frequent scans. */
  running?: boolean;
  /** Latest job transition: dispatch pulse, emerald completion pass, rose failure ring. */
  event?: HologramEvent | null;
  className?: string;
}

const EVENT_SEC = { dispatch: 1.2, complete: 2.4, fail: 1.4 } as const;
const PITCH = -0.38;
/** Long camera: little perspective distortion (a site tank must not read as a cone). */
const CAM_D = 14;
const BAND_TOP_PX = 20;
const BAND_TUCK_PX = 12;

interface Fit {
  cy: number;
  ext: number;
  maxR: number;
  modelMinY: number;
  modelMaxY: number;
  /** Projected outline at unit scale, union over a full turn. */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function measureFit(lines: Polyline[]): Fit {
  let modelMinY = Infinity;
  let modelMaxY = -Infinity;
  let maxR = 0;
  for (const l of lines) for (const [x, y, z] of l.pts) {
    modelMinY = Math.min(modelMinY, y);
    modelMaxY = Math.max(modelMaxY, y);
    maxR = Math.max(maxR, Math.hypot(x, z));
  }
  const cy = (modelMinY + modelMaxY) / 2;
  const ext = Math.max((modelMaxY - modelMinY) / 2, maxR) || 1;
  const cosP = Math.cos(PITCH);
  const sinP = Math.sin(PITCH);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < 12; i++) {
    const yw = (i / 12) * Math.PI * 2;
    const c = Math.cos(yw), sn = Math.sin(yw);
    for (const l of lines) for (const [x, y, z] of l.pts) {
      const xs = x / ext, ys = (y - cy) / ext, zs = z / ext;
      const x1 = xs * c - zs * sn;
      const z1 = xs * sn + zs * c;
      const y2 = ys * cosP - z1 * sinP;
      const z2 = ys * sinP + z1 * cosP;
      const k = 1 / (CAM_D - z2);
      minX = Math.min(minX, x1 * k); maxX = Math.max(maxX, x1 * k);
      minY = Math.min(minY, y2 * k); maxY = Math.max(maxY, y2 * k);
    }
  }
  return { cy, ext, maxR, modelMinY, modelMaxY, minX, maxX, minY, maxY };
}
const SCROLL_FADE_PX = 280;

/**
 * Holographic wireframe of a storage tank - the tank counterpart of the
 * exchanger twin in the ambient background: cyan depth-faded lines with
 * brighter silhouettes, a slow turn, a sweeping scan band, scanlines and a
 * few drifting particles. Canvas2D (runs everywhere), 30 fps cap, pauses
 * with the tab hidden and holds still when ambient motion is off/reduced.
 */
export function TankHologram({ wire, running = false, event = null, className = "" }: TankHologramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wireRef = useRef(wire);
  const { motion } = useAmbientBus();
  const runningRef = useRef(running);
  const eventRef = useRef<{ type: HologramEvent["type"]; startT: number | null } | null>(null);
  const stillKey = motion === "live" ? null : `${wire.length}:${running}:${event?.at ?? 0}`;
  useEffect(() => {
    wireRef.current = wire;
  }, [wire]);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);
  useEffect(() => {
    // startT is stamped on the next frame with the hologram's own clock.
    if (event) eventRef.current = { type: event.type, startT: null };
  }, [event]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let acc = 0;
    let t = 0;
    let yaw = 0.6;
    let boost = runningRef.current ? 1 : 0;
    let dt = 0;
    const live = motion === "live";
    let fitFor: Polyline[] | null = null;
    let fit = measureFit(wireRef.current);
    const particles = Array.from({ length: 40 }, (_, i) => ({ a: (i * 2.399) % (Math.PI * 2), r: 0.15 + ((i * 37) % 70) / 100, y: ((i * 53) % 100) / 100, v: 0.04 + ((i * 17) % 10) / 200 }));

    // Pinned like the ambient exchanger: fixed at the spot it occupies at scroll 0
    // beside the page header, fading as the page scrolls under it.
    const place = () => {
      const host = canvas.parentElement;
      if (!host) return;
      const r = host.getBoundingClientRect();
      // Band = from just above the workspace to a little past the header (the first card tucks over it).
      const header = host.querySelector(".module-workspace-header");
      const bandH = header ? header.getBoundingClientRect().bottom - r.top + BAND_TUCK_PX + BAND_TOP_PX : 250;
      canvas.style.top = `${r.top + window.scrollY - BAND_TOP_PX}px`;
      canvas.style.height = `${Math.round(Math.max(200, bandH))}px`;
      canvas.style.right = `${Math.max(0, window.innerWidth - r.right + r.width * 0.02)}px`;
      fade();
    };
    const fade = () => {
      const k = Math.min(1, Math.max(0, window.scrollY / SCROLL_FADE_PX));
      canvas.style.opacity = String(1 - 0.75 * k * k * (3 - 2 * k));
    };
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      const lines = wireRef.current;
      ctx.clearRect(0, 0, w, h);
      // Fit to the real projected outline, measured over a full turn (cached per
      // geometry) so the model fills the band without pulsing as it rotates.
      if (fitFor !== lines) {
        fitFor = lines;
        fit = measureFit(lines);
      }
      const { cy, ext, minX, maxX, minY: pMinY, maxY: pMaxY, modelMinY: minY, modelMaxY: maxY, maxR } = fit;
      const cosP = Math.cos(PITCH);
      const sinP = Math.sin(PITCH);
      const scale = Math.min((0.92 * h) / (pMaxY - pMinY), (0.92 * w) / (maxX - minX));
      const ox = w / 2 - ((minX + maxX) / 2) * scale;
      const oy = h / 2 + ((pMinY + pMaxY) / 2) * scale;
      const project = (x: number, y: number, z: number): [number, number, number] => {
        const xs = x / ext;
        const ys = (y - cy) / ext;
        const zs = z / ext;
        const x1 = xs * cosY - zs * sinY;
        const z1 = xs * sinY + zs * cosY;
        const y2 = ys * cosP - z1 * sinP;
        const z2 = ys * sinP + z1 * cosP;
        const k = scale / (CAM_D - z2);
        return [ox + x1 * k, oy - y2 * k, z2];
      };
      boost += ((runningRef.current ? 1 : 0) - boost) * Math.min(1, dt * 1.5);
      yaw += dt * (0.18 + 0.32 * boost);
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const band = ((t * 0.22 * (1 + boost)) % 1.4) - 0.2; // scan band position, 0 = top .. 1 = bottom
      const ev = eventRef.current;
      if (ev && ev.startT === null) ev.startT = t;
      const evAge = ev && ev.startT !== null ? t - ev.startT : Infinity;
      const evOn = ev ? evAge < EVENT_SEC[ev.type] : false;
      if (ev && !evOn && evAge !== Infinity) eventRef.current = null;
      // Completion: an emerald pass sweeping down the tank.
      const passY = ev?.type === "complete" && evOn ? evAge / EVENT_SEC.complete : -9;
      const gain = 1 + 0.25 * boost;
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const l of lines) {
        const base = l.cls === 1 ? 0.8 : l.cls === 2 ? 0.22 : 0.46;
        const color = l.cls === 1 ? "103,232,249" : "6,182,212";
        let prev: [number, number, number] | null = null;
        for (const p of l.pts) {
          const q = project(p[0], p[1], p[2]);
          if (prev) {
            const depth = (prev[2] + q[2]) / 2; // -1 far .. +1 near
            const yN = ((prev[1] + q[1]) / 2) / h;
            const inBand = Math.exp(-(((yN - band) / 0.07) ** 2));
            const inPass = Math.exp(-(((yN - passY) / 0.06) ** 2));
            const a = Math.min(0.95, base * gain * (0.45 + 0.55 * (depth + 1) / 2) + inBand * 0.35 + inPass * 0.5);
            const c = inPass > 0.35 ? "52,211,153" : inBand > 0.4 ? "165,243,252" : color;
            ctx.strokeStyle = `rgba(${c},${a.toFixed(3)})`;
            ctx.lineWidth = l.cls === 1 ? 1.4 : 1;
            ctx.beginPath();
            ctx.moveTo(prev[0], prev[1]);
            ctx.lineTo(q[0], q[1]);
            ctx.stroke();
          }
          prev = q;
        }
      }
      // Drifting particles inside the shell (process fluid).
      for (const pa of particles) {
        const yy = minY + ((pa.y + t * pa.v) % 1) * (maxY - minY) * 0.8 + (maxY - minY) * 0.1;
        const a = pa.a + t * 0.3;
        const rr = pa.r * maxR * 0.85;
        const q = project(Math.cos(a) * rr, yy, Math.sin(a) * rr);
        ctx.fillStyle = `rgba(147,197,253,${(0.25 + 0.35 * (q[2] + 1) / 2).toFixed(3)})`;
        ctx.fillRect(q[0] - 1, q[1] - 1, 2, 2);
      }
      // Dispatch pulse (cyan) / failure ring (rose): one rise and fall, never a flash.
      if (ev && evOn && ev.type !== "complete") {
        const k = evAge / EVENT_SEC[ev.type];
        const rgb = ev.type === "fail" ? "239,68,68" : "103,232,249";
        ctx.strokeStyle = `rgba(${rgb},${(0.55 * (1 - k)).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, (0.15 + 0.5 * k) * Math.min(w, h), (0.06 + 0.2 * k) * Math.min(w, h), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      for (let y = (t * 6) % 4; y < h; y += 4) ctx.fillRect(0, y, w, 1.2);
      ctx.globalCompositeOperation = "source-over";
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const step = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      acc += step;
      if (acc < 1 / 30 - 0.002) return;
      t += acc;
      dt = acc;
      acc = 0;
      draw();
    };
    const start = () => {
      if (!raf && live && !document.hidden) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVis = () => (document.hidden ? stop() : start());
    const ro = new ResizeObserver(() => {
      place();
      resize();
      draw();
    });
    ro.observe(canvas);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    window.addEventListener("scroll", fade, { passive: true });
    window.addEventListener("resize", place, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    place();
    resize();
    draw();
    start();
    return () => {
      stop();
      ro.disconnect();
      window.removeEventListener("scroll", fade);
      window.removeEventListener("resize", place);
      document.removeEventListener("visibilitychange", onVis);
    };
    // Live mode reads the latest geometry from wireRef each frame; a still frame
    // re-renders when the geometry changes.
  }, [motion, stillKey]);

  return <canvas ref={canvasRef} className={`tank-hologram ${className}`} aria-hidden="true" />;
}
