/**
 * "Job pipeline stream" - the Jobs Dashboard background.
 *
 * Faint horizontal lanes run across the whole page, split into three zones
 * (queued | running | done). Every real job is a bright packet in its
 * zone: queued jobs idle in the intake, running jobs travel the running
 * zone, and a completion or failure plays out as the packet leaves. Dim
 * "throughput" packets keep the stream alive between events, denser and
 * faster while work is running.
 *
 * Canvas2D on purpose: it runs in every browser (no WebGL caveats), costs a
 * few hundred draw calls per frame and allocates nothing per frame.
 */
import type { JobSummary } from "../../types/engineering";

export interface JobStreamInput {
  jobs: JobSummary[];
  apiOk: boolean;
}

export interface JobStream {
  setInput(input: JobStreamInput): void;
  /** Rects (viewport px) whose text sits on the background; packets dim there. */
  setQuiet(rects: DOMRect[]): void;
  setMode(mode: "live" | "still"): void;
  setPointer(nx: number, ny: number): void;
  resize(): void;
  destroy(): void;
}

const BG = "#05070d";
const STATUS = {
  queued: [255, 190, 30],
  running: [50, 235, 255],
  done: [60, 255, 170],
  failed: [255, 70, 90],
  offline: [107, 122, 148],
} as const;
type Rgb = readonly [number, number, number];

/** Throughput packets pick a tone from their zone's palette, so each zone reads as a family of colours, not one. */
const TONES: readonly (readonly Rgb[])[] = [
  [[255, 190, 30], [255, 140, 40], [255, 225, 80]], // queued: amber, orange, yellow
  [[50, 235, 255], [70, 140, 255], [165, 110, 255], [255, 90, 210]], // running: cyan, blue, violet, magenta
  [[60, 255, 170], [120, 255, 110], [40, 240, 220]], // done: mint, green, teal
];
/** 0 streak, 1 dot, 2 diamond, 3 twin streak */
const KINDS = [0, 0, 0, 1, 1, 2, 3, 3] as const;

const LANE_GAP = 54; // px between lanes
const ZONE_Q = 0.32; // queued | running split, fraction of width
const ZONE_R = 0.66; // running | done split
const SPEED = { queued: 62, running: 160, done: 270 }; // px/s for throughput packets
const FPS = 30;
const FPS_IDLE = 15; // nothing running or queued: the stream keeps going, at half the frame rate
const MAX_DPR = 1.5;
const FILLER_BASE = 38;
const FILLER_PER_RUNNING = 9;
const FILLER_MAX = 76;
const FILLER_IDLE = 22;
const SPAWN_RATE = 5; // filler spawn probability per second, per missing packet slot
/** The first fold gets a brighter stream: up to +60% at the top, back to normal by 45% of the height. */
const TOP_BAND = 0.45;
const TOP_BOOST = 0.6;

interface Packet {
  lane: number;
  x: number;
  len: number;
  /** per-packet speed multiplier */
  v: number;
  /** shape (see KINDS), palette tone within the zone, and size multiplier */
  kind: number;
  tone: number;
  sz: number;
  /** "filler" packets flow through every zone; tracked ones belong to a job. */
  jobId: string | null;
  phase: "queued" | "running" | "exit" | "fail";
  /** 0..1 fade for exits / failures, 1 = fully visible */
  life: number;
  failAt: number; // x where a failing filler packet dies, or -1
  ring: number; // >0 while an event ring is expanding (0..1)
  ringX: number;
}

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

function rgba(c: Rgb, a: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
}

