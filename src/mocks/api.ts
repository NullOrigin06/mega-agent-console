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

/**
 * JS mirror of MegaEngineeringSuite.Engineering.TubeSizingCalculator, used
 * only so the mock/offline demo mode computes a Shell ID the same way the
 * real API does when thermal sizing inputs are submitted instead of a
 * direct Shell ID. Keep in sync with TubeSizingCalculator.cs if it changes.
 */
function calculateShellIdFromThermalInputs(
  hta: number,
  tubeOD: number,
  tubeLength: number,
  noOfPass: number
): number {
  const rawTubeQty = hta / ((tubeOD / 1000) * Math.PI * (tubeLength / 1000));
  const tubesPerPass = Math.ceil(rawTubeQty / noOfPass);
  const tubeQty = tubesPerPass * noOfPass;
  const shellIdRaw =
    (Math.sqrt(tubeQty) + 1.25 * Math.sqrt(noOfPass)) * 1.25 * 1.05 * tubeOD + 25;
  return Math.ceil(shellIdRaw / 10) * 10;
}

export async function submitJob(request: JobRequest): Promise<JobSummary> {
  const usedThermalSizing =
    request.hta != null &&
    request.tubeOD != null &&
    request.tubeLength != null &&
    request.noOfPass != null;

  const shellId = usedThermalSizing
    ? calculateShellIdFromThermalInputs(
        request.hta!,
        request.tubeOD!,
        request.tubeLength!,
        request.noOfPass!
      )
    : (request.shellId ?? 0);

  const newJob: JobSummary = {
    id: `job-${Math.floor(1000 + Math.random() * 9000)}`,
    module: request.module,
    shellId,
    status: "queued",
    createdAt: new Date().toISOString(),
    drawingStatus: "not_generated",
  };
  jobs = [newJob, ...jobs];
  return delay(newJob);
}

export async function listShellIds(): Promise<number[]> {
  return delay([600, 700, 800, 900, 1000, 1100, 1200]);
}

/**
 * Mock version of the real "generate drawing" step (mega-agent-api's
 * POST /api/jobs/{id}/generate-drawing). Simulates a real CAD generation
 * delay, then flips drawingStatus to "generated" — matches the real API's
 * behavior of tracking drawing generation separately from job Status.
 * agentId is accepted for signature parity with the real client but has no
 * effect in mock mode — there's no real agent to route to.
 */
export async function generateDrawing(jobId: string, _agentId?: string): Promise<void> {
  const job = jobs.find((j) => j.id === jobId);
  if (job) {
    job.drawingStatus = "generating";
  }
  await delay(undefined);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  if (job) {
    job.drawingStatus = "generated";
  }
}

/**
 * Mock version of GET /api/agents/by-code/{code} — accepts any 6-digit-
 * looking code (\d{3}-\d{3}) and pretends it's a valid, online agent, so
 * the pairing UI can be exercised in mock mode without a real agent running.
 */
export async function checkAgentByCode(
  pairingCode: string
): Promise<{ agentId: string; isOnline: boolean }> {
  await delay(undefined);
  if (!/^\d{3}-\d{3}$/.test(pairingCode.trim())) {
    throw new Error("No agent is registered with that pairing code.");
  }
  return { agentId: `mock-agent-${pairingCode.trim()}`, isOnline: true };
}

