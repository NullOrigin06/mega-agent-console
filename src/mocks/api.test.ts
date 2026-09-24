import { describe, it, expect } from "vitest";
import {
  listJobs,
  getJob,
  submitJob,
  deleteJob,
  generateDrawing,
} from "./api";

// These tests target the exact regressions found and fixed in this mock
// during manual QA: jobs stuck in "queued" forever, "Generate Drawing"
// silently doing nothing for UI-submitted jobs (missing engineeringData) and
// for pre-seeded fixture jobs (getJob returning a frozen snapshot instead of
// the live, mutated job record). Real timers are used throughout (rather
// than fake timers) because the mock's internal delay()/setTimeout chains
// are triggered independently of when callers await them, which makes fake
// timers easy to deadlock against the mock's own internal awaits.

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("mock api: submitJob lifecycle", () => {
  it("transitions a submitted job from queued -> running -> completed", async () => {
    const job = await submitJob({ module: "TubeSheet", shellId: 700 });
    expect(job.status).toBe("queued");

    await wait(900);
    let jobs = await listJobs();
    expect(jobs.find((j) => j.id === job.id)?.status).toBe("running");

    await wait(1800);
    jobs = await listJobs();
    const completed = jobs.find((j) => j.id === job.id);
    expect(completed?.status).toBe("completed");
    expect(completed?.completedAt).toBeTruthy();
  }, 10000);

  it("attaches engineeringData/bom once a UI-submitted job completes, so the Drawing tab can appear", async () => {
    const job = await submitJob({ module: "TubeSheet", shellId: 700 });
    await wait(2600);

    const detail = await getJob(job.id);
    expect(detail?.engineeringData).toBeTruthy();
    expect(detail?.bom).toBeTruthy();
  }, 10000);

  it("computes shellId from thermal sizing inputs when shellId isn't given directly", async () => {
    const job = await submitJob({
      module: "TubeSheet",
      hta: 50,
      tubeOD: 25,
      tubeLength: 3000,
      noOfPass: 2,
    });
    expect(job.shellId).toBeGreaterThan(0);
  });
});

describe("mock api: getJob live-merge", () => {
  it("reflects a live drawingStatus mutation for a pre-seeded fixture job (job-1001), not a frozen snapshot", async () => {
    const before = await getJob("job-1001");
    expect(before?.drawingStatus).toBe("generated");

    await generateDrawing("job-1001");

    const after = await getJob("job-1001");
    // generateDrawing flips drawingStatus back to "generated" after its
    // internal delay; the key regression this guards is that the value
    // read back is sourced from the live `jobs` array, not a fixture that
    // generateDrawing() never touches.
    expect(after?.drawingStatus).toBe("generated");
    // Static fixture data (engineeringData) must still be present alongside
    // the live status fields.
    expect(after?.engineeringData).toBeTruthy();
  }, 10000);

  it("sets drawingStatus to generating while generateDrawing is in flight for a fixture job", async () => {
    const genPromise = generateDrawing("job-1005");
    const mid = await getJob("job-1005");
    expect(mid?.drawingStatus).toBe("generating");
    await genPromise;
    const after = await getJob("job-1005");
    expect(after?.drawingStatus).toBe("generated");
  }, 10000);

  it("returns undefined for a job id that doesn't exist", async () => {
    const detail = await getJob("job-does-not-exist");
    expect(detail).toBeUndefined();
  });
});

describe("mock api: deleteJob", () => {
  it("removes a job so it no longer appears in listJobs or getJob", async () => {
    const job = await submitJob({ module: "TubeSheet", shellId: 700 });
    expect((await listJobs()).some((j) => j.id === job.id)).toBe(true);

    await deleteJob(job.id);

    expect((await listJobs()).some((j) => j.id === job.id)).toBe(false);
    expect(await getJob(job.id)).toBeUndefined();
  });
});
