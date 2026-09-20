import type { JobRequest, ModuleKind, NozzleItem, ProjectInfo } from "../types/engineering";

export interface WorkspaceFieldValues {
  hta: string;
  tubeOD: string;
  tubeLength: string;
  tubeThk: string;
  noOfPass: string;
  baffleQty: string;
  shellIdOverride: string;
}

export const DEFAULT_WORKSPACE_FIELDS: WorkspaceFieldValues = {
  hta: "120",
  tubeOD: "25.4",
  tubeLength: "3000",
  tubeThk: "1.6",
  noOfPass: "2",
  baffleQty: "5",
  shellIdOverride: "",
};

/**
 * Builds the full job submission from Form3's real User Inputs panel plus
 * an optional Shell ID override (OnEstimatedShellIdChanged) - a directly-
 * typed Shell ID is an alternative/override to the thermal calculation, not
 * the only way to submit a job. Tube THK/Baffle Qty/Project Info/Nozzles
 * are independent of which path produced the Shell ID.
 */
export function buildWorkspaceRequest(
  module: ModuleKind,
  fields: WorkspaceFieldValues,
  projectInfo: ProjectInfo,
  nozzles: NozzleItem[]
): { request: JobRequest } | { error: string } {
  const trimmedOverride = fields.shellIdOverride.trim();
  const hasShellIdOverride = trimmedOverride.length > 0;

  const parsedTubeThk = fields.tubeThk.trim() ? Number.parseFloat(fields.tubeThk.trim()) : undefined;
  const parsedBaffleQty = fields.baffleQty.trim() ? Number.parseInt(fields.baffleQty.trim(), 10) : undefined;

  if (parsedTubeThk !== undefined && (Number.isNaN(parsedTubeThk) || parsedTubeThk <= 0)) {
    return { error: "Tube THK must be a positive number." };
  }
  if (parsedBaffleQty !== undefined && (Number.isNaN(parsedBaffleQty) || parsedBaffleQty <= 0)) {
    return { error: "Baffle Qty must be a positive whole number." };
  }

  const cleanProjectInfo = Object.fromEntries(
    Object.entries(projectInfo).filter(([, v]) => typeof v === "string" && v.trim().length > 0)
  ) as ProjectInfo;
  const projectInfoOrUndefined = Object.keys(cleanProjectInfo).length > 0 ? cleanProjectInfo : undefined;

  if (hasShellIdOverride) {
    const parsedShellId = Number.parseInt(trimmedOverride, 10);
    if (Number.isNaN(parsedShellId) || parsedShellId <= 0) {
      return { error: "Shell ID override must be a valid positive number." };
    }
    if (parsedShellId < 150 || parsedShellId > 4000) {
      return { error: "Shell ID must typically be between 150 mm and 4000 mm." };
    }

    return {
      request: {
        module,
        shellId: parsedShellId,
        tubeThk: parsedTubeThk,
        baffleQty: parsedBaffleQty,
        nozzles,
        projectInfo: projectInfoOrUndefined,
      },
    };
  }

  const parsedHta = Number.parseFloat(fields.hta.trim());
  const parsedTubeOD = Number.parseFloat(fields.tubeOD.trim());
  const parsedTubeLength = Number.parseFloat(fields.tubeLength.trim());
  const parsedNoOfPass = Number.parseInt(fields.noOfPass.trim(), 10);

  if (
    Number.isNaN(parsedHta) || parsedHta <= 0 ||
    Number.isNaN(parsedTubeOD) || parsedTubeOD <= 0 ||
    Number.isNaN(parsedTubeLength) || parsedTubeLength <= 0 ||
    Number.isNaN(parsedNoOfPass) || parsedNoOfPass <= 0
  ) {
    return {
      error: "Please enter valid positive values for HTA, Tube OD, Tube Length, and No. of Pass (or fill in the Shell ID override instead).",
    };
  }

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
