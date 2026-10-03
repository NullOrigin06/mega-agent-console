import { useState } from "react";
import type { ModuleKind, JobSummary, ProjectInfo, NozzleItem } from "../../types/engineering";
import { submitJob } from "../../api";
import { MODULE_OPTIONS, isTankModule } from "../../constants/modules";
import { getDefaultNozzleSchedule, getDefaultGaNozzleSchedule, NOZZLE_SIZES_GA } from "../../constants/nozzleDefaults";
import {
  buildWorkspaceRequest,
  DEFAULT_WORKSPACE_FIELDS,
  type WorkspaceFieldValues,
} from "../../utils/workspaceValidation";
import { NozzleScheduleEditor } from "../jobs/NozzleScheduleEditor";
import { JobDetailView } from "../jobs/JobDetailView";
import { IconArrowLeft, IconLoader } from "../common/Icon";
import { TankWorkspace } from "./TankWorkspace";

interface ModuleWorkspaceProps {
  module: ModuleKind;
  /** Live job list (the tank hologram reacts to this module's running/finished jobs). */
  jobs?: JobSummary[];
  onBackToModules: () => void;
  onGoToAllJobs: () => void;
  onJobSubmitted: (job: JobSummary) => void;
  onRefreshList: () => void;
  onDeleteJob: (jobId: string) => Promise<void>;
}

const DRAWING_TITLES: Partial<Record<ModuleKind, string>> = {
  TubeSheet: "TUBE SHEET",
  BonnetFlange: "BONNET FLANGE",
  HeatExchangerFab: "HEAT EXCHANGER",
  GeneralArrangement: "GENERAL ARRANGEMENT DRG FOR",
};

/** Title-block defaults: the desktop Form3 project/drawing numbers and sign-offs, tank-style customer/title. */
function defaultProjectInfo(module: ModuleKind): ProjectInfo {
  return {
    customerName: "MEGA CLIENT",
    drawingTitle: DRAWING_TITLES[module] ?? "",
    projectNo: "25-005",
    drawingNo: module === "GeneralArrangement" ? "25-005-GAD-EX-1405" : "25-005-FLG-EX-1405",
    revision: "0",
    preparedBy: "NSS",
    checkedBy: "ASK",
    approvedBy: "ASK",
  };
}

const PROJECT_FIELDS: Array<[keyof ProjectInfo, string]> = [
  ["customerName", "Customer Name"],
  ["drawingTitle", "Drawing Title"],
  ["projectNo", "Project No"],
  ["drawingNo", "Drawing No"],
  ["revision", "Revision"],
  ["preparedBy", "Prepared By"],
  ["checkedBy", "Checked By"],
  ["approvedBy", "Approved By"],
];

/**
 * Per-module workspace page, mirroring the desktop suite's Form3 in full:
 * User Inputs (HTA/Tube OD/Tube Length/Tube THK/No. of Pass/Baffle Qty),
 * Project Information, and the Nozzle Input/Schedule grid all live on one
 * screen. All six User Inputs are required, matching Form3.ValidateInputs —
 * there is no direct Shell ID entry point; Shell ID is always derived from
 * these inputs. Submitting switches this same page to show the full result
 * (JobDetailView) inline.
 */
export function ModuleWorkspace(props: ModuleWorkspaceProps) {
  const { module } = props;
  // Keyed by module: switching modules must start a fresh form (no carried-over values or results).
  return isTankModule(module) ? <TankWorkspace key={module} {...props} module={module} /> : <ExchangerWorkspace key={module} {...props} />;
}

