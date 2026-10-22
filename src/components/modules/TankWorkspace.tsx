import { useMemo, useState } from "react";
import type { JobSummary, ProjectInfo, TankModuleKind } from "../../types/engineering";
import { submitJob } from "../../api";
import { ApiFieldError } from "../../api/errors";
import { MODULE_OPTIONS } from "../../constants/modules";
import { TANK_FIELDS, buildTankInputs, defaultTankProjectInfo, defaultTankValues, tankDerived } from "../../constants/tankFields";
import { JobDetailView } from "../jobs/JobDetailView";
import { TankHologram } from "../cad/TankHologram";
import { tankWireFromValues } from "../cad/tankHologramGeometry";
import { useTankActivity } from "./useTankActivity";

import { IconArrowLeft, IconLoader } from "../common/Icon";

interface TankWorkspaceProps {
  module: TankModuleKind;
  jobs?: JobSummary[];
  onBackToModules: () => void;
  onGoToAllJobs: () => void;
  onJobSubmitted: (job: JobSummary) => void;
  onRefreshList: () => void;
  onDeleteJob: (jobId: string) => Promise<void>;
}

const PROJECT_FIELDS: Array<[keyof ProjectInfo, string]> = [
  ["customerName", "Customer Name"],
  ["drawingTitle", "Drawing Title"],
  ["projectNo", "Project No"],
  ["drawingNo", "Drawing No"],
  ["revision", "Revision"],
  ["date", "Date (dd-MM-yyyy)"],
  ["preparedBy", "Prepared By"],
  ["checkedBy", "Checked By"],
  ["approvedBy", "Approved By"],
];

/**
 * Workspace for the two storage-tank modules. Same page structure as the
 * heat-exchanger workspace (inputs, project information, calculate), but the
 * inputs are the desktop tank forms' own fields - Shop Tank sizes from Shell
 * I.D. and height, Site Tank from required volume and H/D - and there is no
 * nozzle schedule.
 */
export function TankWorkspace({ module, jobs = [], onBackToModules, onGoToAllJobs, onJobSubmitted, onRefreshList, onDeleteJob }: TankWorkspaceProps) {
  const [job, setJob] = useState<JobSummary | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() => defaultTankValues(module));
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>(() => defaultTankProjectInfo(module));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moduleInfo = MODULE_OPTIONS.find((m) => m.kind === module) ?? MODULE_OPTIONS[0];
  const ModuleIcon = moduleInfo.icon;
  const fields = TANK_FIELDS[module];
  const derived = tankDerived(module, values);
  const wire = useMemo(() => tankWireFromValues(module, values), [module, values]);
  const activity = useTankActivity(module, jobs);
  const hologram = <TankHologram wire={wire} running={activity.running} event={activity.event} className={`tank-hologram-${module}`} />;

  const setValue = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const built = buildTankInputs(module, values);
    if ("fieldErrors" in built) {
      setFieldErrors(built.fieldErrors);
      setError("Please correct highlighted input fields.");
      return;
    }
    setIsSubmitting(true);
    try {
      const newJob = await submitJob({
        module,
        projectInfo,
        ...(module === "ShopTank" ? { shopTank: built.inputs as never } : { siteTank: built.inputs as never }),
      });
      onJobSubmitted(newJob);
      setJob(newJob);
    } catch (err) {
      if (err instanceof ApiFieldError) setFieldErrors(err.fieldErrors);
      setError(err instanceof Error ? err.message : "Failed to submit job.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (job) {
    return (
      <div className="module-workspace tank-workspace">
        {hologram}
        <div className="module-workspace-subnav">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setJob(null)}>
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
    <div className="module-workspace tank-workspace" data-ambient-column>
      {hologram}
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

      <form onSubmit={handleSubmit} className="module-workspace-form" noValidate>
        {error && (
          <div className="alert-banner alert-banner-danger" role="alert">
            <span>{error}</span>
          </div>
        )}

        <div className="workspace-panel">
          <h3 className="workspace-panel-title">{module === "ShopTank" ? "Shop Tank Inputs" : "User Inputs"}</h3>
          <div className="workspace-fields-grid">
            {fields.map((f) => {
              if (f.visible && !f.visible(values)) return null;
              const id = `tank-${module}-${f.key}`;
              const err = fieldErrors[f.key];
              const suffix = f.unit ? `${f.label} ${f.unit}` : f.label;
              return (
                <div key={f.key} className="tank-field">
                  <div className={`shell-input-wrapper${err ? " has-error" : ""}`}>
                    {f.kind === "select" ? (
                      <select id={id} className="form-input" value={values[f.key]} disabled={isSubmitting}
                        aria-label={f.label} onChange={(e) => setValue(f.key, e.target.value)}>
                        {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <>
                        <input id={id} type="number" step={f.integer ? "1" : "any"} className="form-input text-mono"
                          value={values[f.key]} placeholder={f.label} aria-label={f.label} aria-invalid={!!err}
                          aria-describedby={err ? `${id}-err` : undefined} disabled={isSubmitting}
                          list={f.kind === "combo" ? `${id}-list` : undefined}
                          onChange={(e) => setValue(f.key, e.target.value)} />
                        {f.kind === "combo" && (
                          <datalist id={`${id}-list`}>
                            {f.options?.map((o) => <option key={o} value={o} />)}
                          </datalist>
                        )}
                      </>
                    )}
                    <span className="input-suffix">{suffix}</span>
                  </div>
                  {err && <span id={`${id}-err`} className="tank-field-error" role="alert">{err}</span>}
                </div>
              );
            })}
          </div>
          <div className="tank-derived" aria-live="polite">
            {derived.map((d) => (
              <div key={d.label} className="tank-derived-item">
                <span className="tank-derived-label">{d.label}</span>
                <span className="tank-derived-value text-mono">
                  {d.value}
                  {d.unit && d.value !== "-" ? ` ${d.unit}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="workspace-panel">
          <h3 className="workspace-panel-title">Project Information</h3>
          <div className="workspace-fields-grid workspace-fields-grid-text">
            {PROJECT_FIELDS.map(([key, label]) => (
              <div key={key} className="shell-input-wrapper">
                <input className="form-input tank-project-input" placeholder={label} aria-label={label} disabled={isSubmitting}
                  value={projectInfo[key] ?? ""} onChange={(e) => setProjectInfo((p) => ({ ...p, [key]: e.target.value }))} />
                <span className="input-suffix">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="module-workspace-form-footer">
          <button type="submit" className="btn btn-primary" disabled={isSubmitting} id="btn-workspace-calculate">
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
