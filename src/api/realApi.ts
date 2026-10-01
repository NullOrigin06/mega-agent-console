import type {
  JobDetail,
  JobRequest,
  JobSummary,
  EngineeringDataModel,
  EngineeringValues,
  BomRow,
  LoginRequest,
  SignupRequest,
  AuthResponse,
  PairedAgentInfo,
} from "../types/engineering";
import { getAuthSession, clearAuthSession } from "../utils/authSession";

// `let`, not `const`: public/runtime-config.json can replace the build-time
// value at startup (see applyRuntimeApiBaseUrl), so a new API address only
// needs a JSON change - not a Vercel env-var edit plus a forced rebuild.
export let REAL_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5299/api/jobs";

/** Accepts the API's bare origin (e.g. "https://host") as published in runtime-config.json. */
export function applyRuntimeApiBaseUrl(apiOrigin: string): void {
  REAL_API_BASE_URL = `${apiOrigin.replace(/\/+$/, "")}/api/jobs`;
}

function currentApiOrigin(): string {
  return new URL(REAL_API_BASE_URL, window.location.origin).origin;
}

/**
 * Re-reads public/runtime-config.json (the file the Local Agent also reads)
 * and applies its API address. Returns true only if the address changed.
 * Never throws; on any failure the current address stays in effect.
 */
export async function refreshRuntimeApiBaseUrl(timeoutMs = 3000): Promise<boolean> {
  const before = REAL_API_BASE_URL;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/runtime-config.json?t=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const config = (await res.json()) as { apiBaseUrl?: unknown };
    if (typeof config.apiBaseUrl === "string" && /^https?:\/\//i.test(config.apiBaseUrl.trim())) {
      applyRuntimeApiBaseUrl(config.apiBaseUrl.trim());
    }
  } catch {
    // Missing/invalid file or timeout.
  } finally {
    window.clearTimeout(timer);
  }
  return REAL_API_BASE_URL !== before;
}

// Long enough to ride out a tunnel replacement on the demo host: the
// watchdog notices (~30s), opens a new tunnel (~20s), and Vercel deploys
// the new runtime-config.json (~60s).
export const API_RELOCATION_WINDOW_MS = 150_000;
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 10_000];

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * fetch() that survives the API being briefly unreachable or moving to a
 * new tunnel address while this page is open. On a network-level failure
 * it keeps retrying with backoff for API_RELOCATION_WINDOW_MS, re-reading
 * runtime-config.json before each attempt so it switches to a newly
 * published address as soon as one appears. Network-level failures from a
 * dead tunnel never reach the API, so the retried request isn't a repeat.
 */
async function fetchApi(input: string, init?: RequestInit): Promise<Response> {
  const deadline = Date.now() + API_RELOCATION_WINDOW_MS;
  let url = input;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      const origin = currentApiOrigin();
      if (init?.signal?.aborted || !url.startsWith(origin) || Date.now() >= deadline) throw err;
      await sleep(RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]);
      await refreshRuntimeApiBaseUrl();
      url = currentApiOrigin() + url.slice(origin.length);
    }
  }
}

export function getApiRootUrl(): string {
  return REAL_API_BASE_URL.replace(/\/jobs\/?$/, "");
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const session = getAuthSession();
  const apiKey = session?.apiKey || (import.meta.env.VITE_API_KEY as string | undefined);
  return {
    ...(apiKey ? { "X-Api-Key": apiKey } : {}),
    ...extra,
  };
}

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers = authHeaders(init?.headers as Record<string, string> | undefined);
  const res = await fetchApi(input, {
    ...init,
    headers,
  });

  if (res.status === 401) {
    clearAuthSession();
    throw new Error("Unauthorized: Session expired or invalid credentials.");
  }

  return res;
}


// In-memory cache for jobs submitted in this session (e.g. synthetic failed jobs)
const clientSessionJobs = new Map<string, JobDetail>();

