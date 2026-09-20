import type { JobRequest, ModuleKind } from "../types/engineering";

export type SizingMode = "thermal" | "direct";

export interface SizingFieldValues {
  shellId: string;
  hta: string;
  tubeOD: string;
  tubeLength: string;
  noOfPass: string;
}

export const DEFAULT_SIZING_FIELDS: SizingFieldValues = {
  shellId: "914",
  hta: "120",
  tubeOD: "25.4",
  tubeLength: "3000",
  noOfPass: "2",
};

/**
 * Validates the sizing form's raw string inputs and builds the JobRequest
 * body, mirroring Form3's two real entry paths (BtnCalculate_Click for
 * thermal sizing, OnEstimatedShellIdChanged for a direct Shell ID). Shared
 * between SubmitJobModal and ModuleWorkspace so both validate identically.
 */
export function buildSizingRequest(
  module: ModuleKind,
  mode: SizingMode,
  fields: SizingFieldValues
): { request: JobRequest } | { error: string } {
  if (mode === "direct") {
    const parsedShellId = Number.parseInt(fields.shellId.trim(), 10);

    if (Number.isNaN(parsedShellId) || parsedShellId <= 0) {
      return { error: "Please enter a valid positive Shell ID (inner diameter in mm)." };
    }
    if (parsedShellId < 150 || parsedShellId > 4000) {
      return { error: "Shell ID must typically be between 150 mm and 4000 mm." };
    }

    return { request: { module, shellId: parsedShellId } };
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
      error: "Please enter valid positive values for HTA, Tube OD, Tube Length, and No. of Pass.",
    };
  }

  return {
    request: {
      module,
      hta: parsedHta,
      tubeOD: parsedTubeOD,
      tubeLength: parsedTubeLength,
      noOfPass: parsedNoOfPass,
    },
  };
}
