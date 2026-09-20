import { useState } from "react";
import type { ModuleKind, JobSummary } from "../../types/engineering";
import { submitJob } from "../../api";
import { MODULE_OPTIONS } from "../../constants/modules";
import {
  buildSizingRequest,
  DEFAULT_SIZING_FIELDS,
  type SizingMode,
  type SizingFieldValues,
} from "../../utils/sizingValidation";
import { SizingModeFields } from "../jobs/SizingModeFields";
import { JobDetailView } from "../jobs/JobDetailView";
import { IconArrowLeft, IconLoader } from "../common/Icon";

interface ModuleWorkspaceProps {
  module: ModuleKind;
  onBackToModules: () => void;
  onGoToAllJobs: () => void;
  onJobSubmitted: (job: JobSummary) => void;
  onRefreshList: () => void;
}

/**
 * Per-module workspace page, mirroring the desktop suite's Form3: pick a
 * module (ModulesHome) -> land here -> size it -> the full calculated
 * result (Actual/Estimated values, nozzles, BOM, drawing generation) shows
 * inline on this same page, all for one module, all in one place. A run
 * started here still shows up in the "All Jobs" dashboard for later review.
 */
export function ModuleWorkspace({
  module,
  onBackToModules,
  onGoToAllJobs,
  onJobSubmitted,
  onRefreshList,
}: ModuleWorkspaceProps) {
  const [job, setJob] = useState<JobSummary | null>(null);
  const [sizingMode, setSizingMode] = useState<SizingMode>("thermal");
  const [fields, setFields] = useState<SizingFieldValues>(DEFAULT_SIZING_FIELDS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moduleInfo = MODULE_OPTIONS.find((m) => m.kind === module) ?? MODULE_OPTIONS[0];
  const ModuleIcon = moduleInfo.icon;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const result = buildSizingRequest(module, sizingMode, fields);
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
        />
      </div>
    );
  }

  return (
    <div className="module-workspace">
      <div className="module-workspace-subnav">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onBackToModules}>
          <IconArrowLeft size={16} />
          <span>Back to Modules</span>
        </button>
        <button type="button" className="btn-link" onClick={onGoToAllJobs}>
          View All Jobs →
        </button>
      </div>

      <div className="module-workspace-header">
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

        <SizingModeFields
          mode={sizingMode}
          onModeChange={setSizingMode}
          fields={fields}
          onFieldsChange={setFields}
          disabled={isSubmitting}
        />

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
