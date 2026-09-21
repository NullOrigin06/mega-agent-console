/**
 * Mock API contract for Mega Agent Console.
 *
 * These types mirror real field names from the .NET side
 * (MegaEngineeringSuite.Engineering: EngineeringDataModel, EngineeringValues,
 * NozzleItem, HeatExchangerFabData) so that swapping the mock API client in
 * src/mocks/api.ts for a real HTTP client later is a small, low-risk change —
 * not a redesign of every component that consumes this data.
 *
 * IMPORTANT — read before building UI against these types:
 *
 * 1. There is currently NO real HTTP API. Nothing in the .NET repo exposes
 *    these shapes over a network yet — this file is a forward-looking
 *    contract, not a description of something that exists today.
 *
 * 2. Several fields below have CONFIRMED, UNRESOLVED divergences in the
 *    source engineering logic (different modules compute them differently,
 *    or use different hardcoded constants). Do not build UI that implies a
 *    single authoritative value exists for: tube pitch, material density,
 *    the "0.7854 vs 0.785" circle-area factor, the OTL boundary rule, or the
 *    dish-end blank diameter formula. If the UI ever needs to show one of
 *    these, show it as computed-by-this-module, not as ground truth.
 *
 * 3. BomRow below is a DISPLAY-NORMALIZED shape invented for this console.
 *    The real .NET codebase has NO shared BOM abstraction (confirmed finding
 *    BOM-14 in MegaEngineeringSuite/docs/EXTRACTION_ANALYSIS.md) — each
 *    module builds its own BOM fields independently. Treat BomRow as "how
 *    we choose to display it here," not as an existing backend contract.
 */

export type ModuleKind = "TubeSheet" | "BonnetFlange" | "HeatExchangerFab";

export type JobStatus = "queued" | "running" | "completed" | "failed";

/**
 * Separate from JobStatus: a job can be "completed" (BOM/engineering data
 * succeeded) while DrawingStatus is independently "generating" or "failed" —
 * drawing generation is a distinct, later, explicit step (the user clicks
 * "Generate Drawing"), not part of job submission. Mirrors the .NET API's
 * JobRecord.DrawingStatus exactly (mega-agent-api/Program.cs).
 */
export type DrawingStatus = "not_generated" | "generating" | "generated" | "failed";

/**
 * Project Information / title-block fields, mirroring Form3's "Project
 * Information" panel and MegaEngineeringSuite.CadAutomation.DrawingInformation.
 * All optional — the API fills in the same defaults Form3 itself used
 * (e.g. PreparedBy "NSS") for anything left blank.
 */
export interface ProjectInfo {
  customerName?: string;
  drawingTitle?: string;
  projectNo?: string;
  drawingNo?: string;
  revision?: string;
  preparedBy?: string;
  checkedBy?: string;
  approvedBy?: string;
}

/**
 * Request to start a new generation run. Mirrors Form3's real "User Inputs"
 * panel (hta/tubeOD/tubeLength/tubeThk/noOfPass/baffleQty, all required),
 * its "Project Information" panel, and its Nozzle Input/Schedule grid.
 * `shellId` is not settable from the workspace form — Shell ID is always
 * derived server-side from the thermal-sizing inputs above, as in Form3.
 */
export interface JobRequest {
  module: ModuleKind;
  shellId?: number;
  hta?: number;
  tubeOD?: number;
  tubeLength?: number;
  noOfPass?: number;
  tubeThk?: number;
  baffleQty?: number;
  nozzles?: NozzleItem[];
  projectInfo?: ProjectInfo;
}

/** Summary row for a job list / history view. */
export interface JobSummary {
  id: string;
  module: ModuleKind;
  shellId: number;
  status: JobStatus;
  createdAt: string; // ISO 8601
  completedAt?: string; // ISO 8601
  errorMessage?: string;
  drawingStatus: DrawingStatus;
}

/** Full detail for one job, including the engineering data and BOM once available. */
export interface JobDetail extends JobSummary {
  engineeringData?: EngineeringDataModel;
  bom?: BomRow[];
  drawingUrl?: string; // present once drawingStatus === "generated" — this is a single-machine setup, so this is informational, not a browser download target
  drawingError?: string;
}

/**
 * Mirrors MegaEngineeringSuite.Engineering.EngineeringDataModel (.NET).
 * Field names match exactly; not every .NET field is included here, only
 * the ones a review/editing screen plausibly needs. Extend as needed —
 * keep names identical to the .NET source when you do.
 */
export interface EngineeringDataModel {
  tubeOD: number;
  tubeQty: number;
  noOfPass: number;
  hta: number;
  tubeLength: number;
  baffleQty: number;
  material: string;
  tubeTHK: number;
  shellID: number;
  tubeSheetFinishTHK: number;
  tubeSheetRawTHK: number;
  bodyFlangeFinishTHK: number;
  bodyFlangeRawTHK: number;
  partitionPlateTHK: number;
  baffleTHK: number;
  baffleOD: number;
  boltSize: string;
  boltLength: number;
  noOfBolts: number;
  holeDia: number;
  flangeID: number;
  boltPCD: number;
  tubeSheetFinishOD: number;
  tubeSheetRawOD: number;
  linerGasketOD: number;
  tieRodDia: number;
  tieRodQty: number;
  spacerTube: number;
  materialDensity: number;
  /** Reference snapshot taken at Excel-load time. Read-only in the UI. */
  actual: EngineeringValues;
  /**
   * The value that is authoritative for downstream geometry/weight/BOM/CAD
   * output once a user edits it, despite the name reading as the opposite
   * of "authoritative." Editable in the UI.
   */
  estimated: EngineeringValues;
  nozzles: NozzleItem[];
}

/** Mirrors MegaEngineeringSuite.EngineeringValues (.NET). Shared shape for both Actual and Estimated. */
export interface EngineeringValues {
  shellID: number;
  tubeQty: number;
  tubeSheetFinishTHK: number;
  tubeSheetRawTHK: number;
  bodyFlangeFinishTHK: number;
  bodyFlangeRawTHK: number;
  partitionPlateTHK: number;
  baffleTHK: number;
  baffleOD: number;
  boltSize: string;
  boltLength: number;
  noOfBolts: number;
  holeDia: number;
  flangeID: number;
  boltPCD: number;
  tubeSheetFinishOD: number;
  tubeSheetRawOD: number;
  linerGasketOD: number;
  tieRodDia: number;
  tieRodQty: number;
  spacerTube: number;
  bonnetShellFSLength: number;
  bonnetShellRSLength: number;
  bonnetShellTHK: number;
  dishendTHK: number;
}

/** Mirrors MegaEngineeringSuite.NozzleItem (.NET). All fields are free strings on the .NET side today. */
export interface NozzleItem {
  nozzleNo: string;
  size: string;
  unit: string;
  schedule: string;
  type: string;
  rating: string;
  projection: string;
  service: string;
  orientation: string;
  remark: string;
}

/**
 * Display-normalized BOM row for this console (see file-level note above).
 * Not a 1:1 mirror of any single .NET class.
 */
export interface BomRow {
  itemNo: string;
  description: string;
  moc: string; // material of construction
  dimension: string;
  qty: number;
  weightKg: number;
  remark: string;
}

export * from "./auth";

