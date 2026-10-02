/**
 * Imperative side of AmbientBackground, loaded as its own lazy chunk once
 * the page is idle after load (so none of this weighs on first paint). It
 * owns the canvas, derives signals and diffs data into events, tracks the
 * DOM layout, loads the WebGL2 engine (or the Canvas2D still), forwards
 * scroll / pointer / activity hints and runs the poster crossfade. Lives
 * outside React so per-frame inputs never re-render anything.
 *
 * The engine factory returning null, or onFallback firing later, swaps in a
 * fresh canvas (one that ever held a WebGL context can't give a 2D one) and
 * loads ambient/fallback2d instead.
 */
import type {
  AmbientActivityHints,
  AmbientDocState,
  AmbientEngine,
  AmbientEngineOptions,
  AmbientEvent,
  AmbientFallbackReason,
  AmbientLayout,
  AmbientPage,
  AmbientRenderMode,
  AmbientSceneState,
  AmbientSignals,
  CreateAmbientEngine,
  PoseName,
  RenderAmbientStill2D,
  VesselModel,
} from "../../ambient/types";
import { toVesselModel } from "../../ambient/twinGeometry";
import type { PairedAgentInfo } from "../../api";
import type { JobSummary, ModuleKind } from "../../types/engineering";
import { getPairedAgent } from "../../utils/agentPairing";
import type { VesselSpec } from "../cad/vesselSpec";
import { measureAmbientLayout, trackAmbientLayout } from "./quietZones";
import { createAmbientEventDiffer, deriveAmbientSignals } from "./useAmbientSignals";

const OPENED_KEY = "mega.ambient.opened";
const FADE_EASING = "cubic-bezier(.22,.61,.36,1)";
const POSES: readonly PoseName[] = ["overview", "telemetry", "face", "bonnet", "section", "wide", "porthole"];
/** Ledger ages / 24 h activity are re-derived this often even without new data. */
const CLOCK_MS = 60_000;

export interface AmbientFlags {
  debug: NonNullable<AmbientEngineOptions["debug"]>;
  demo: boolean;
}

/** ?ambient=debug|lum|stress|still (&t=37&pose=overview) and ?ambientDemo=1. */
export function parseAmbientFlags(search: string): AmbientFlags {
  const q = new URLSearchParams(search);
  const mode = q.get("ambient");
  const debug: AmbientFlags["debug"] = {};
  if (mode === "debug") debug.overlay = true;
  if (mode === "lum") debug.lum = true;
  if (mode === "stress") debug.stress = true;
  if (mode === "still") {
    debug.forceStill = true;
    const t = Number(q.get("t"));
    debug.stillTime = q.has("t") && Number.isFinite(t) ? t : 37;
  }
  const pose = q.get("pose") as PoseName | null;
  if (pose && POSES.includes(pose)) debug.pose = pose;
  return { debug, demo: q.get("ambientDemo") === "1" };
}

/** Everything AmbientBackground knows; compared field by field on each render. */
export interface AmbientInputs {
  page: AmbientPage;
  workspaceModule: ModuleKind | null;
  highlight: ModuleKind | null;
  jobs: JobSummary[];
  agents: PairedAgentInfo[];
  apiOk: boolean;
  vessel: VesselSpec;
  mode: AmbientRenderMode;
  suspended: boolean;
  reducedMotion: boolean;
  /** prefers-contrast: more (lattice and haze only, wider quiet-core feather). */
  contrastMore?: boolean;
  /** Module of the job open in Job detail, when that job is running. */
  detailModule?: ModuleKind | null;
}

/** Same list for change detection: one identity, or both empty (a fresh `[]` default each render). */
const sameList = (a: readonly unknown[], b: readonly unknown[]) => a === b || (a.length === 0 && b.length === 0);

export interface AmbientController {
  setInputs(inputs: AmbientInputs): void;
  /** After a route commit: re-measure quiet cores / stage next frame. */
  routeChanged(routeKey: string): void;
  destroy(): void;
}

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return el.matches("input, textarea, select");
}