function normalizeEngineeringValues(
  data: Partial<EngineeringDataModel> = {}
): EngineeringValues {
  return {
    shellID: data.shellID ?? 0,
    tubeQty: data.tubeQty ?? 0,
    tubeSheetFinishTHK: data.tubeSheetFinishTHK ?? 25,
    tubeSheetRawTHK: data.tubeSheetRawTHK ?? 28,
    bodyFlangeFinishTHK: data.bodyFlangeFinishTHK ?? 36,
    bodyFlangeRawTHK: data.bodyFlangeRawTHK ?? 39,
    partitionPlateTHK: data.partitionPlateTHK ?? 5,
    baffleTHK: data.baffleTHK ?? 4,
    baffleOD: data.baffleOD ?? 0,
    boltSize: data.boltSize ?? "M20",
    boltLength: data.boltLength ?? 90,
    noOfBolts: data.noOfBolts ?? 28,
    holeDia: data.holeDia ?? 22.5,
    flangeID: data.flangeID ?? 0,
    boltPCD: data.boltPCD ?? 0,
    tubeSheetFinishOD: data.tubeSheetFinishOD ?? 0,
    tubeSheetRawOD: data.tubeSheetRawOD ?? 0,
    linerGasketOD: data.linerGasketOD ?? 0,
    tieRodDia: data.tieRodDia ?? 12,
    tieRodQty: data.tieRodQty ?? 6,
    spacerTube: data.spacerTube ?? 0,
    bonnetShellFSLength: 500,
    bonnetShellRSLength: 500,
    bonnetShellTHK: 5,
    dishendTHK: 5,
  };
}

function normalizeEngineeringData(
  raw?: Record<string, unknown>
): EngineeringDataModel | undefined {
  if (!raw) return undefined;

  const shellID = Number(raw.shellID ?? raw.shellId ?? 0);
  const tubeOD = Number(raw.tubeOD ?? raw.tubeOd ?? 25.4);
  const tubeQty = Number(raw.tubeQty ?? 0);
  const noOfPass = Number(raw.noOfPass ?? 1);
  const hta = Number(raw.hta ?? 0);
  const tubeLength = Number(raw.tubeLength ?? 3000);
  const baffleQty = Number(raw.baffleQty ?? 5);
  const material = String(raw.material ?? "SS304 / Carbon Steel");
  const tubeTHK = Number(raw.tubeTHK ?? raw.tubeThk ?? 1.6);
  const baffleOD = Number(raw.baffleOD ?? raw.baffleOd ?? 0);
  const materialDensity = Number(raw.materialDensity ?? 8.0);

  const baseValues = normalizeEngineeringValues({
    shellID,
    tubeQty,
    baffleQty,
    baffleOD,
  });

  const actual = (raw.actual as EngineeringValues) || { ...baseValues };
  const estimated = (raw.estimated as EngineeringValues) || { ...baseValues };
  const nozzles = Array.isArray(raw.nozzles) ? raw.nozzles : [];

  return {
    tubeOD,
    tubeQty,
    noOfPass,
    hta,
    tubeLength,
    baffleQty,
    material,
    tubeTHK,
    shellID,
    tubeSheetFinishTHK: actual.tubeSheetFinishTHK,
    tubeSheetRawTHK: actual.tubeSheetRawTHK,
    bodyFlangeFinishTHK: actual.bodyFlangeFinishTHK,
    bodyFlangeRawTHK: actual.bodyFlangeRawTHK,
    partitionPlateTHK: actual.partitionPlateTHK,
    baffleTHK: actual.baffleTHK,
    baffleOD: actual.baffleOD,
    boltSize: actual.boltSize,
    boltLength: actual.boltLength,
    noOfBolts: actual.noOfBolts,
    holeDia: actual.holeDia,
    flangeID: actual.flangeID,
    boltPCD: actual.boltPCD,
    tubeSheetFinishOD: actual.tubeSheetFinishOD,
    tubeSheetRawOD: actual.tubeSheetRawOD,
    linerGasketOD: actual.linerGasketOD,
    tieRodDia: actual.tieRodDia,
    tieRodQty: actual.tieRodQty,
    spacerTube: actual.spacerTube,
    materialDensity,
    actual,
    estimated,
    nozzles,
  };
}

function normalizeBomRows(rawRows?: unknown[]): BomRow[] | undefined {
  if (!Array.isArray(rawRows)) return undefined;
  return rawRows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      itemNo: String(row.itemNo ?? row.ItemNo ?? ""),
      description: String(row.description ?? row.Description ?? ""),
      moc: String(row.moc ?? row.Moc ?? ""),
      dimension: String(row.dimension ?? row.Dimension ?? ""),
      qty: Number(row.qty ?? row.Qty ?? 0),
      weightKg: Number(row.weightKg ?? row.WeightKg ?? 0),
      remark: String(row.remark ?? row.Remark ?? "-"),
    };
  });
}

/**
 * Real API client calling mega-agent-api endpoints:
 * - GET    /api/jobs
 * - GET    /api/jobs/{id}
 * - POST   /api/jobs
 */

