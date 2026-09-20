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
import { SizingModeFields } from "./SizingModeFields";
import { IconClose, IconLoader } from "../common/Icon";

interface SubmitJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJobSubmitted: (job: JobSummary) => void;
  /** Pre-select a module and skip the module picker (used when opened from a module's own workspace page). */
  initialModule?: ModuleKind;
}

export function SubmitJobModal({
  isOpen,
  onClose,
  onJobSubmitted,
  initialModule,
}: SubmitJobModalProps) {
  const [selectedModule, setSelectedModule] = useState<ModuleKind>(
    initialModule ?? "HeatExchangerFab"
  );
  const [sizingMode, setSizingMode] = useState<SizingMode>("thermal");
  const [fields, setFields] = useState<SizingFieldValues>(DEFAULT_SIZING_FIELDS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const result = buildSizingRequest(selectedModule, sizingMode, fields);
    if ("error" in result) {
      setError(result.error);
      return;
    }

    setIsSubmitting(true);
    try {
      const newJob = await submitJob(result.request);
      onJobSubmitted(newJob);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit job to mock API."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="submit-modal-title"
      >
        <div className="modal-header">
          <div>
            <h2 id="submit-modal-title" className="modal-title">
              Submit Engineering Job
            </h2>
            <p className="modal-subtitle">
              Dispatch a background CAD and BOM synthesis task to the engine
            </p>
          </div>
          <button
            type="button"
            className="btn-close"
            onClick={onClose}
            aria-label="Close dialog"
            disabled={isSubmitting}
          >
            <IconClose size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {error && (
            <div className="alert-banner alert-banner-danger" role="alert">
              <span>{error}</span>
            </div>
          )}

          {!initialModule && (
            <div className="form-group">
              <label className="form-label" htmlFor="module-selection">
                Select Engineering Module
                <span className="form-hint">
                  Mirrors the Generate buttons in the desktop suite
                </span>
              </label>
              <div className="module-selector-grid" id="module-selection">
                {MODULE_OPTIONS.map((mod) => {
                  const IconComponent = mod.icon;
                  const isSelected = selectedModule === mod.kind;
                  return (
                    <button
                      key={mod.kind}
                      type="button"
                      className={`module-card ${isSelected ? "module-card-selected" : ""}`}
                      onClick={() => setSelectedModule(mod.kind)}
                    >
                      <div className="module-card-header">
                        <div className="module-card-icon-wrapper">
                          <IconComponent size={20} />
                        </div>
                        <span className="module-card-badge">{mod.badge}</span>
                      </div>
                      <span className="module-card-title">{mod.title}</span>
                      <p className="module-card-desc">{mod.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <SizingModeFields
            mode={sizingMode}
            onModeChange={setSizingMode}
            fields={fields}
            onFieldsChange={setFields}
            disabled={isSubmitting}
          />

          <div className="info-callout">
            <strong>Contract Notice:</strong> Submissions are sent via{" "}
            <code>submitJob(request)</code>. A new job will be queued with
            realistic processing delay.
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
              id="btn-confirm-submit-job"
            >
              {isSubmitting ? (
                <>
                  <IconLoader size={16} />
                  <span>Dispatching to Queue...</span>
                </>
              ) : (
                <span>Dispatch Job ({selectedModule})</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