export function createJobStream(canvas: HTMLCanvasElement): JobStream | null {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;
  const g: CanvasRenderingContext2D = ctx;

  let w = 0;
  let h = 0;
  let lanes = 0;
  let mode: "live" | "still" = "live";
  let input: JobStreamInput = { jobs: [], apiOk: true };
  let quiet: DOMRect[] = [];
  let px = 0;
  let py = 0;
  let tx = 0;
  let ty = 0;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let flow = 1; // eased speed multiplier (0 when offline)
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const packets: Packet[] = [];
  const known = new Map<string, JobSummary["status"]>();
  let baselined = false;

  const running = () => input.jobs.filter((j) => j.status === "running").length;
  const busy = () => input.jobs.some((j) => j.status === "running" || j.status === "queued");
  const fillerTarget = () => (busy() ? Math.min(FILLER_MAX, FILLER_BASE + FILLER_PER_RUNNING * running()) : FILLER_IDLE);
  const topBoost = (y: number) => 1 + TOP_BOOST * Math.max(0, 1 - y / (h * TOP_BAND));

  const newFiller = (x?: number): Packet => ({
    lane: Math.floor(rnd() * Math.max(1, lanes)),
    x: x ?? -20 - rnd() * w * 0.3,
    len: 6 + rnd() * 20,
    v: 0.55 + rnd() * 1.4,
    kind: KINDS[Math.floor(rnd() * KINDS.length)],
    tone: Math.floor(rnd() * 12),
    sz: 0.8 + rnd() * 1.0,
    jobId: null,
    phase: "queued",
    life: 1,
    failAt: rnd() < 0.06 ? w * (ZONE_R - 0.04 - rnd() * 0.1) : -1,
    ring: 0,
    ringX: 0,
  });

  const laneY = (lane: number) => (lane + 0.5) * (h / Math.max(1, lanes));

  /** Diff jobs into tracked packets (first snapshot is a silent baseline). */
  const syncJobs = () => {
    const seen = new Set<string>();
    for (const j of input.jobs) {
      seen.add(j.id);
      const prev = known.get(j.id);
      known.set(j.id, j.status);
      let p = packets.find((q) => q.jobId === j.id);
      const lane = hash(j.id) % Math.max(1, lanes);
      if (j.status === "queued" || j.status === "running") {
        if (!p) {
          p = {
            lane,
            x: j.status === "queued" ? (baselined ? -20 : w * (0.06 + (hash(j.id) % 100) / 100 * 0.2)) : w * (ZONE_Q + (hash(j.id) % 100) / 100 * (ZONE_R - ZONE_Q)),
            len: 16,
            v: 1,
            kind: 0,
            tone: 0,
            sz: 1.5,
            jobId: j.id,
            phase: j.status,
            life: 1,
            failAt: -1,
            ring: 0,
            ringX: 0,
          };
          packets.push(p);
        }
        p.phase = j.status;
      } else if (p && (prev === "running" || prev === "queued")) {
        // Transition seen live: play the exit.
        p.phase = j.status === "completed" ? "exit" : "fail";
        p.ring = 1;
        p.ringX = p.x;
      } else if (p && p.phase !== "exit" && p.phase !== "fail") {
        p.phase = j.status === "completed" ? "exit" : "fail";
      }
    }
    // Jobs that vanished (deleted): let their packets leave quietly.
    for (const p of packets) if (p.jobId && !seen.has(p.jobId) && p.phase !== "fail") p.phase = "exit";
    baselined = true;
  };

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    w = Math.max(1, r.width);
    h = Math.max(1, r.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    lanes = Math.max(4, Math.floor(h / LANE_GAP));
    // Seed an evenly spread stream so the first frame is already "running".
    seed = 7;
    for (let i = packets.length - 1; i >= 0; i--) if (!packets[i].jobId) packets.splice(i, 1);
    for (let i = 0; i < fillerTarget(); i++) packets.push(newFiller(rnd() * w));
    for (const p of packets) p.lane = p.jobId ? hash(p.jobId) % lanes : p.lane % lanes;
    draw(0);
  };

  const quietAt = (x: number, y: number): number => {
    for (const q of quiet) {
      const dx = Math.max(q.left - 24 - x, 0, x - (q.right + 24));
      const dy = Math.max(q.top - 16 - y, 0, y - (q.bottom + 16));
      const d = Math.hypot(dx, dy);
      if (d < 40) return 0.15 + 0.85 * (d / 40);
    }
    return 1;
  };

  const zoneColour = (x: number, tone: number): Rgb => {
    const palette = TONES[x < w * ZONE_Q ? 0 : x < w * ZONE_R ? 1 : 2];
    return palette[tone % palette.length];
  };

  const step = (dt: number) => {
    const target = input.apiOk ? 1 + Math.min(0.9, 0.25 * running()) : 0;
    flow += (target - flow) * Math.min(1, dt * 1.5);
    for (let i = packets.length - 1; i >= 0; i--) {
      const p = packets[i];
      if (p.ring > 0) p.ring = Math.max(0, p.ring - dt / 1.2);
      if (p.jobId) {
        if (p.phase === "queued") {
          // Idle in the intake, drifting gently.
          const home = w * 0.18;
          p.x += ((home - p.x) * 0.4 + Math.sin(performance.now() / 1400 + p.lane) * 6) * dt * flow;
        } else if (p.phase === "running") {
          p.x += SPEED.running * 0.8 * dt * flow;
          if (p.x > w * ZONE_R - 10) p.x = w * ZONE_Q + 10; // loop the running zone
        } else if (p.phase === "exit") {
          p.x += SPEED.done * 1.6 * dt * Math.max(flow, 0.6);
          if (p.x > w + 40) packets.splice(i, 1);
        } else {
          p.life -= dt / 1.4;
          if (p.life <= 0) packets.splice(i, 1);
        }
        continue;
      }
      const zone = p.x < w * ZONE_Q ? SPEED.queued : p.x < w * ZONE_R ? SPEED.running : SPEED.done;
      if (p.phase === "fail") {
        p.life -= dt / 1.1;
        if (p.life <= 0) packets.splice(i, 1);
        continue;
      }
      p.x += zone * p.v * dt * flow;
      if (p.failAt > 0 && p.x >= p.failAt) {
        p.phase = "fail";
        p.ring = 1;
        p.ringX = p.x;
      } else if (p.x > w + 30) {
        packets.splice(i, 1);
      }
    }
    let fillers = 0;
    for (const p of packets) if (!p.jobId) fillers++;
    if (input.apiOk && fillers < fillerTarget() && rnd() < dt * SPAWN_RATE) packets.push(newFiller());
  };

  const draw = (t: number) => {
    px += (tx - px) * 0.06;
    py += (ty - py) * 0.06;
    const ox = px * -6;
    const oy = py * -4;
    g.globalCompositeOperation = "source-over";
    g.fillStyle = BG;
    g.fillRect(0, 0, w, h);
    const offline = !input.apiOk;

    // Lanes and zone dividers.
    g.lineWidth = 1;
    if (offline) g.setLineDash([3, 6]);
    for (let l = 0; l < lanes; l++) {
      const y = Math.round(laneY(l) + oy) + 0.5;
      g.strokeStyle = `rgba(59,130,246,${(0.085 * topBoost(y)).toFixed(3)})`;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    g.setLineDash([2, 6]);
    g.strokeStyle = "rgba(148,163,184,0.11)";
    g.beginPath();
    for (const z of [ZONE_Q, ZONE_R]) {
      const x = Math.round(w * z + ox) + 0.5;
      g.moveTo(x, 0);
      g.lineTo(x, h);
    }
    g.stroke();
    g.setLineDash([]);
    g.font = "10px 'JetBrains Mono', ui-monospace, monospace";
    g.fillStyle = "rgba(148,163,184,0.38)";
    g.fillText("QUEUED", 12 + ox, h - 12);
    g.fillText("RUNNING", w * ZONE_Q + 12 + ox, h - 12);
    g.fillText("DONE", w * ZONE_R + 12 + ox, h - 12);

    // Packets: trail + head. Additive blending, so overlapping packets glow instead of covering each other.
    g.globalCompositeOperation = "lighter";
    for (const p of packets) {
      const x = p.x + ox;
      const y = laneY(p.lane) + oy;
      const tracked = p.jobId !== null;
      let c: Rgb = tracked
        ? p.phase === "queued"
          ? STATUS.queued
          : p.phase === "running"
            ? STATUS.running
            : p.phase === "exit"
              ? STATUS.done
              : STATUS.failed
        : p.phase === "fail"
          ? STATUS.failed
          : zoneColour(p.x, p.tone);
      if (offline) c = STATUS.offline;
      const q = quietAt(x, y);
      const base = Math.min(1, q * p.life * topBoost(y));
      if (base < 0.01) continue;
      const pulse = tracked && p.phase === "running" ? 0.75 + 0.25 * Math.sin(t / 260 + p.lane) : 1;
      const sz = p.sz;
      const tail = (tracked ? p.len * 2.2 : p.len) * 2.2 * (p.kind === 1 ? 0.5 : 1);
      const grad = g.createLinearGradient(x - tail, y, x, y);
      grad.addColorStop(0, rgba(c, 0));
      grad.addColorStop(1, rgba(c, base * 0.95 * pulse));
      g.strokeStyle = grad;
      g.lineWidth = (tracked ? 4 : 3.2) * Math.min(1.4, sz);
      g.beginPath();
      g.moveTo(x - tail, y);
      g.lineTo(x, y);
      g.stroke();
      g.fillStyle = rgba(c, base * pulse);
      if (tracked || p.kind === 0) {
        const hw = (tracked ? 13 : 9) * sz;
        const hh = (tracked ? 6.5 : 4.5) * sz;
        g.fillRect(x - hw / 2, y - hh / 2, hw, hh);
      } else if (p.kind === 1) {
        const r = 3.4 * sz;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = rgba(c, base * 0.22 * pulse);
        g.beginPath();
        g.arc(x, y, r * 3, 0, Math.PI * 2);
        g.fill();
      } else if (p.kind === 2) {
        const s = 4 * sz;
        g.beginPath();
        g.moveTo(x, y - s);
        g.lineTo(x + s * 1.5, y);
        g.lineTo(x, y + s);
        g.lineTo(x - s * 1.5, y);
        g.closePath();
        g.fill();
      } else {
        const hw = 8 * sz;
        const hh = 3.8 * sz;
        g.fillRect(x - hw / 2, y - hh / 2, hw, hh);
        g.fillStyle = rgba(c, base * 0.6 * pulse);
        g.fillRect(x - 15 * sz - hw / 2, y - hh / 2, hw * 0.8, hh);
      }
      if (tracked) {
        g.fillStyle = rgba(c, base * 0.34 * pulse);
        g.beginPath();
        g.arc(x, y, 15, 0, Math.PI * 2);
        g.fill();
      }
      if (p.ring > 0) {
        const k = 1 - p.ring;
        g.strokeStyle = rgba(c, 0.5 * p.ring * q);
        g.lineWidth = 1;
        g.beginPath();
        g.arc(p.ringX + ox, y, 4 + k * 22, 0, Math.PI * 2);
        g.stroke();
      }
    }
  };

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (!last) last = now;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += dt;
    if (acc < 1 / (busy() ? FPS : FPS_IDLE) - 0.002) return;
    const stepDt = Math.min(0.1, acc);
    acc = 0;
    step(stepDt);
    draw(now);
  };

  const start = () => {
    if (raf || mode !== "live" || document.hidden) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
  const onVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener("visibilitychange", onVisibility);

  resize();
  start();

  return {
    setInput(next) {
      input = next;
      syncJobs();
      if (mode === "still") draw(0);
    },
    setQuiet(rects) {
      quiet = rects;
      if (mode === "still") draw(0);
    },
    setMode(next) {
      mode = next;
      if (next === "still") {
        stop();
        draw(0);
      } else start();
    },
    setPointer(nx, ny) {
      tx = nx;
      ty = ny;
    },
    resize,
    destroy() {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      packets.length = 0;
      known.clear();
    },
  };
}
