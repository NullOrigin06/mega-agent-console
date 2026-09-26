import type {
  JobDetail,
  JobRequest,
  JobSummary,
  LoginRequest,
  SignupRequest,
  AuthResponse,
  PairedAgentInfo,
  EngineeringDataModel,
  BomRow,
} from "../types/engineering";
import { sampleJobs, sampleJobDetails, sampleAgents, sampleEngineeringData, sampleBom } from "./fixtures";
import { validateEmail, validatePassword } from "../utils/accountValidation";


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

// EngineeringData/Bom for jobs submitted through the UI (as opposed to the
// pre-seeded sampleJobDetails fixtures). Kept separate from `jobs` itself -
// and merged onto the LIVE summary in getJob() below, never stored as a
// frozen copy - because generateDrawing() below mutates the `jobs` array
// entry directly (drawingStatus/drawingUrl). A one-time snapshot taken at
// completion would freeze drawingStatus forever and silently break
// "Generate Drawing" for any job submitted through the UI.
const jobExtras: Record<string, { engineeringData: EngineeringDataModel; bom: BomRow[] }> = {};

export async function listJobs(): Promise<JobSummary[]> {
  return delay([...jobs]);
}

export async function getJob(jobId: string): Promise<JobDetail | undefined> {
  const summary = jobs.find((j) => j.id === jobId);
  if (!summary) return delay(undefined);

  // sampleJobDetails (job-1001/job-1005) has the SAME staleness problem
  // jobExtras was built to avoid: it's a frozen object, but generateDrawing()
  // below always mutates the live `jobs` array entry's drawingStatus - never
  // sampleJobDetails. Returning the fixture object directly (as this used to)
  // meant "Generate Again" on a fixture job silently did nothing: the mock
  // dutifully flips drawingStatus on an object nobody ever reads again. Only
  // pull engineeringData/bom/drawingUrl from the fixture; status/drawingStatus
  // always come from the live summary.
  const fixture = sampleJobDetails[jobId];
  const extra = fixture
    ? { engineeringData: fixture.engineeringData, bom: fixture.bom, drawingUrl: fixture.drawingUrl }
    : jobExtras[jobId];

  return delay({ ...summary, ...extra } as JobDetail);
}

/**
 * Removes a job - lets a user clear a stuck/failed run themselves instead of
 * it sitting in the list forever. Mirrors DELETE /api/jobs/{id}.
 */
export async function deleteJob(jobId: string): Promise<void> {
  jobs = jobs.filter((j) => j.id !== jobId);
  delete sampleJobDetails[jobId];
  await delay(undefined);
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

  // Mirrors the real API: POST /api/jobs runs the engineering/BOM calc in
  // the background and settles to completed/failed within a couple seconds
  // (see mega-agent-api's Program.cs). Without this, a mock job never
  // leaves "queued" - JobDetailView polls for exactly this transition and
  // would otherwise wait on it forever.
  setTimeout(() => {
    const job = jobs.find((j) => j.id === newJob.id);
    if (job) job.status = "running";
  }, 600);
  setTimeout(() => {
    const job = jobs.find((j) => j.id === newJob.id);
    if (!job) return;
    job.status = "completed";
    job.completedAt = new Date().toISOString();

    // Also mirrors the real API: ProcessX() attaches EngineeringData/Bom to
    // the job record as part of that same background calc. Without this,
    // JobDetailView's hasEngData check (job.engineeringData) never passes
    // for a job submitted through the UI - only the pre-seeded fixtures
    // (job-1001/job-1005) had it, so every other job would sit at
    // "Data Extraction Pending" forever with no Drawing tab and no way to
    // ever generate a drawing.
    jobExtras[newJob.id] = {
      engineeringData: {
        ...sampleEngineeringData,
        shellID: shellId,
        actual: { ...sampleEngineeringData.actual, shellID: shellId },
        estimated: { ...sampleEngineeringData.estimated, shellID: shellId },
      },
      bom: sampleBom,
    };
  }, 2200);

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

let agents: PairedAgentInfo[] = [...sampleAgents];

export async function login(request: LoginRequest): Promise<AuthResponse> {
  await delay(undefined);
  if (!request.email || !request.password) {
    throw new Error("Email and password are required.");
  }
  return {
    userId: `user-mock-${request.email.split("@")[0] || "1"}`,
    apiKey: `mock-key-${Math.random().toString(36).substring(2, 10)}`,
    email: request.email,
  };
}

export async function signup(request: SignupRequest): Promise<AuthResponse> {
  await delay(undefined);
  const { normalized, error: emailError } = validateEmail(request.email);
  if (emailError) {
    throw new Error(emailError);
  }
  const passwordError = validatePassword(request.password);
  if (passwordError) {
    throw new Error(passwordError);
  }
  return {
    userId: `user-mock-${normalized.split("@")[0] || "new"}`,
    apiKey: `mock-key-${Math.random().toString(36).substring(2, 10)}`,
    email: normalized,
  };
}

// Mock mode has no real inbox to check, so these just simulate the same
// generic, enumeration-safe responses the real API returns - permissive
// about the actual token value (like checkAgentByCode above), since there's
// no real link for a developer to click here anyway.
export async function forgotPassword(email: string): Promise<{ message: string }> {
  await delay(undefined);
  console.info(`[mock] Password reset requested for ${email} - in mock mode, use any token to reset.`);
  return { message: "If an account with that email exists, a reset link has been sent." };
}

export async function resetPassword(_token: string, newPassword: string): Promise<AuthResponse> {
  await delay(undefined);
  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    throw new Error(passwordError);
  }
  return {
    userId: "user-mock-reset",
    apiKey: `mock-key-${Math.random().toString(36).substring(2, 10)}`,
  };
}

export async function verifyEmail(_token: string): Promise<{ message: string }> {
  await delay(undefined);
  return { message: "Email verified." };
}

export async function resendVerification(email: string): Promise<{ message: string }> {
  await delay(undefined);
  console.info(`[mock] Verification email resent for ${email}.`);
  return { message: "If that account needs verification, a new link has been sent." };
}

export async function rotateApiKey(email: string, password: string): Promise<AuthResponse> {
  await delay(undefined);
  if (!password) {
    throw new Error("Password is required.");
  }
  return {
    userId: `user-mock-${email.split("@")[0] || "1"}`,
    apiKey: `mock-key-${Math.random().toString(36).substring(2, 10)}`,
  };
}

export async function listAgents(): Promise<PairedAgentInfo[]> {
  return delay([...agents]);
}

export async function pairAgent(pairingCode: string): Promise<PairedAgentInfo> {
  await delay(undefined);
  const trimmed = pairingCode.trim();
  if (!/^\d{3}-\d{3}$/.test(trimmed)) {
    throw new Error("Invalid pairing code format. Expected XXX-XXX (e.g. 482-913).");
  }
  const existing = agents.find((a) => a.agentId === `agent-${trimmed}`);
  if (existing) {
    existing.online = true;
    return existing;
  }
  const newAgent: PairedAgentInfo = {
    agentId: `agent-${trimmed}`,
    name: `Workstation-${trimmed}`,
    online: true,
    pairedAt: new Date().toISOString(),
  };
  agents = [newAgent, ...agents];
  return newAgent;
}