/** Heat-exchanger family workspace (Tube Sheet, Bonnet Flange, HX Fab) - Form3. */
function ExchangerWorkspace({
  module,
  onBackToModules,
  onGoToAllJobs,
  onJobSubmitted,
  onRefreshList,
  onDeleteJob,
}: ModuleWorkspaceProps) {
  const [job, setJob] = useState<JobSummary | null>(null);
  const [fields, setFields] = useState<WorkspaceFieldValues>(() => (module === "GeneralArrangement" ? { ...DEFAULT_WORKSPACE_FIELDS, hta: "140", tubeThk: "1.2" } : DEFAULT_WORKSPACE_FIELDS));
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>(() => defaultProjectInfo(module));
  const [nozzles, setNozzles] = useState<NozzleItem[]>(() => (module === "GeneralArrangement" ? getDefaultGaNozzleSchedule() : getDefaultNozzleSchedule()));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moduleInfo = MODULE_OPTIONS.find((m) => m.kind === module) ?? MODULE_OPTIONS[0];
  const ModuleIcon = moduleInfo.icon;

  const setField = (key: keyof WorkspaceFieldValues, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const setProjectField = (key: keyof ProjectInfo, value: string) => {
    setProjectInfo((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const result = buildWorkspaceRequest(module, fields, projectInfo, nozzles);
    if ("error" in result) {
      setError(result.error);
      return;
    }

    setIsSubmitting(true);
    try {
      const newJob = await submitJob(result.request);
      onJobSubmitted(newJob);
      setJob(newJob);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit job.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (job) {
    return (
      <div className="module-workspace">
        <div className="module-workspace-subnav">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setJob(null)}
          >
            <IconArrowLeft size={16} />
            <span>New {moduleInfo.title} Run</span>
          </button>
          <button type="button" className="btn-link" onClick={onGoToAllJobs}>
            View in All Jobs →
          </button>
        </div>
        <JobDetailView
          jobId={job.id}
          onBack={() => setJob(null)}
          onRefreshList={onRefreshList}
          onDeleteJob={async (jobId) => {
            await onDeleteJob(jobId);
            setJob(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="module-workspace" data-ambient-column>
      <div className="module-workspace-subnav" data-ambient-quiet>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onBackToModules}>
          <IconArrowLeft size={16} />
          <span>Back to Modules</span>
        </button>
        <button type="button" className="btn-link" onClick={onGoToAllJobs}>
          View All Jobs →
        </button>
      </div>

      <div className="module-workspace-header" data-ambient-header data-ambient-quiet>
        <div className="module-workspace-icon">
          <ModuleIcon size={28} />
        </div>
        <div>
          <span className="module-card-badge">{moduleInfo.badge}</span>
          <h1 className="module-workspace-title">{moduleInfo.title}</h1>
          <p className="module-workspace-desc">{moduleInfo.description}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="module-workspace-form">
        {error && (
          <div className="alert-banner alert-banner-danger" role="alert">
            <span>{error}</span>
          </div>
        )}

        {/* User Inputs — mirrors Form3's "User Inputs" panel exactly */}
        <div className="workspace-panel">
          <h3 className="workspace-panel-title">User Inputs</h3>
          <div className="workspace-fields-grid">
            <div className="shell-input-wrapper">
              <input
                type="number" min="0" step="any" className="form-input text-mono"
                value={fields.hta} onChange={(e) => setField("hta", e.target.value)}
                placeholder="HTA" disabled={isSubmitting} required
              />
              <span className="input-suffix">HTA m²</span>
            </div>
            <div className="shell-input-wrapper">
              <input
                type="number" min="0" step="any" className="form-input text-mono"
                value={fields.tubeOD} onChange={(e) => setField("tubeOD", e.target.value)}
                placeholder="Tube OD" disabled={isSubmitting} required
              />
              <span className="input-suffix">Tube OD mm</span>
            </div>
            <div className="shell-input-wrapper">
              <input
                type="number" min="0" step="any" className="form-input text-mono"
                value={fields.tubeLength} onChange={(e) => setField("tubeLength", e.target.value)}
                placeholder="Tube Length" disabled={isSubmitting} required
              />
              <span className="input-suffix">Tube Length mm</span>
            </div>
            <div className="shell-input-wrapper">
              <input
                type="number" min="0" step="any" className="form-input text-mono"
                value={fields.tubeThk} onChange={(e) => setField("tubeThk", e.target.value)}
                placeholder="Tube THK" disabled={isSubmitting} required
              />
              <span className="input-suffix">Tube THK mm</span>
            </div>
            <div className="shell-input-wrapper">
              <input
                type="number" min="1" step="1" className="form-input text-mono"
                value={fields.noOfPass} onChange={(e) => setField("noOfPass", e.target.value)}
                placeholder="No. of Pass" disabled={isSubmitting} required
              />
              <span className="input-suffix">No. of Pass</span>
            </div>
            <div className="shell-input-wrapper">
              <input
                type="number" min="1" step="1" className="form-input text-mono"
                value={fields.baffleQty} onChange={(e) => setField("baffleQty", e.target.value)}
                placeholder="Baffle Qty" disabled={isSubmitting} required
              />
              <span className="input-suffix">Baffle Qty</span>
            </div>
          </div>
        </div>

        {/* Project Information — mirrors Form3's title-block panel */}
        <div className="workspace-panel">
          <h3 className="workspace-panel-title">Project Information</h3>
          <div className="workspace-fields-grid workspace-fields-grid-text">
            {PROJECT_FIELDS.map(([key, label]) => (
              <div key={key} className="shell-input-wrapper">
                <input className="form-input tank-project-input" placeholder={label} aria-label={label} disabled={isSubmitting}
                  value={projectInfo[key] ?? ""} onChange={(e) => setProjectField(key, e.target.value)} />
                <span className="input-suffix">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Nozzle Input/Schedule — mirrors Form3's nozzle grid */}
        <div className="workspace-panel">
          <h3 className="workspace-panel-title">Nozzle Input / Schedule</h3>
          <NozzleScheduleEditor
            nozzles={nozzles}
            onChange={setNozzles}
            disabled={isSubmitting}
            showPosition={module === "GeneralArrangement"}
            sizes={module === "GeneralArrangement" ? NOZZLE_SIZES_GA : undefined}
          />
          {module === "GeneralArrangement" && (
            <p className="section-subtitle" style={{ marginTop: 10 }}>
              Projection is measured from the shell centre to the flange face. GA Position is the nozzle axis distance from the left tube-sheet face
              (blank = reference position for N1-N7, automatic spacing otherwise). Nozzles at 0°/180° are not drawn on the GA. The schedule table of the drawing is filled from this list.
            </p>
          )}
        </div>

        <div className="module-workspace-form-footer">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting}
            id="btn-workspace-calculate"
          >
            {isSubmitting ? (
              <>
                <IconLoader size={16} className="animate-spin" />
                <span>Calculating...</span>
              </>
            ) : (
              <span>Calculate & Continue</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
