import type { EngineeringDataModel, EngineeringValues, JobDetail, NozzleItem } from "../../types/engineering";

export interface VesselNozzle {
  id: string;
  /** Bore in mm (nominal size is close enough for a model). */
  sizeMm: number;
  /** Angle around the shell axis, degrees, 0 = top, 90 = right (looking from the front). */
  angleDeg: number;
  service: string;
}

/** Everything the 3D twin draws, in millimetres. */
export interface VesselSpec {
  /** The job the dimensions came from; null = typical proportions. */
  jobId: string | null;
  shellId: number;
  tubeLength: number;
  tubeOD: number;
  tubeQty: number;
  baffleQty: number;
  baffleOD: number;
  tubeSheetOD: number;
  tubeSheetThk: number;
  flangeThk: number;
  boltPCD: number;
  boltQty: number;
  bonnetFrontLength: number;
  bonnetRearLength: number;
  nozzles: VesselNozzle[];
}

/** A representative 800 mm shell, used until a real Heat Exchanger Fab job exists. */
export const TYPICAL_VESSEL: VesselSpec = {
  jobId: null,
  shellId: 800,
  tubeLength: 3000,
  tubeOD: 19.05,
  tubeQty: 420,
  baffleQty: 6,
  baffleOD: 795,
  tubeSheetOD: 950,
  tubeSheetThk: 25,
  flangeThk: 36,
  boltPCD: 900,
  boltQty: 24,
  bonnetFrontLength: 500,
  bonnetRearLength: 500,
  nozzles: [
    { id: "N1", sizeMm: 100, angleDeg: 0, service: "Shell inlet" },
    { id: "N2", sizeMm: 100, angleDeg: 0, service: "Shell outlet" },
  ],
};

const positive = (...values: Array<number | undefined>) =>
  values.find((v) => typeof v === "number" && Number.isFinite(v) && v > 0);

function parseAngle(orientation: string): number {
  const text = orientation.trim().toLowerCase();
  const degrees = /(-?\d+(?:\.\d+)?)\s*°?/.exec(text);
  if (degrees && !/^[a-z]/.test(text)) return Number(degrees[1]);
  if (text.startsWith("bot")) return 180;
  if (text.startsWith("right")) return 90;
  if (text.startsWith("left")) return 270;
  return 0;
}

function toNozzle(n: NozzleItem, index: number): VesselNozzle {
  return {
    id: n.nozzleNo || `N${index + 1}`,
    sizeMm: positive(parseFloat(n.size)) ?? 100,
    angleDeg: parseAngle(n.orientation || ""),
    service: n.service?.trim() || (index % 2 === 0 ? "Inlet" : "Outlet"),
  };
}

/**
 * Real dimensions from a completed Heat Exchanger Fab job. Estimated values
 * win (they're what drives the job's CAD and BOM), then Actual, then the
 * root field; anything still missing falls back to the typical vessel so a
 * partial record never produces a broken model.
 */
export function vesselSpecFromJob(job: JobDetail): VesselSpec | null {
  const data: EngineeringDataModel | undefined = job.engineeringData;
  if (!data) return null;

  const est: Partial<EngineeringValues> = data.estimated ?? {};
  const act: Partial<EngineeringValues> = data.actual ?? {};
  const pick = <K extends keyof EngineeringValues>(key: K, typical: number): number =>
    positive(est[key] as number | undefined, act[key] as number | undefined, (data as unknown as Record<string, number>)[key]) ?? typical;

  const nozzles = (data.nozzles ?? []).filter((n) => n.nozzleNo || n.size).slice(0, 8).map(toNozzle);

  return {
    jobId: job.id,
    shellId: pick("shellID", positive(job.shellId) ?? TYPICAL_VESSEL.shellId),
    tubeLength: positive(data.tubeLength) ?? TYPICAL_VESSEL.tubeLength,
    tubeOD: positive(data.tubeOD) ?? TYPICAL_VESSEL.tubeOD,
    tubeQty: Math.round(pick("tubeQty", TYPICAL_VESSEL.tubeQty)),
    baffleQty: Math.round(positive(data.baffleQty) ?? TYPICAL_VESSEL.baffleQty),
    baffleOD: pick("baffleOD", TYPICAL_VESSEL.baffleOD),
    tubeSheetOD: pick("tubeSheetFinishOD", TYPICAL_VESSEL.tubeSheetOD),
    tubeSheetThk: pick("tubeSheetFinishTHK", TYPICAL_VESSEL.tubeSheetThk),
    flangeThk: pick("bodyFlangeFinishTHK", TYPICAL_VESSEL.flangeThk),
    boltPCD: pick("boltPCD", TYPICAL_VESSEL.boltPCD),
    boltQty: Math.round(pick("noOfBolts", TYPICAL_VESSEL.boltQty)),
    bonnetFrontLength: pick("bonnetShellFSLength", TYPICAL_VESSEL.bonnetFrontLength),
    bonnetRearLength: pick("bonnetShellRSLength", TYPICAL_VESSEL.bonnetRearLength),
    nozzles: nozzles.length > 0 ? nozzles : TYPICAL_VESSEL.nozzles,
  };
}
