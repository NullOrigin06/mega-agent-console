import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { JobStatus, JobSummary } from "../../../types/engineering";

const play = vi.fn();
vi.mock("../soundKit", () => ({
  soundKit: { play: (...a: unknown[]) => play(...a), unlock: vi.fn(), subscribe: () => () => {}, isEnabled: () => true },
}));

import { useSoundCues } from "../useSoundCues";

function job(id: string, status: JobStatus): JobSummary {
  return { id, module: "TubeSheet", status, shellId: 800, createdAt: "2026-10-25T10:00:00Z", drawingStatus: "not_generated" };
}

describe("useSoundCues", () => {
  beforeEach(() => play.mockClear());

  it("stays silent on the first snapshot and on mount", () => {
    renderHook(() => useSoundCues({ pageKey: "jobs", jobs: [job("a", "completed")] }));
    expect(play).not.toHaveBeenCalled();
  });

  it("chimes when a running job completes", () => {
    const { rerender } = renderHook((p: { jobs: JobSummary[] }) => useSoundCues({ pageKey: "jobs", jobs: p.jobs }), {
      initialProps: { jobs: [job("a", "running")] },
    });
    rerender({ jobs: [job("a", "completed")] });
    expect(play).toHaveBeenCalledWith("complete");
  });

  it("plays the failed tone when a job fails, even if another completed", () => {
    const { rerender } = renderHook((p: { jobs: JobSummary[] }) => useSoundCues({ pageKey: "jobs", jobs: p.jobs }), {
      initialProps: { jobs: [job("a", "running"), job("b", "queued")] },
    });
    rerender({ jobs: [job("a", "completed"), job("b", "failed")] });
    expect(play).toHaveBeenCalledWith("failed");
    expect(play).not.toHaveBeenCalledWith("complete");
  });

  it("whooshes on page change only", () => {
    const { rerender } = renderHook((p: { pageKey: string }) => useSoundCues({ pageKey: p.pageKey, jobs: [] }), {
      initialProps: { pageKey: "modules" },
    });
    rerender({ pageKey: "modules" });
    expect(play).not.toHaveBeenCalled();
    rerender({ pageKey: "jobs" });
    expect(play).toHaveBeenCalledWith("whoosh");
  });
});
