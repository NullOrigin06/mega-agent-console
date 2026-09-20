import type {
  JobDetail,
  JobRequest,
  JobSummary,
  EngineeringDataModel,
  EngineeringValues,
  BomRow,
} from "../types/engineering";

export const REAL_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5299/api/jobs";

// mega-agent-api requires this on every /api/* request once it's reachable
// beyond localhost (see Program.cs's API key middleware) — without it every
// call gets a 401. Safe to leave unset for pure-localhost development.
const API_KEY = import.meta.env.VITE_API_KEY as string | undefined;

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
    ...extra,
  };
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
    const res = await fetch(REAL_API_BASE_URL, {
      headers: authHeaders({ Accept: "application/json" }),
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
    const res = await fetch(url, {
      headers: authHeaders({ Accept: "application/json" }),
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

export async function submitJob(request: JobRequest): Promise<JobSummary> {
  // All three modules (HeatExchangerFab, TubeSheet, BonnetFlange) are fully
  // wired in mega-agent-api now — no module-specific "not implemented"
  // special-casing here anymore. Surface whatever the real API actually
  // says, since inventing a friendlier/different error would misrepresent
  // real failures (e.g. a genuine Shell-ID-not-found error for TubeSheet
  // would otherwise get mislabeled as "not implemented").
  try {
    const res = await fetch(REAL_API_BASE_URL, {
      method: "POST",
      headers: authHeaders({
        "Content-Type": "application/json",
        Accept: "application/json",
      }),
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

    // Check if the backend immediately returned a failed job
    // (e.g. ExcelLookupService throwing for non-existent Shell ID)
    if (created.status === "failed") {
      const failedDetail: JobDetail = {
        ...created,
      };
      clientSessionJobs.set(created.id, failedDetail);
    }

    return created;
  } catch (err) {
    // Network connection failed or server is not running.
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

/**
 * Triggers real CAD drawing generation for an already-completed job
 * (POST /api/jobs/{id}/generate-drawing). This is a single-machine setup —
 * generation launches GstarCAD/AutoCAD directly on the machine running
 * mega-agent-api; nothing is returned to the browser for the user to
 * download. Callers should poll getJob(jobId) to observe drawingStatus
 * transition from "generating" to "generated" or "failed".
 */
export async function generateDrawing(jobId: string): Promise<void> {
  const url = `${REAL_API_BASE_URL.replace(/\/+$/, "")}/${encodeURIComponent(jobId)}/generate-drawing`;
  const res = await fetch(url, { method: "POST", headers: authHeaders() });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(
      `Failed to start drawing generation (${res.status}): ${errorText || res.statusText}`
    );
  }
}

/**
 * Retrieves the list of valid Shell IDs from the real API (GET /api/shell-ids).
 */
export async function listShellIds(): Promise<number[]> {
  const url = `${REAL_API_BASE_URL.replace(/\/jobs\/?$/, "")}/shell-ids`;
  const res = await fetch(url, {
    headers: authHeaders({ Accept: "application/json" }),
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