export async function listJobs(): Promise<JobSummary[]> {
  try {
    const res = await apiFetch(REAL_API_BASE_URL, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      throw new Error(`Real API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as JobSummary[];
    // Merge any client-cached session jobs (e.g. locally captured failed jobs) that aren't on the backend
    const apiJobIds = new Set(data.map((j) => j.id));
    const extraJobs: JobSummary[] = [];
    for (const [id, detail] of clientSessionJobs.entries()) {
      if (!apiJobIds.has(id)) {
        extraJobs.push(detail);
      }
    }

    return [...extraJobs, ...data];
  } catch (err) {
    // If backend is unreachable, surface client session jobs or propagate
    console.warn(`[realApi] listJobs fetch error from ${REAL_API_BASE_URL}:`, err);
    if (clientSessionJobs.size > 0) {
      return Array.from(clientSessionJobs.values());
    }
    throw err;
  }
}

export async function getJob(jobId: string): Promise<JobDetail | undefined> {
  // Check client session cache first (e.g. for synthetic not-implemented failed jobs)
  if (clientSessionJobs.has(jobId)) {
    return clientSessionJobs.get(jobId);
  }

  try {
    const url = `${REAL_API_BASE_URL.replace(/\/+$/, "")}/${encodeURIComponent(jobId)}`;
    const res = await apiFetch(url, {
      headers: { Accept: "application/json" },
    });

    if (res.status === 404) {
      return undefined;
    }

    if (!res.ok) {
      throw new Error(`Real API getJob error: ${res.status} ${res.statusText}`);
    }

    const raw = (await res.json()) as Record<string, unknown>;

    const detail: JobDetail = {
      id: String(raw.id),
      module: raw.module as JobDetail["module"],
      shellId: Number(raw.shellId),
      status: raw.status as JobDetail["status"],
      createdAt: String(raw.createdAt),
      completedAt: raw.completedAt ? String(raw.completedAt) : undefined,
      errorMessage: raw.errorMessage ? String(raw.errorMessage) : undefined,
      engineeringData: normalizeEngineeringData(
        raw.engineeringData as Record<string, unknown> | undefined
      ),
      bom: normalizeBomRows(raw.bom as unknown[] | undefined),
      drawingUrl: (() => {
        if (!raw.drawingUrl) return undefined;
        const urlStr = String(raw.drawingUrl);
        if (urlStr.startsWith("http://") || urlStr.startsWith("https://")) {
          return urlStr;
        }
        try {
          const origin = new URL(REAL_API_BASE_URL).origin;
          return `${origin}${urlStr.startsWith("/") ? "" : "/"}${urlStr}`;
        } catch {
          return urlStr;
        }
      })(),
      drawingStatus: (raw.drawingStatus as JobDetail["drawingStatus"]) ?? "not_generated",
      drawingError: raw.drawingError ? String(raw.drawingError) : undefined,
    };

    return detail;
  } catch (err) {
    console.warn(`[realApi] getJob error for ${jobId}:`, err);
    return clientSessionJobs.get(jobId);
  }
}

export async function deleteJob(jobId: string): Promise<void> {
  clientSessionJobs.delete(jobId);
  const url = `${REAL_API_BASE_URL.replace(/\/+$/, "")}/${encodeURIComponent(jobId)}`;
  const res = await apiFetch(url, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete job (${res.status}): ${res.statusText}`);
  }
}

export async function submitJob(request: JobRequest): Promise<JobSummary> {
  try {
    const res = await apiFetch(REAL_API_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const errorText = await res.text();
      const failedJob: JobDetail = {
        id: `job-${Math.floor(1000 + Math.random() * 9000)}`,
        module: request.module,
        shellId: request.shellId ?? 0,
        status: "failed",
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        errorMessage: `API Error (${res.status}): ${errorText || res.statusText}`,
        drawingStatus: "not_generated",
      };

      clientSessionJobs.set(failedJob.id, failedJob);
      return failedJob;
    }

    const created = (await res.json()) as JobSummary;

    if (created.status === "failed") {
      const failedDetail: JobDetail = {
        ...created,
      };
      clientSessionJobs.set(created.id, failedDetail);
    }

    return created;
  } catch (err) {
    const failedJob: JobDetail = {
      id: `job-${Math.floor(1000 + Math.random() * 9000)}`,
      module: request.module,
      shellId: request.shellId ?? 0,
      status: "failed",
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      errorMessage: `Connection failed: Could not reach real API at ${REAL_API_BASE_URL} (${err instanceof Error ? err.message : "Network error"}).`,
      drawingStatus: "not_generated",
    };

    clientSessionJobs.set(failedJob.id, failedJob);
    return failedJob;
  }
}

export async function generateDrawing(jobId: string, agentId?: string): Promise<void> {
  const url = `${REAL_API_BASE_URL.replace(/\/+$/, "")}/${encodeURIComponent(jobId)}/generate-drawing`;
  const res = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId: agentId ?? null }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(
      `Failed to start drawing generation (${res.status}): ${errorText || res.statusText}`
    );
  }
}

