import type {
  JobDetail,
  JobRequest,
  JobSummary,
  LoginRequest,
  SignupRequest,
  AuthResponse,
  PairedAgentInfo,
} from "../types/engineering";
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
 * Deletes a job - lets a user clear a stuck, failed, or otherwise unwanted
 * run from the dashboard themselves.
 */
export async function deleteJob(jobId: string): Promise<void> {
  return getApiMode() === "real" ? realApi.deleteJob(jobId) : mockApi.deleteJob(jobId);
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
 * Triggers CAD drawing generation for an already-completed job. When
 * agentId is given (a paired Local Agent, see utils/agentPairing.ts),
 * generation runs on that agent's own machine/GstarCAD — not on whatever
 * machine hosts the backend. Callers should poll getJob(jobId) afterward to
 * observe drawingStatus change.
 */
export async function generateDrawing(jobId: string, agentId?: string): Promise<void> {
  return getApiMode() === "real"
    ? realApi.generateDrawing(jobId, agentId)
    : mockApi.generateDrawing(jobId, agentId);
}

/**
 * Looks up a Local Agent by pairing code, confirming it's real and online.
 */
export async function checkAgentByCode(
  pairingCode: string
): Promise<{ agentId: string; isOnline: boolean }> {
  return getApiMode() === "real"
    ? realApi.checkAgentByCode(pairingCode)
    : mockApi.checkAgentByCode(pairingCode);
}

/**
 * Authenticates an existing user account.
 */
export async function login(request: LoginRequest): Promise<AuthResponse> {
  return getApiMode() === "real"
    ? realApi.login(request)
    : mockApi.login(request);
}

/**
 * Creates a new user account and returns session tokens.
 */
export async function signup(request: SignupRequest): Promise<AuthResponse> {
  return getApiMode() === "real"
    ? realApi.signup(request)
    : mockApi.signup(request);
}

/**
 * Lists all paired Local Agents associated with the active account.
 */
export async function listAgents(): Promise<PairedAgentInfo[]> {
  return getApiMode() === "real"
    ? realApi.listAgents()
    : mockApi.listAgents();
}

/**
 * Pairs a new Local Agent to the user's account using the pairing code.
 */
export async function pairAgent(pairingCode: string): Promise<PairedAgentInfo> {
  return getApiMode() === "real"
    ? realApi.pairAgent(pairingCode)
    : mockApi.pairAgent(pairingCode);
}

export type { LoginRequest, SignupRequest, AuthResponse, PairedAgentInfo };


