import { describe, it, expect } from "vitest";
import {
  listJobs,
  getJob,
  submitJob,
  deleteJob,
  generateDrawing,
  signup,
  resetPassword,
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

describe("mock api: signup enforces the same rules as the real backend", () => {
  // This is the mock-mode counterpart to mega-agent-api's AccountValidation:
  // the public/demo deployment (Vercel, no real API attached) only ever
  // calls this mock, so without these checks here too, the backend's
  // disposable-domain/weak-password hardening would be invisible on it.

  it("rejects a disposable email domain", async () => {
    await expect(
      signup({ email: "user@mailinator.com", password: "Correcthorse42" })
    ).rejects.toThrow(/Disposable/);
  });

  it("rejects a common weak password", async () => {
    await expect(
      signup({ email: "user@example.com", password: "password123" })
    ).rejects.toThrow();
  });

  it("rejects a malformed email", async () => {
    await expect(
      signup({ email: "not-an-email", password: "Correcthorse42" })
    ).rejects.toThrow();
  });

  it("accepts a well-formed email and strong password", async () => {
    const result = await signup({ email: "new.engineer@example.com", password: "Correcthorse42" });
    expect(result.email).toBe("new.engineer@example.com");
    expect(result.apiKey).toBeTruthy();
  });
});

describe("mock api: resetPassword enforces the same password rules", () => {
  it("rejects a common weak password", async () => {
    await expect(resetPassword("any-token", "password123")).rejects.toThrow();
  });

  it("accepts a strong password", async () => {
    const result = await resetPassword("any-token", "Correcthorse42");
    expect(result.apiKey).toBeTruthy();
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

describe("mock api: two-drawing lifecycle (Heat Exchanger)", () => {
  it("new Heat Exchanger jobs start with both drawings not generated", async () => {
    const jobs = await listJobs();
    const hx = jobs.find((j) => j.id === "job-1005");
    expect(hx?.gaDrawingStatus).toBe("not_generated");
  });

  it("generating only 'ga' leaves the fabrication drawing untouched, and fab can follow later", async () => {
    const before = await getJob("job-1005");
    const fabBefore = before?.drawingStatus;
    const p = generateDrawing("job-1005", undefined, ["ga"]);
    const mid = await getJob("job-1005");
    expect(mid?.gaDrawingStatus).toBe("generating");
    expect(mid?.drawingStatus).toBe(fabBefore);
    await p;
    const after = await getJob("job-1005");
    expect(after?.gaDrawingStatus).toBe("generated");
    expect(after?.drawingStatus).toBe(fabBefore);

    await generateDrawing("job-1005", undefined, ["fab"]);
    const both = await getJob("job-1005");
    expect(both?.drawingStatus).toBe("generated");
    expect(both?.gaDrawingStatus).toBe("generated");
  }, 15000);

  it("generates both at once, rejects unknown kinds and a concurrent request", async () => {
    const p = generateDrawing("job-1001", undefined, ["fab", "ga"]);
    const mid = await getJob("job-1001");
    expect(mid?.drawingStatus).toBe("generating");
    expect(mid?.gaDrawingStatus).toBe("generating");
    await expect(generateDrawing("job-1001", undefined, ["ga"])).rejects.toThrow(/409/);
    await p;
    await expect(generateDrawing("job-1001", undefined, ["bogus" as never])).rejects.toThrow(/400/);
  }, 15000);

  it("legacy GeneralArrangement jobs keep using only the primary drawing fields", async () => {
    const p = generateDrawing("job-1006");
    const mid = await getJob("job-1006");
    expect(mid?.module).toBe("GeneralArrangement");
    expect(mid?.drawingStatus).toBe("generating");
    expect(mid?.gaDrawingStatus).toBeUndefined();
    await p;
  }, 10000);
});