export async function checkAgentByCode(
  pairingCode: string
): Promise<{ agentId: string; isOnline: boolean }> {
  const base = getApiRootUrl();
  const url = `${base}/agents/by-code/${encodeURIComponent(pairingCode)}`;
  const res = await apiFetch(url, { headers: { Accept: "application/json" } });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("No agent is registered with that pairing code.");
    }
    throw new Error(`Failed to look up agent (${res.status}): ${res.statusText}`);
  }

  return res.json();
}

export async function listShellIds(): Promise<number[]> {
  const url = `${getApiRootUrl()}/shell-ids`;
  const res = await apiFetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(
      `Real API listShellIds error: ${res.status} ${res.statusText}`
    );
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("Invalid response format for shell-ids: expected array");
  }

  return data.map((n) => Number(n)).filter((n) => !Number.isNaN(n) && n > 0);
}

export async function login(request: LoginRequest): Promise<AuthResponse> {
  const url = `${getApiRootUrl()}/auth/login`;
  const res = await fetchApi(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    let errorText = "";
    try {
      const data = await res.json();
      errorText = data.error || data.message || "";
    } catch {
      errorText = await res.text().catch(() => "");
    }
    throw new Error(errorText || `Login failed (${res.status} ${res.statusText})`);
  }

  const data = (await res.json()) as AuthResponse;
  return {
    userId: String(data.userId),
    apiKey: String(data.apiKey),
    email: request.email,
  };
}

export async function signup(request: SignupRequest): Promise<AuthResponse> {
  const url = `${getApiRootUrl()}/auth/signup`;
  const res = await fetchApi(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    let errorText = "";
    try {
      const data = await res.json();
      errorText = data.error || data.message || "";
    } catch {
      errorText = await res.text().catch(() => "");
    }
    throw new Error(errorText || `Signup failed (${res.status} ${res.statusText})`);
  }

  const data = (await res.json()) as AuthResponse;
  return {
    userId: String(data.userId),
    apiKey: String(data.apiKey),
    email: request.email,
  };
}

async function postAuth(path: string, body: unknown): Promise<Response> {
  return fetchApi(`${getApiRootUrl()}/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
}

async function throwIfNotOk(res: Response, fallbackMessage: string): Promise<void> {
  if (res.ok) return;
  let errorText = "";
  try {
    const data = await res.json();
    errorText = data.error || data.message || "";
  } catch {
    errorText = await res.text().catch(() => "");
  }
  throw new Error(errorText || `${fallbackMessage} (${res.status} ${res.statusText})`);
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const res = await postAuth("forgot-password", { email });
  await throwIfNotOk(res, "Request failed");
  return res.json();
}

export async function resetPassword(token: string, newPassword: string): Promise<AuthResponse> {
  const res = await postAuth("reset-password", { token, newPassword });
  await throwIfNotOk(res, "Reset failed");
  const data = (await res.json()) as AuthResponse;
  return { userId: String(data.userId), apiKey: String(data.apiKey) };
}

export async function verifyEmail(token: string): Promise<{ message: string }> {
  const res = await postAuth("verify-email", { token });
  await throwIfNotOk(res, "Verification failed");
  return res.json();
}

export async function resendVerification(email: string): Promise<{ message: string }> {
  const res = await postAuth("resend-verification", { email });
  await throwIfNotOk(res, "Request failed");
  return res.json();
}

export async function rotateApiKey(email: string, password: string): Promise<AuthResponse> {
  const res = await postAuth("rotate-key", { email, password });
  await throwIfNotOk(res, "Key rotation failed");
  const data = (await res.json()) as AuthResponse;
  return { userId: String(data.userId), apiKey: String(data.apiKey) };
}

export async function listAgents(): Promise<PairedAgentInfo[]> {
  const url = `${getApiRootUrl()}/agents`;
  const res = await apiFetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Failed to list agents (${res.status}): ${res.statusText}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((item: Record<string, unknown>) => ({
    agentId: String(item.agentId ?? item.id ?? ""),
    name: item.name ? String(item.name) : undefined,
    online: Boolean(item.online ?? item.isOnline ?? false),
    pairedAt: String(item.pairedAt ?? item.registeredAt ?? new Date().toISOString()),
  }));
}

export async function pairAgent(pairingCode: string): Promise<PairedAgentInfo> {
  const trimmed = pairingCode.trim();
  const status = await checkAgentByCode(trimmed);
  return {
    agentId: status.agentId,
    name: `Agent-${trimmed}`,
    online: status.isOnline,
    pairedAt: new Date().toISOString(),
  };
}



