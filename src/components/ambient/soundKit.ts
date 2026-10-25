/**
 * Sound kit - optional, calm UI sounds, synthesized with Web Audio (no audio
 * files to load).
 *
 * - Off by default. The preference is persisted in localStorage (every access
 *   in try/catch, storage can throw in private windows).
 * - Tied to the header's ambient pause toggle: while ambient motion is paused
 *   the kit stays silent, so one click quiets the whole console.
 * - Everything is low and soft: sine/triangle tones under ~600 Hz, slow
 *   attacks, and a master low-pass at 2.4 kHz so nothing sounds sharp.
 * - The AudioContext is created lazily on a user gesture (browsers block
 *   audio until then) and nothing plays while the tab is hidden.
 */
import { ambientBus } from "./ambientBus";

export type SoundCue = "hover" | "click" | "complete" | "failed" | "whoosh";

const STORAGE_KEY = "mega.sound";
const MASTER_GAIN = 0.55;
const MASTER_LOWPASS_HZ = 2400;
const HOVER_MIN_GAP_MS = 90;

let enabled = readPref();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let lastHover = 0;
const listeners = new Set<() => void>();

function readPref(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function writePref(on: boolean) {
  try {
    if (on) window.localStorage.setItem(STORAGE_KEY, "on");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked - the preference just won't survive a reload.
  }
}

/** Create (or resume) the audio graph. Must run inside a user gesture the first time. */
function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    const soften = ctx.createBiquadFilter();
    soften.type = "lowpass";
    soften.frequency.value = MASTER_LOWPASS_HZ;
    master.connect(soften).connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Ambient motion paused (or still) = the console is meant to be quiet. */
function silencedByPause(): boolean {
  return ambientBus.getSnapshot().motion !== "live";
}

function canPlay(): boolean {
  return enabled && !silencedByPause() && typeof document !== "undefined" && !document.hidden;
}

/** One soft tone: slow attack, exponential release. */
function tone(c: AudioContext, out: AudioNode, opts: { freq: number; endFreq?: number; type?: OscillatorType; at?: number; attack: number; release: number; gain: number }) {
  const t0 = c.currentTime + (opts.at ?? 0);
  const osc = c.createOscillator();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.endFreq) osc.frequency.exponentialRampToValueAtTime(opts.endFreq, t0 + opts.attack + opts.release);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain, t0 + opts.attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.attack + opts.release);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + opts.attack + opts.release + 0.05);
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise) return noise;
  // Brown-ish noise (integrated white noise): deep and soft, no hiss.
  const len = Math.floor(c.sampleRate * 1.2);
  noise = c.createBuffer(1, len, c.sampleRate);
  const data = noise.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  return noise;
}

const CUES: Record<SoundCue, (c: AudioContext, out: AudioNode) => void> = {
  // A barely-there low tick.
  hover: (c, out) => tone(c, out, { freq: 330, type: "sine", attack: 0.008, release: 0.07, gain: 0.035 }),
  // A soft, rounded tap.
  click: (c, out) => {
    tone(c, out, { freq: 196, endFreq: 165, type: "sine", attack: 0.006, release: 0.12, gain: 0.09 });
    tone(c, out, { freq: 392, type: "triangle", attack: 0.004, release: 0.05, gain: 0.018 });
  },
  // A gentle two-note rising chime (D4 then A4), long tail.
  complete: (c, out) => {
    tone(c, out, { freq: 293.66, type: "sine", attack: 0.03, release: 1.4, gain: 0.07 });
    tone(c, out, { freq: 440, type: "sine", at: 0.16, attack: 0.03, release: 1.6, gain: 0.055 });
    tone(c, out, { freq: 880, type: "sine", at: 0.16, attack: 0.05, release: 0.9, gain: 0.008 });
  },
  // A low, falling two-note tone (A3 to F3): noticeable, not alarming.
  failed: (c, out) => {
    tone(c, out, { freq: 220, type: "sine", attack: 0.03, release: 0.7, gain: 0.07 });
    tone(c, out, { freq: 174.61, type: "sine", at: 0.22, attack: 0.03, release: 1.0, gain: 0.065 });
  },
  // Soft air through a closing low-pass: 900 Hz down to 160 Hz.
  whoosh: (c, out) => {
    const t0 = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(900, t0);
    lp.frequency.exponentialRampToValueAtTime(160, t0 + 0.55);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.65);
    src.connect(lp).connect(g).connect(out);
    src.start(t0);
    src.stop(t0 + 0.7);
  },
};

export const soundKit = {
  isEnabled: () => enabled,

  setEnabled(on: boolean) {
    enabled = on;
    writePref(on);
    // Turning it on is a click, so the context can start now (the click's own tap confirms it).
    if (on) ensureContext();
    listeners.forEach((l) => l());
  },

  play(cue: SoundCue) {
    if (!canPlay()) return;
    if (cue === "hover") {
      const now = performance.now();
      if (now - lastHover < HOVER_MIN_GAP_MS) return;
      lastHover = now;
    }
    // Before the first gesture there is no context yet; hover/whoosh/chimes just stay silent until then.
    const c = ctx;
    const out = master;
    if (!c || !out || c.state === "closed") return;
    if (c.state === "running") {
      CUES[cue](c, out);
      return;
    }
    // Still starting up (resume is async): play once it is running, except hover ticks, which would land late.
    if (cue !== "hover") void c.resume().then(() => c.state === "running" && CUES[cue](c, out));
  },

  /** Audio engine state, for diagnostics: "none" until the first gesture after sound is turned on. */
  state: (): string => ctx?.state ?? "none",

  /** Call from a real user gesture (pointerdown/keydown) to unlock audio. */
  unlock() {
    if (enabled) ensureContext();
  },

  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
