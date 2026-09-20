import type { JobDetail, JobRequest, JobSummary } from "../types/engineering";
import * as mockApi from "../mocks/api";
import * as realApi from "./realApi";

export type ApiMode = "mock" | "real";

/**
 * Returns active API mode from VITE_API_MODE env variable ("mock" | "real").
 * Defaults to "mock" if not specified.
 */
export function getApiMode(): ApiMode {
  const mode = import.meta.env.VITE_API_MODE?.toLowerCase();
  return mode === "real" ? "real" : "mock";
}

export const API_MODE = getApiMode();
export const IS_REAL_API = API_MODE === "real";
export const API_BASE_URL = IS_REAL_API
  ? realApi.REAL_API_BASE_URL
  : "mock://internal";

/**
 * Lists jobs from the active backend (real or mock).
 */
export async function listJobs(): Promise<JobSummary[]> {
  return getApiMode() === "real" ? realApi.listJobs() : mockApi.listJobs();
}

/**
 * Retrieves full detail for one job.
 */
export async function getJob(jobId: string): Promise<JobDetail | undefined> {
  return getApiMode() === "real" ? realApi.getJob(jobId) : mockApi.getJob(jobId);
}

/**
 * Submits a new engineering generation job.
 */
export async function submitJob(request: JobRequest): Promise<JobSummary> {
  return getApiMode() === "real"
    ? realApi.submitJob(request)
    : mockApi.submitJob(request);
}

/**
 * Retrieves valid Shell ID presets from active backend (real or mock).
 */
export async function listShellIds(): Promise<number[]> {
  return getApiMode() === "real"
    ? realApi.listShellIds()
    : mockApi.listShellIds();
}

/**
 * Triggers CAD drawing generation for an already-completed job. This is a
 * single-machine setup — generation launches CAD directly on the machine
 * running the backend, there is nothing to download to the browser. Callers
 * should poll getJob(jobId) afterward to observe drawingStatus change.
 */
export async function generateDrawing(jobId: string): Promise<void> {
  return getApiMode() === "real"
    ? realApi.generateDrawing(jobId)
    : mockApi.generateDrawing(jobId);
}

