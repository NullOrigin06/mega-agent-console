import type {
  EngineeringDataModel,
  BomRow,
  JobSummary,
  JobDetail,
  PairedAgentInfo,
} from "../types/engineering";


/**
 * Sample values below are illustrative only, loosely modeled on default
 * values that appear in the .NET source (e.g. TubeOD/TubeTHK defaults in
 * EngineeringDataModel.cs, and the sample HeatExchangerFabData.cs constants).
 * They are NOT verified engineering output for any real Shell ID. Do not
 * present numbers from this file as if they came from a real calculation.
 */

export const sampleEngineeringData: EngineeringDataModel = {
  tubeOD: 25.4,
  tubeQty: 488,
  noOfPass: 1,
  hta: 120.5,
  tubeLength: 3000,
  baffleQty: 5,
  material: "SS304 / Carbon Steel",
  tubeTHK: 1.6,
  shellID: 914,
  tubeSheetFinishTHK: 25,
  tubeSheetRawTHK: 28,
  bodyFlangeFinishTHK: 36,
  bodyFlangeRawTHK: 39,
  partitionPlateTHK: 5,
  baffleTHK: 4,
  baffleOD: 909,
  boltSize: "M20",
  boltLength: 90,
  noOfBolts: 28,
  holeDia: 22.5,
  flangeID: 932,
  boltPCD: 1020,
  tubeSheetFinishOD: 1070,
  tubeSheetRawOD: 1073,
  linerGasketOD: 984,
  tieRodDia: 12,
  tieRodQty: 6,
  spacerTube: 0,
  materialDensity: 8.0,
  actual: {
    shellID: 914,
    tubeQty: 488,
    tubeSheetFinishTHK: 25,
    tubeSheetRawTHK: 28,
    bodyFlangeFinishTHK: 36,
    bodyFlangeRawTHK: 39,
    partitionPlateTHK: 5,
    baffleTHK: 4,
    baffleOD: 909,
    boltSize: "M20",
    boltLength: 90,
    noOfBolts: 28,
    holeDia: 22.5,
    flangeID: 932,
    boltPCD: 1020,
    tubeSheetFinishOD: 1070,
    tubeSheetRawOD: 1073,
    linerGasketOD: 984,
    tieRodDia: 12,
    tieRodQty: 6,
    spacerTube: 0,
    bonnetShellFSLength: 500,
    bonnetShellRSLength: 500,
    bonnetShellTHK: 5,
    dishendTHK: 5,
  },
  estimated: {
    shellID: 914,
    tubeQty: 488,
    tubeSheetFinishTHK: 25,
    tubeSheetRawTHK: 28,
    bodyFlangeFinishTHK: 36,
    bodyFlangeRawTHK: 39,
    partitionPlateTHK: 5,
    baffleTHK: 4,
    baffleOD: 909,
    boltSize: "M20",
    boltLength: 90,
    noOfBolts: 28,
    holeDia: 22.5,
    flangeID: 932,
    boltPCD: 1020,
    tubeSheetFinishOD: 1070,
    tubeSheetRawOD: 1073,
    linerGasketOD: 984,
    tieRodDia: 12,
    tieRodQty: 6,
    spacerTube: 0,
    bonnetShellFSLength: 500,
    bonnetShellRSLength: 500,
    bonnetShellTHK: 5,
    dishendTHK: 5,
  },
  nozzles: [
    {
      nozzleNo: "N1",
      size: "100",
      unit: "NB",
      schedule: "40",
      type: "LJFF",
      rating: "150#",
      projection: "150",
      service: "Inlet",
      orientation: "Top",
      remark: "-",
    },
    {
      nozzleNo: "N2",
      size: "100",
      unit: "NB",
      schedule: "40",
      type: "LJFF",
      rating: "150#",
      projection: "150",
      service: "Outlet",
      orientation: "Top",
      remark: "-",
    },
  ],
};

export const sampleBom: BomRow[] = [
  { itemNo: "1", description: "SHELL", moc: "SA 240 Gr 304", dimension: "914 OD x 5 THK x 2906 LG", qty: 1, weightKg: 312.4, remark: "-" },
  { itemNo: "2", description: "DISH END", moc: "SA 240 Gr 304", dimension: "1070 OD x 8 THK", qty: 2, weightKg: 84.2, remark: "-" },
  { itemNo: "3", description: "TUBE SHEET", moc: "SA 240 Gr 304", dimension: "1070 OD x 25 THK", qty: 2, weightKg: 156.8, remark: "-" },
  { itemNo: "4", description: "TUBE (ERW)", moc: "SA 249 TP304", dimension: "25.4 OD x 1.6 THK x 3000 LG", qty: 488, weightKg: 612.0, remark: "-" },
  { itemNo: "5", description: "BAFFLE", moc: "SA 240 Gr 304", dimension: "909 OD x 4 THK", qty: 5, weightKg: 45.6, remark: "-" },
];

export const sampleJobs: JobSummary[] = [
  { id: "job-1001", module: "HeatExchangerFab", shellId: 914, status: "completed", createdAt: "2026-09-19T10:12:00Z", completedAt: "2026-09-19T10:14:32Z", drawingStatus: "generated", gaDrawingStatus: "not_generated" },
  { id: "job-1002", module: "TubeSheet", shellId: 762, status: "running", createdAt: "2026-09-20T08:01:00Z", drawingStatus: "not_generated" },
  { id: "job-1003", module: "BonnetFlange", shellId: 1100, status: "failed", createdAt: "2026-09-19T16:40:00Z", completedAt: "2026-09-19T16:41:05Z", errorMessage: "GEN-001: Ensure CAD is running properly.", drawingStatus: "not_generated" },
  { id: "job-1004", module: "HeatExchangerFab", shellId: 600, status: "queued", createdAt: "2026-09-20T09:00:00Z", drawingStatus: "not_generated", gaDrawingStatus: "not_generated" },
  { id: "job-1005", module: "HeatExchangerFab", shellId: 800, status: "completed", createdAt: "2026-09-20T09:05:00Z", completedAt: "2026-09-20T09:05:03Z", drawingStatus: "not_generated", gaDrawingStatus: "not_generated" },
  // Legacy General Arrangement job (module kind kept for old jobs): groups under Heat Exchanger, single-drawing UI.
  { id: "job-1006", module: "GeneralArrangement", shellId: 700, status: "completed", createdAt: "2026-09-20T09:30:00Z", completedAt: "2026-09-20T09:30:03Z", drawingStatus: "generated" },
];

export const sampleJobDetails: Record<string, JobDetail> = {
  "job-1001": {
    ...sampleJobs[0],
    engineeringData: sampleEngineeringData,
    bom: sampleBom,
    drawingUrl: "/mock-drawings/job-1001.pdf",
  },
  "job-1005": {
    ...sampleJobs[4],
    engineeringData: sampleEngineeringData,
    bom: sampleBom,
  },
  "job-1006": {
    ...sampleJobs[5],
    engineeringData: sampleEngineeringData,
    bom: sampleBom,
  },
};

export const sampleAgents: PairedAgentInfo[] = [
  {
    agentId: "agent-wks-01",
    name: "Engineering-CAD-01",
    online: true,
    pairedAt: "2026-09-20T10:00:00.000Z",
  },
  {
    agentId: "agent-wks-02",
    name: "Workshop-CAD-02",
    online: true,
    pairedAt: "2026-09-19T14:30:00.000Z",
  },
  {
    agentId: "agent-wks-03",
    name: "Remote-Office-PC",
    online: false,
    pairedAt: "2026-09-18T09:15:00.000Z",
  },
];

