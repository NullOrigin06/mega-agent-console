/**
 * Turns the console's polled data (jobs, agents, API health) into the
 * ambient engine's two inputs: slowly-changing AmbientSignals (state) and
 * AmbientEvent transients (diffs between polls).
 *
 * Event rules (spec layer 9):
 *  - The first snapshot after mount is a silent baseline.
 *  - A job first seen after the baseline only emits if it is fresh: completed
 *    / failed within COMPLETED_GRACE_MS of completedAt, running within the
 *    same window of createdAt. A slow initial load or a reconnect therefore
 *    never replays history.
 *  - More than BATCH_THRESHOLD job transitions inside one COALESCE_MS window
 *    collapse into a single "batch" event.
 *  - Agents use their own baseline (the first non-empty list), because the
 *    agents query resolves independently of the jobs query.
 *
 * Pure functions, run by ambientController (lazy chunk) rather than as a
 * React hook, so none of this is in the main bundle or re-runs on render.
 */
import type { JobStatus, JobSummary, ModuleKind } from "../../types/engineering";
import type { PairedAgentInfo } from "../../api";
import type { AgentNodeInput, AmbientEvent, AmbientSignals, LedgerEntry } from "../../ambient/types";

export const COMPLETED_GRACE_MS = 60_000;
export const COALESCE_MS = 1_500;
export const BATCH_THRESHOLD = 6;
const HOUR_MS = 3_600_000;
const LEDGER_MAX = 64;

function time(iso?: string): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : NaN;
}

/** When a finished job finished (completedAt, falling back to createdAt). */
function finishedAt(job: JobSummary): number {
  const t = time(job.completedAt);
  return Number.isFinite(t) ? t : time(job.createdAt);
}

export function deriveAmbientSignals(
  jobs: JobSummary[],
  agents: PairedAgentInfo[],
  apiOk: boolean,
  localAgentId: string | null,
  nowMs: number,
): AmbientSignals {
  const runningByModule: Record<ModuleKind, number> = { TubeSheet: 0, BonnetFlange: 0, HeatExchangerFab: 0, ShopTank: 0, SiteTank: 0 };
  let running = 0;
  let queued = 0;
  let completed24h = 0;
  const ledger: LedgerEntry[] = [];

  for (const job of jobs) {
    if (job.status === "running") {
      running += 1;
      runningByModule[job.module] = (runningByModule[job.module] ?? 0) + 1;
    } else if (job.status === "queued") {
      queued += 1;
    } else {
      // Clamped at 0: the clock is coarse, and server clocks drift.
      const ageHours = Math.max(0, (nowMs - finishedAt(job)) / HOUR_MS);
      if (!Number.isFinite(ageHours) || ageHours >= 168) continue;
      if (job.status === "completed" && ageHours < 24) completed24h += 1;
      ledger.push({ key: job.id, status: job.status, ageHours, module: job.module });
    }
  }
  ledger.sort((a, b) => a.ageHours - b.ageHours);
  if (ledger.length > LEDGER_MAX) ledger.length = LEDGER_MAX;

  const agentNodes: AgentNodeInput[] = agents.map((a) => ({
    id: a.agentId,
    online: a.online,
    isLocal: a.agentId === localAgentId,
  }));

  return {
    apiOk,
    running,
    queued,
    runningByModule,
    activity: Math.min(1, Math.max(0, completed24h / 12)),
    ledger,
    agents: agentNodes,
    localAgentBusy: running > 0 && agentNodes.some((a) => a.isLocal && a.online),
  };
}

export interface AmbientEventDiffer {
  diff(jobs: JobSummary[], agents: PairedAgentInfo[], nowMs: number): AmbientEvent[];
}

/** Stateful diff of successive job / agent snapshots into AmbientEvents. */
export function createAmbientEventDiffer(): AmbientEventDiffer {
  let jobBaseline: Map<string, JobStatus> | null = null;
  let agentBaseline: Map<string, boolean> | null = null;
  let windowStart = -Infinity;
  let windowCount = 0;
  let windowBatched = false;

  const diffJobs = (jobs: JobSummary[], onlineAgents: string[], nowMs: number): AmbientEvent[] => {
    const next = new Map<string, JobStatus>();
    for (const j of jobs) next.set(j.id, j.status);
    const prev = jobBaseline;
    jobBaseline = next;
    if (!prev) return [];

    // Attribution is exact only with a single online agent (JobSummary carries no agentId).
    const agentId = onlineAgents.length === 1 ? onlineAgents[0] : undefined;
    const out: AmbientEvent[] = [];
    for (const job of jobs) {
      const before = prev.get(job.id);
      if (before === job.status) continue;
      const known = before !== undefined;
      const base = { module: job.module, jobId: job.id, ...(agentId ? { agentId } : {}) };
      if (job.status === "running") {
        if (known || nowMs - time(job.createdAt) <= COMPLETED_GRACE_MS) out.push({ type: "dispatch", ...base });
      } else if (job.status === "completed" || job.status === "failed") {
        if (known || nowMs - finishedAt(job) <= COMPLETED_GRACE_MS) {
          out.push({ type: job.status === "completed" ? "complete" : "fail", ...base });
        }
      }
    }
    if (out.length === 0) return out;

    if (nowMs - windowStart > COALESCE_MS) {
      windowStart = nowMs;
      windowCount = 0;
      windowBatched = false;
    }
    windowCount += out.length;
    if (windowBatched) return [];
    if (out.length > BATCH_THRESHOLD || windowCount > BATCH_THRESHOLD) {
      windowBatched = true;
      return [{ type: "batch", count: out.length > BATCH_THRESHOLD ? out.length : windowCount }];
    }
    return out;
  };

  const diffAgents = (agents: PairedAgentInfo[]): AmbientEvent[] => {
    if (!agentBaseline) {
      if (agents.length === 0) return [];
      agentBaseline = new Map(agents.map((a) => [a.agentId, a.online]));
      return [];
    }
    const prev = agentBaseline;
    const next = new Map(agents.map((a) => [a.agentId, a.online]));
    agentBaseline = next;
    const out: AmbientEvent[] = [];
    for (const [id, online] of next) {
      const before = prev.get(id) ?? false;
      if (online && !before) out.push({ type: "agentOnline", agentId: id });
      else if (!online && before) out.push({ type: "agentOffline", agentId: id });
    }
    for (const [id, online] of prev) {
      if (online && !next.has(id)) out.push({ type: "agentOffline", agentId: id });
    }
    return out;
  };

  return {
    diff(jobs, agents, nowMs) {
      const online = agents.filter((a) => a.online).map((a) => a.agentId);
      return [...diffAgents(agents), ...diffJobs(jobs, online, nowMs)];
    },
  };
}
