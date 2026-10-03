import type { JobRequest, ModuleKind, NozzleItem, ProjectInfo } from "../types/engineering";

export interface WorkspaceFieldValues {
  hta: string;
  tubeOD: string;
  tubeLength: string;
  tubeThk: string;
  noOfPass: string;
  baffleQty: string;
}

/** Starting values for a new run (a ready-to-calculate example, like the tank forms). */
export const DEFAULT_WORKSPACE_FIELDS: WorkspaceFieldValues = {
  hta: "100",
  tubeOD: "25.4",
  tubeLength: "3000",
  tubeThk: "1.6",
  noOfPass: "4",
  baffleQty: "5",
};

/**
 * Builds the full job submission from Form3's real User Inputs panel.
 * Mirrors Form3.ValidateInputs: HTA, Tube OD, Tube Length, Tube THK, No. of
 * Pass, and Baffle Qty are all required positive numbers (Baffle Qty/No. of
 * Pass whole numbers) — there is no direct Shell ID entry in production;
 * Shell ID is always derived from these inputs.
 */
export function buildWorkspaceRequest(
  module: ModuleKind,
  fields: WorkspaceFieldValues,
  projectInfo: ProjectInfo,
  nozzles: NozzleItem[]
): { request: JobRequest } | { error: string } {
  const parsedHta = Number.parseFloat(fields.hta.trim());
  const parsedTubeOD = Number.parseFloat(fields.tubeOD.trim());
  const parsedTubeLength = Number.parseFloat(fields.tubeLength.trim());
  const parsedTubeThk = Number.parseFloat(fields.tubeThk.trim());
  const parsedNoOfPass = Number.parseInt(fields.noOfPass.trim(), 10);
  const parsedBaffleQty = Number.parseInt(fields.baffleQty.trim(), 10);

  if (
    Number.isNaN(parsedHta) || parsedHta <= 0 ||
    Number.isNaN(parsedTubeOD) || parsedTubeOD <= 0 ||
    Number.isNaN(parsedTubeLength) || parsedTubeLength <= 0 ||
    Number.isNaN(parsedTubeThk) || parsedTubeThk <= 0 ||
    Number.isNaN(parsedNoOfPass) || parsedNoOfPass <= 0 ||
    Number.isNaN(parsedBaffleQty) || parsedBaffleQty <= 0
  ) {
    return {
      error: "HTA, Tube OD, Tube Length, Tube THK, No. of Pass, and Baffle Qty are all required and must be positive numbers.",
    };
  }

  if (module === "GeneralArrangement") {
    const bad = nozzles.find((n) => {
      const p = (n.position ?? "").trim();
      return p.length > 0 && !Number.isFinite(Number(p));
    });
    if (bad) {
      return { error: `Nozzle ${bad.nozzleNo || "?"}: GA Position must be a number (mm from the left tube-sheet face) or blank.` };
    }
  }

  const cleanProjectInfo = Object.fromEntries(
    Object.entries(projectInfo).filter(([, v]) => typeof v === "string" && v.trim().length > 0)
  ) as ProjectInfo;
  const projectInfoOrUndefined = Object.keys(cleanProjectInfo).length > 0 ? cleanProjectInfo : undefined;

  return {
    request: {
      module,
      hta: parsedHta,
      tubeOD: parsedTubeOD,
      tubeLength: parsedTubeLength,
      noOfPass: parsedNoOfPass,
      tubeThk: parsedTubeThk,
      baffleQty: parsedBaffleQty,
      nozzles,
      projectInfo: projectInfoOrUndefined,
    },
  };
}
