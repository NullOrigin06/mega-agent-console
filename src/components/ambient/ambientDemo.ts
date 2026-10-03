/**
 * ?ambientDemo=1 - synthetic job activity so the background can be reviewed
 * in mock mode, where nothing ever changes state on its own. Loaded lazily
 * only when the flag is present. Cycles dispatch -> complete for each module,
 * then a failure and a batch, one step every STEP_MS, and patches `running`
 * / `runningByModule` while a synthetic job is "in flight".
 */
import type { AmbientEvent, AmbientSignals } from "../../ambient/types";
import type { ModuleKind } from "../../types/engineering";

const STEP_MS = 4_000;

type Step = { type: "dispatch" | "complete" | "fail"; module: ModuleKind } | { type: "batch"; count: number };

const SCRIPT: Step[] = [
  { type: "dispatch", module: "HeatExchangerFab" },
  { type: "complete", module: "HeatExchangerFab" },
  { type: "dispatch", module: "TubeSheet" },
  { type: "complete", module: "TubeSheet" },
  { type: "dispatch", module: "BonnetFlange" },
  { type: "complete", module: "BonnetFlange" },
  { type: "dispatch", module: "TubeSheet" },
  { type: "fail", module: "TubeSheet" },
  { type: "batch", count: 9 },
];

export function startAmbientDemo(opts: {
  emit: (events: AmbientEvent[]) => void;
  patch: (signals: Partial<AmbientSignals> | null) => void;
  agentIds: () => string[];
}): () => void {
  let i = 0;
  let n = 0;
  const tick = () => {
    const step = SCRIPT[i % SCRIPT.length];
    i += 1;
    if (step.type === "batch") {
      opts.emit([{ type: "batch", count: step.count }]);
      return;
    }
    if (step.type === "dispatch") n += 1;
    const online = opts.agentIds();
    opts.emit([
      { type: step.type, module: step.module, jobId: `demo-${n}`, ...(online.length === 1 ? { agentId: online[0] } : {}) },
    ]);
    if (step.type === "dispatch") {
      const runningByModule: AmbientSignals["runningByModule"] = { TubeSheet: 0, BonnetFlange: 0, HeatExchangerFab: 0, ShopTank: 0, SiteTank: 0 };
      runningByModule[step.module] = 1;
      opts.patch({ running: 1, runningByModule });
    } else {
      opts.patch(null);
    }
  };
  const timer = window.setInterval(tick, STEP_MS);
  return () => {
    window.clearInterval(timer);
    opts.patch(null);
  };
}