function fade(el: HTMLElement, to: number, duration: number, done?: () => void) {
  if (duration > 0 && typeof el.animate === "function") {
    const from = getComputedStyle(el).opacity;
    const anim = el.animate([{ opacity: from }, { opacity: String(to) }], { duration, easing: FADE_EASING, fill: "forwards" });
    anim.onfinish = () => {
      el.style.opacity = String(to);
      anim.cancel();
      done?.();
    };
  } else {
    el.style.opacity = String(to);
    done?.();
  }
}

function newCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.className = "ambient-canvas";
  return c;
}

/** fallback2d's renderer, whether it is the default or the named export. */
function pickStill(mod: Record<string, unknown>): RenderAmbientStill2D | null {
  const fn = mod.default ?? mod.renderAmbientStill2D;
  return typeof fn === "function" ? (fn as RenderAmbientStill2D) : null;
}

export function createAmbientController(opts: {
  root: HTMLElement;
  poster: HTMLElement;
  flags: AmbientFlags;
  initial: AmbientInputs;
  routeKey: string;
  onDocState: (state: AmbientDocState) => void;
  /** False once the Canvas2D still (or nothing) replaced the engine: motion can't resume. */
  onMotionAvailable?: (available: boolean) => void;
}): AmbientController {
  const { root, poster, flags } = opts;
  let inputs = opts.initial;
  let layout: AmbientLayout | null = null;
  let engine: AmbientEngine | null = null;
  let still2d: RenderAmbientStill2D | null = null;
  let fellBack = false;
  let destroyed = false;
  let revealed = false;
  let stillRaf = 0;
  let demoSignals: Partial<AmbientSignals> | null = null;
  let stopDemo: (() => void) | null = null;
  const cleanups: Array<() => void> = [];

  let canvas = newCanvas();
  root.appendChild(canvas);

  // ---- derived inputs ------------------------------------------------------
  const differ = createAmbientEventDiffer();
  differ.diff(inputs.jobs, inputs.agents, Date.now()); // silent baseline
  let model: VesselModel = toVesselModel(inputs.vessel);
  let state: AmbientSceneState;
  const deriveState = () => {
    const signals = deriveAmbientSignals(inputs.jobs, inputs.agents, inputs.apiOk, getPairedAgent()?.agentId ?? null, Date.now());
    state = {
      page: inputs.page,
      workspaceModule: inputs.workspaceModule,
      highlight: inputs.highlight,
      detailModule: inputs.detailModule ?? null,
      contrastMore: inputs.contrastMore === true,
      signals: demoSignals ? { ...signals, ...demoSignals } : signals,
    };
  };
  deriveState();

  const mode = (): AmbientRenderMode => (flags.debug.forceStill ? "still" : inputs.mode);
  const suspended = () => inputs.suspended || document.hidden;

  let lastDoc: AmbientDocState | null = null;
  const updateDocState = () => {
    const next: AmbientDocState = engine ? (mode() === "live" ? "live" : "still") : still2d ? "still" : "off";
    if (next !== lastDoc) {
      lastDoc = next;
      opts.onDocState(next);
    }
    opts.onMotionAvailable?.(!fellBack);
  };

  // ---- crossfade -----------------------------------------------------------
  const reveal = () => {
    if (revealed || destroyed) return;
    revealed = true;
    fade(canvas, 1, inputs.reducedMotion ? 0 : 600, () => {
      if (revealed) poster.style.visibility = "hidden";
    });
  };
  const unreveal = () => {
    revealed = false;
    poster.style.visibility = "";
    fade(canvas, 0, inputs.reducedMotion ? 0 : 200);
  };

  // ---- Canvas2D still ------------------------------------------------------
  const drawStill = () => {
    stillRaf = 0;
    if (!still2d || destroyed) return;
    const l = (layout ??= measureAmbientLayout(root).layout);
    const dpr = Math.min(l.devicePixelRatio, 1.5);
    const w = Math.round(l.viewportW * dpr);
    const h = Math.round(l.canvas.h * dpr);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    still2d(canvas, { state, layout: l, vessel: model, scrollY: window.scrollY });
    reveal();
  };
  const scheduleStill = () => {
    if (still2d && !stillRaf) stillRaf = requestAnimationFrame(drawStill);
  };

  const fallback = (reason: AmbientFallbackReason) => {
    if (fellBack || destroyed) return;
    fellBack = true;
    // Visible in production (console + html[data-ambient-fallback]) so "motion unavailable" can be diagnosed.
    console.info(`[ambient] falling back to the Canvas2D still (${reason})`);
    document.documentElement.dataset.ambientFallback = reason;
    const old = engine;
    engine = null;
    old?.destroy();
    unreveal();
    const fresh = newCanvas();
    canvas.replaceWith(fresh);
    canvas = fresh;
    updateDocState();
    import("../../ambient/fallback2d")
      .then((mod) => {
        if (destroyed) return;
        still2d = pickStill(mod as unknown as Record<string, unknown>);
        updateDocState();
        scheduleStill();
      })
      .catch((err) => {
        if (import.meta.env.DEV) console.warn("[ambient] fallback2d failed to load; keeping the CSS poster", err);
      });
  };

  // ---- activity hints --------------------------------------------------------
  const hints: AmbientActivityHints = { windowFocused: document.hasFocus(), typing: false, pointerDown: false, idleMs: 0 };
  let lastInput = performance.now();
  const sendHints = () => {
    hints.idleMs = performance.now() - lastInput;
    engine?.setHints({ ...hints });
  };
  /** Any input or data event; tells the engine at once if it had gone idle. */
  const activity = () => {
    const wasIdle = performance.now() - lastInput > 30_000;
    lastInput = performance.now();
    if (wasIdle) sendHints();
  };

  // ---- layout ----------------------------------------------------------------
  const tracker = trackAmbientLayout(root, (next) => {
    layout = next;
    engine?.setLayout(next);
    scheduleStill();
  });
  tracker.routeChanged(opts.routeKey);
  cleanups.push(() => tracker.dispose());

  // ---- engine ----------------------------------------------------------------
  const startEngine = async () => {
    if (typeof WebGL2RenderingContext === "undefined") return fallback("no-webgl2");
    let create: CreateAmbientEngine;
    try {
      create = (await import("../../ambient/engine")).default;
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[ambient] engine chunk failed to load", err);
      return fallback("error");
    }
    if (destroyed || fellBack) return;

    let playOpening = false;
    if (mode() === "live" && !inputs.reducedMotion) {
      try {
        playOpening = !window.sessionStorage.getItem(OPENED_KEY);
        window.sessionStorage.setItem(OPENED_KEY, "1");
      } catch {
        playOpening = false;
      }
    }

    let created: AmbientEngine | null = null;
    try {
      created = create(canvas, {
        onFirstFrame: reveal,
        onFallback: fallback,
        onContextLost: unreveal,
        onContextRestored: () => requestAnimationFrame(reveal),
        debug: flags.debug,
        playOpening,
      });
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[ambient] engine failed to start", err);
    }
    if (!created) return fallback("no-webgl2");
    if (fellBack || destroyed) {
      created.destroy();
      return;
    }
    engine = created;
    engine.setLayout((layout ??= measureAmbientLayout(root).layout));
    engine.setVessel(model);
    engine.setState(state);
    engine.setMode(mode());
    engine.setSuspended(suspended());
    engine.setScroll(window.scrollY);
    sendHints();
    updateDocState();

    if (flags.demo) {
      import("./ambientDemo")
        .then(({ startAmbientDemo }) => {
          if (destroyed) return;
          stopDemo = startAmbientDemo({
            emit: (events) => engine?.pushEvents(events),
            patch: (signals) => {
              demoSignals = signals;
              deriveState();
              engine?.setState(state);
            },
            agentIds: () => state.signals.agents.filter((a) => a.online).map((a) => a.id),
          });
        })
        .catch(() => {});
    }
  };
  void startEngine();

  // ---- DOM listeners (all passive; nothing here ever preventDefaults) --------
  const on = <E extends Event>(target: EventTarget, type: string, fn: (e: E) => void) => {
    target.addEventListener(type, fn as EventListener, { passive: true });
    cleanups.push(() => target.removeEventListener(type, fn as EventListener));
  };

  on(window, "scroll", () => {
    activity();
    engine?.setScroll(window.scrollY);
    scheduleStill();
  });

  let finePointer = false;
  try {
    finePointer = window.matchMedia?.("(pointer: fine) and (hover: hover)").matches ?? false;
  } catch {
    finePointer = false;
  }
  if (finePointer) {
    on<PointerEvent>(window, "pointermove", (e) => {
      activity();
      if (!engine || !layout) return;
      const c = layout.canvas;
      const nx = Math.max(-1, Math.min(1, ((e.clientX - c.x) / Math.max(1, c.w)) * 2 - 1));
      const ny = Math.max(-1, Math.min(1, ((e.clientY - c.y) / Math.max(1, c.h)) * 2 - 1));
      engine.setPointer(nx, ny, true);
    });
    on<PointerEvent>(document, "pointerout", (e) => {
      if (!e.relatedTarget) engine?.setPointer(0, 0, false);
    });
  }
  on(window, "pointerdown", () => {
    activity();
    hints.pointerDown = true;
    sendHints();
  });
  const pointerUp = () => {
    if (!hints.pointerDown) return;
    hints.pointerDown = false;
    sendHints();
  };
  on(window, "pointerup", pointerUp);
  on(window, "pointercancel", pointerUp);
  on(window, "keydown", activity);
  on(window, "wheel", activity);
  on(window, "touchstart", activity);
  const focusChange = () => {
    const typing = isTypingTarget(document.activeElement);
    if (typing !== hints.typing) {
      hints.typing = typing;
      sendHints();
    }
  };
  on(document, "focusin", focusChange);
  on(document, "focusout", focusChange);
  const windowFocus = (focused: boolean) => () => {
    hints.windowFocused = focused;
    if (!focused) engine?.setPointer(0, 0, false);
    sendHints();
  };
  on(window, "focus", windowFocus(true));
  on(window, "blur", windowFocus(false));
  on(document, "visibilitychange", () => {
    engine?.setSuspended(suspended());
    if (!document.hidden) {
      activity();
      sendHints();
    }
  });
  const hintTimer = window.setInterval(() => engine && sendHints(), 10_000);
  const clockTimer = window.setInterval(() => {
    deriveState();
    engine?.setState(state);
    scheduleStill();
  }, CLOCK_MS);
  cleanups.push(() => {
    window.clearInterval(hintTimer);
    window.clearInterval(clockTimer);
  });

  updateDocState();

  return {
    setInputs(next) {
      const prev = inputs;
      inputs = next;
      let redraw = false;
      const dataChanged = !sameList(next.jobs, prev.jobs) || !sameList(next.agents, prev.agents);
      if (
        dataChanged ||
        next.apiOk !== prev.apiOk ||
        next.page !== prev.page ||
        next.workspaceModule !== prev.workspaceModule ||
        next.highlight !== prev.highlight ||
        (next.detailModule ?? null) !== (prev.detailModule ?? null) ||
        next.contrastMore !== prev.contrastMore
      ) {
        redraw = true;
        activity();
        deriveState();
        engine?.setState(state);
      }
      if (dataChanged) {
        const events: AmbientEvent[] = differ.diff(next.jobs, next.agents, Date.now());
        if (events.length > 0) engine?.pushEvents(events);
      }
      if (next.vessel !== prev.vessel) {
        redraw = true;
        model = toVesselModel(next.vessel);
        engine?.setVessel(model);
      }
      if (next.mode !== prev.mode) {
        redraw = true;
        engine?.setMode(mode());
        updateDocState();
      }
      if (next.suspended !== prev.suspended) engine?.setSuspended(suspended());
      if (redraw) scheduleStill();
    },
    routeChanged(routeKey) {
      tracker.routeChanged(routeKey);
    },
    destroy() {
      destroyed = true;
      cleanups.forEach((fn) => fn());
      stopDemo?.();
      if (stillRaf) cancelAnimationFrame(stillRaf);
      engine?.destroy();
      engine = null;
      canvas.remove();
      poster.style.visibility = "";
    },
  };
}
