import { useState } from "react";
import type { ModuleKind, JobSummary } from "../../types/engineering";
import { submitJob } from "../../api";
import {
  IconClose,
  IconDisc,
  IconCylinder,
  IconLayers,
  IconLoader,
} from "../common/Icon";

interface SubmitJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJobSubmitted: (job: JobSummary) => void;
}

const MODULE_OPTIONS: {
  kind: ModuleKind;
  title: string;
  badge: string;
  description: string;
  icon: typeof IconDisc;
}[] = [
  {
    kind: "TubeSheet",
    title: "Tube Sheet",
    badge: "TS-GEN",
    description:
      "Generates tube sheet layout, tube pitch pattern, drilling holes, and tube sheet raw/finish geometry.",
    icon: IconDisc,
  },
  {
    kind: "BonnetFlange",
    title: "Bonnet Flange",
    badge: "BF-GEN",
    description:
      "Calculates body flange dimensions, bonnet front/rear shell lengths, dishend geometry, and bolting PCD.",
    icon: IconCylinder,
  },
  {
    kind: "HeatExchangerFab",
    title: "Heat Exchanger Fab",
    badge: "HX-FAB",
    description:
      "Full heat exchanger fabrication package: Shell, Tube Bundle, Baffles, Nozzles, CAD Drawing & BOM generation.",
    icon: IconLayers,
  },
];

export function SubmitJobModal({
  isOpen,
  onClose,
  onJobSubmitted,
}: SubmitJobModalProps) {
  const [selectedModule, setSelectedModule] =
    useState<ModuleKind>("HeatExchangerFab");
  const [shellId, setShellId] = useState<string>("914");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedShellId = Number.parseInt(shellId.trim(), 10);

    if (Number.isNaN(parsedShellId) || parsedShellId <= 0) {
      setError("Please enter a valid positive Shell ID (inner diameter in mm).");
      return;
    }

    if (parsedShellId < 150 || parsedShellId > 4000) {
      setError("Shell ID must typically be between 150 mm and 4000 mm.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const newJob = await submitJob({
        module: selectedModule,
        shellId: parsedShellId,
      });
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

          <div className="form-group">
            <label className="form-label" htmlFor="input-shell-id">
              Shell ID (Inner Diameter, mm)
              <span className="form-hint">
                Nominal inner diameter of the cylindrical shell
              </span>
            </label>
            <div className="shell-input-wrapper">
              <input
                id="input-shell-id"
                type="number"
                min="150"
                max="4000"
                step="1"
                className="form-input text-mono"
                value={shellId}
                onChange={(e) => setShellId(e.target.value)}
                placeholder="e.g. 914"
                disabled={isSubmitting}
                required
              />
              <span className="input-suffix">mm</span>
            </div>
          </div>

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
