import type { JobDetail, JobRequest, JobSummary } from "../types/engineering";
import { sampleJobs, sampleJobDetails } from "./fixtures";

/**
 * Mock API client. Function signatures here are the CONTRACT — build UI
 * against these functions, not against fixtures.ts directly, so that
 * replacing this file's internals with real `fetch(...)` calls later
 * requires no changes in any component.
 *
 * Artificial delay is added so loading states are visible during development.
 */

const DELAY_MS = 400;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), DELAY_MS));
}

let jobs: JobSummary[] = [...sampleJobs];

export async function listJobs(): Promise<JobSummary[]> {
  return delay([...jobs]);
}

export async function getJob(jobId: string): Promise<JobDetail | undefined> {
  const detail = sampleJobDetails[jobId];
  if (detail) return delay(detail);
  const summary = jobs.find((j) => j.id === jobId);
  return delay(summary as JobDetail | undefined);
}

export async function submitJob(request: JobRequest): Promise<JobSummary> {
  const newJob: JobSummary = {
    id: `job-${Math.floor(1000 + Math.random() * 9000)}`,
    module: request.module,
    shellId: request.shellId,
    status: "queued",
    createdAt: new Date().toISOString(),
  };
  jobs = [newJob, ...jobs];
  return delay(newJob);
}
