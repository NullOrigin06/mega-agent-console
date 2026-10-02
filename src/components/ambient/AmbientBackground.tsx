import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { JobSummary, ModuleKind } from "../../types/engineering";
import type { PairedAgentInfo } from "../../api";
import type { AmbientDocState } from "../../ambient/types";
import { useTwinVesselSpec } from "../cad/useTwinVesselSpec";
import type { AmbientController, AmbientInputs } from "./ambientController";
import { useAmbientBus } from "./useAmbientBus";
import "./ambient.css";

interface AmbientBackgroundProps {
  page: "modules" | "jobs";
  workspaceModule: ModuleKind | null;
  jobs: JobSummary[];
  agents: PairedAgentInfo[];
  apiOk: boolean;
}

/**
 * Whether anything beyond the CSS poster should run: not in jsdom (no
 * canvas at all) and not under forced colours (the root is hidden there).
 * Missing WebGL2 is handled later by the Canvas2D fallback.
 */
function rendererAllowed(): boolean {
  if (typeof window === "undefined" || /jsdom/i.test(navigator.userAgent)) return false;
  try {
    return !window.matchMedia?.("(forced-colors: active)").matches;
  } catch {
    return true;
  }
}

function setDocState(state: AmbientDocState | null) {
  if (state) document.documentElement.dataset.ambient = state;
  else delete document.documentElement.dataset.ambient;
}

/** After the load event, at the next idle period (2.5 s timeout; 1.2 s timer where rIC is missing). */
function whenIdleAfterLoad(cb: () => void): () => void {
  let idleId = 0;
  let timer = 0;
  const schedule = () => {
    if (typeof window.requestIdleCallback === "function") idleId = window.requestIdleCallback(cb, { timeout: 2500 });
    else timer = window.setTimeout(cb, 1200);
  };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
  return () => {
    window.removeEventListener("load", schedule);
    if (idleId) window.cancelIdleCallback(idleId);
    if (timer) window.clearTimeout(timer);
  };
}

/**
 * "Duty Field": the console's ambient background - one holographic heat
 * exchanger whose behaviour is the live state of the console. This always-
 * loaded wrapper only paints the static CSS poster and positions it under
 * the glass chrome; once the page is idle it loads ambientController (its
 * own chunk), which brings up the WebGL2 engine. Purely decorative -
 * everything it shows is also in the status rail, sidebar and job views.
 */
export function AmbientBackground({ page, workspaceModule, jobs, agents, apiOk }: AmbientBackgroundProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const posterRef = useRef<HTMLDivElement>(null);
  const controller = useRef<AmbientController | null>(null);
  const [enabled] = useState(rendererAllowed);
  const bus = useAmbientBus();
  const vessel = useTwinVesselSpec(jobs);

  const inputs: AmbientInputs = {
    page: workspaceModule ? "workspace" : page,
    workspaceModule,
    highlight: bus.highlight,
    jobs,
    agents,
    apiOk,
    vessel,
    mode: bus.motion,
    suspended: bus.suspended,
    reducedMotion: bus.reducedMotion,
  };
  const routeKey = `${inputs.page}:${workspaceModule ?? ""}`;
  const latest = useRef({ inputs, routeKey });

  // --ambient-top: bottom of the glass header + status rail at scroll 0, so
  // nothing animated ever sits under the two glass bars.
  useEffect(() => {
    const root = rootRef.current;
    const header = document.querySelector<HTMLElement>(".console-header");
    const rail = document.querySelector<HTMLElement>(".pipeline-rail");
    if (!root || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const top = (header?.offsetHeight ?? 0) + (rail?.offsetHeight ?? 0);
      if (top > 0) root.style.setProperty("--ambient-top", `${top}px`);
    };
    const ro = new ResizeObserver(update);
    if (header) ro.observe(header);
    if (rail) ro.observe(rail);
    update();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setDocState("off");
    if (!enabled) return () => setDocState(null);
    let cancelled = false;
    let c: AmbientController | null = null;
    const cancelIdle = whenIdleAfterLoad(() => {
      import("./ambientController")
        .then(({ createAmbientController, parseAmbientFlags }) => {
          if (cancelled || !rootRef.current || !posterRef.current) return;
          c = createAmbientController({
            root: rootRef.current,
            poster: posterRef.current,
            flags: parseAmbientFlags(window.location.search),
            initial: latest.current.inputs,
            routeKey: latest.current.routeKey,
            onDocState: setDocState,
          });
          controller.current = c;
        })
        .catch((err) => {
          if (import.meta.env.DEV) console.warn("[ambient] controller chunk failed to load; keeping the CSS poster", err);
        });
    });
    return () => {
      cancelled = true;
      cancelIdle();
      c?.destroy();
      controller.current = null;
      setDocState(null);
    };
  }, [enabled]);

  useEffect(() => {
    latest.current.inputs = inputs;
    controller.current?.setInputs(inputs);
  });

  // Route commit: quiet cores and the stage move with the new page.
  useLayoutEffect(() => {
    latest.current.routeKey = routeKey;
    controller.current?.routeChanged(routeKey);
  }, [routeKey]);

  return (
    <div ref={rootRef} className="ambient-root" aria-hidden="true" role="presentation" inert>
      <div ref={posterRef} className="ambient-poster" />
    </div>
  );
}
