import { describe, it, expect } from "vitest";
import type { JobStatus, JobSummary, ModuleKind } from "../../../types/engineering";
import type { PairedAgentInfo } from "../../../api";
import type { AmbientEvent } from "../../../ambient/types";
import { createAmbientEventDiffer, deriveAmbientSignals } from "../useAmbientSignals";

const NOW = Date.parse("2026-10-02T12:00:00Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

function job(id: string, status: JobStatus, module: ModuleKind = "TubeSheet", extra: Partial<JobSummary> = {}): JobSummary {
  return { id, module, status, shellId: 800, createdAt: iso(3_600_000), drawingStatus: "not_generated", ...extra };
}

function agent(agentId: string, online: boolean): PairedAgentInfo {
  return { agentId, online, pairedAt: iso(86_400_000) };
}

describe("createAmbientEventDiffer", () => {
  it("treats the first snapshot as a silent baseline", () => {
    const differ = createAmbientEventDiffer();
    const jobs = [job("a", "running"), job("b", "completed", "TubeSheet", { completedAt: iso(1_000) }), job("c", "failed")];
    expect(differ.diff(jobs, [agent("x", true)], NOW)).toEqual([]);
  });

  it("emits a dispatch on queued -> running", () => {
    const differ = createAmbientEventDiffer();
    differ.diff([job("a", "queued", "BonnetFlange")], [], NOW);
    expect(differ.diff([job("a", "running", "BonnetFlange")], [], NOW + 5_000)).toEqual([
      { type: "dispatch", module: "BonnetFlange", jobId: "a" },
    ]);
  });

  it("emits a complete with the job's module on running -> completed", () => {
    const differ = createAmbientEventDiffer();
    differ.diff([job("a", "running", "HeatExchangerFab")], [], NOW);
    const events = differ.diff([job("a", "completed", "HeatExchangerFab", { completedAt: iso(0) })], [], NOW + 5_000);
    expect(events).toEqual([{ type: "complete", module: "HeatExchangerFab", jobId: "a" }]);
  });

  it("emits a fail on running -> failed", () => {
    const differ = createAmbientEventDiffer();
    differ.diff([job("a", "running")], [], NOW);
    expect(differ.diff([job("a", "failed")], [], NOW + 5_000)).toEqual([{ type: "fail", module: "TubeSheet", jobId: "a" }]);
  });

  it("attributes events to the agent only when exactly one is online", () => {
    const differ = createAmbientEventDiffer();
    differ.diff([job("a", "queued"), job("b", "queued")], [agent("x", true), agent("y", false)], NOW);
    const single = differ.diff([job("a", "running"), job("b", "queued")], [agent("x", true), agent("y", false)], NOW + 5_000);
    expect(single[0].agentId).toBe("x");
    const many = differ.diff([job("a", "running"), job("b", "running")], [agent("x", true), agent("y", true)], NOW + 10_000);
    expect(many.find((e) => e.type === "dispatch")?.agentId).toBeUndefined();
  });

  it("only emits for jobs first seen after the baseline when they're fresh", () => {
    const differ = createAmbientEventDiffer();
    differ.diff([], [], NOW);
    const events = differ.diff(
      [
        job("fresh", "completed", "TubeSheet", { completedAt: iso(30_000) }),
        job("stale", "completed", "TubeSheet", { completedAt: iso(5 * 60_000) }),
        job("new-queued", "queued"),
      ],
      [],
      NOW,
    );
    expect(events).toEqual([{ type: "complete", module: "TubeSheet", jobId: "fresh" }]);
  });

  it("collapses more than six transitions into one batch event", () => {
    const differ = createAmbientEventDiffer();
    const ids = Array.from({ length: 20 }, (_, i) => `j${i}`);
    differ.diff(ids.map((id) => job(id, "queued")), [], NOW);
    const events = differ.diff(ids.map((id) => job(id, "running")), [], NOW + 5_000);
    expect(events).toEqual([{ type: "batch", count: 20 }]);
  });

  it("coalesces bursts within 1.5 s into the batch", () => {
    const differ = createAmbientEventDiffer();
    const ids = Array.from({ length: 8 }, (_, i) => `j${i}`);
    differ.diff(ids.map((id) => job(id, "queued")), [], NOW);
    const first = differ.diff(ids.map((id, i) => job(id, i < 4 ? "running" : "queued")), [], NOW + 10_000);
    expect(first).toHaveLength(4);
    const second = differ.diff(ids.map((id) => job(id, "running")), [], NOW + 10_500);
    expect(second).toEqual([{ type: "batch", count: 8 }]);
    // Further transitions in the same window are absorbed by that batch ring.
    expect(differ.diff(ids.map((id) => job(id, "failed")), [], NOW + 11_000)).toEqual([]);
    // A new window starts afterwards.
    expect(differ.diff(ids.map((id, i) => job(id, i === 0 ? "running" : "failed")), [], NOW + 20_000)).toHaveLength(1);
  });

  it("emits agentOnline / agentOffline after the agents baseline", () => {
    const differ = createAmbientEventDiffer();
    expect(differ.diff([], [], NOW)).toEqual([]);
    // First non-empty agent list is the baseline (the agents query loads independently).
    expect(differ.diff([], [agent("x", true), agent("y", false)], NOW)).toEqual([]);
    expect(differ.diff([], [agent("x", false), agent("y", true)], NOW + 15_000)).toEqual<AmbientEvent[]>([
      { type: "agentOffline", agentId: "x" },
      { type: "agentOnline", agentId: "y" },
    ]);
    expect(differ.diff([], [agent("x", false), agent("y", true), agent("z", true)], NOW + 30_000)).toEqual([
      { type: "agentOnline", agentId: "z" },
    ]);
    expect(differ.diff([], [agent("x", false)], NOW + 45_000)).toEqual([
      { type: "agentOffline", agentId: "y" },
      { type: "agentOffline", agentId: "z" },
    ]);
  });
});

describe("deriveAmbientSignals", () => {
  it("counts running / queued work, activity and the 7-day ledger", () => {
    const jobs = [
      job("r1", "running", "TubeSheet"),
      job("r2", "running", "BonnetFlange"),
      job("q1", "queued"),
      job("c1", "completed", "HeatExchangerFab", { completedAt: iso(2 * 3_600_000) }),
      job("c2", "completed", "TubeSheet", { completedAt: iso(30 * 3_600_000) }),
      job("f1", "failed", "TubeSheet", { completedAt: iso(3_600_000) }),
      job("old", "completed", "TubeSheet", { completedAt: iso(200 * 3_600_000) }),
    ];
    const s = deriveAmbientSignals(jobs, [agent("me", true), agent("other", false)], true, "me", NOW);
    expect(s.running).toBe(2);
    expect(s.queued).toBe(1);
    expect(s.runningByModule).toEqual({ TubeSheet: 1, BonnetFlange: 1, HeatExchangerFab: 0, GeneralArrangement: 0, ShopTank: 0, SiteTank: 0 });
    expect(s.activity).toBeCloseTo(1 / 12);
    expect(s.ledger.map((e) => e.key)).toEqual(["f1", "c1", "c2"]);
    expect(s.agents).toEqual([
      { id: "me", online: true, isLocal: true },
      { id: "other", online: false, isLocal: false },
    ]);
    expect(s.localAgentBusy).toBe(true);
  });
});
