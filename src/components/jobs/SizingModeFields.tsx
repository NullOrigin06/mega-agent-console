import type { SizingMode, SizingFieldValues } from "../../utils/sizingValidation";

interface SizingModeFieldsProps {
  mode: SizingMode;
  onModeChange: (mode: SizingMode) => void;
  fields: SizingFieldValues;
  onFieldsChange: (fields: SizingFieldValues) => void;
  disabled?: boolean;
}

/**
 * The sizing-mode toggle + input fields, shared between SubmitJobModal and
 * ModuleWorkspace. Purely presentational/controlled - validation lives in
 * utils/sizingValidation.ts so both call sites validate identically.
 */
export function SizingModeFields({
  mode,
  onModeChange,
  fields,
  onFieldsChange,
  disabled = false,
}: SizingModeFieldsProps) {
  const setField = (key: keyof SizingFieldValues, value: string) => {
    onFieldsChange({ ...fields, [key]: value });
  };

  return (
    <>
      <div className="form-group">
        <label className="form-label" htmlFor="sizing-mode-selection">
          Sizing Input
          <span className="form-hint">
            Mirrors the two entry paths in the desktop suite's Form3
          </span>
        </label>
        <div className="sizing-mode-toggle" id="sizing-mode-selection">
          <button
            type="button"
            className={`btn ${mode === "thermal" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => onModeChange("thermal")}
            disabled={disabled}
          >
            Thermal Sizing (calculate Shell ID)
          </button>
          <button
            type="button"
            className={`btn ${mode === "direct" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => onModeChange("direct")}
            disabled={disabled}
          >
            Enter Shell ID Directly
          </button>
        </div>
      </div>

      {mode === "thermal" ? (
        <div className="form-group">
          <label className="form-label">
            Thermal Sizing Inputs
            <span className="form-hint">
              Shell ID is calculated from these, same as BtnCalculate_Click in the desktop app
            </span>
          </label>
          <div className="thermal-inputs-grid">
            <div className="shell-input-wrapper">
              <input
                id="input-hta"
                type="number"
                min="0"
                step="any"
                className="form-input text-mono"
                value={fields.hta}
                onChange={(e) => setField("hta", e.target.value)}
                placeholder="HTA"
                disabled={disabled}
                required
              />
              <span className="input-suffix">HTA m²</span>
            </div>
            <div className="shell-input-wrapper">
              <input
                id="input-tube-od"
                type="number"
                min="0"
                step="any"
                className="form-input text-mono"
                value={fields.tubeOD}
                onChange={(e) => setField("tubeOD", e.target.value)}
                placeholder="Tube OD"
                disabled={disabled}
                required
              />
              <span className="input-suffix">Tube OD mm</span>
            </div>
            <div className="shell-input-wrapper">
              <input
                id="input-tube-length"
                type="number"
                min="0"
                step="any"
                className="form-input text-mono"
                value={fields.tubeLength}
                onChange={(e) => setField("tubeLength", e.target.value)}
                placeholder="Tube Length"
                disabled={disabled}
                required
              />
              <span className="input-suffix">Tube Length mm</span>
            </div>
            <div className="shell-input-wrapper">
              <input
                id="input-no-of-pass"
                type="number"
                min="1"
                step="1"
                className="form-input text-mono"
                value={fields.noOfPass}
                onChange={(e) => setField("noOfPass", e.target.value)}
                placeholder="No. of Pass"
                disabled={disabled}
                required
              />
              <span className="input-suffix">No. of Pass</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="form-group">
          <label className="form-label" htmlFor="input-shell-id">
            Shell ID (Inner Diameter, mm)
            <span className="form-hint">Nominal inner diameter of the cylindrical shell</span>
          </label>
          <div className="shell-input-wrapper">
            <input
              id="input-shell-id"
              type="number"
              min="150"
              max="4000"
              step="1"
              className="form-input text-mono"
              value={fields.shellId}
              onChange={(e) => setField("shellId", e.target.value)}
              placeholder="e.g. 914"
              disabled={disabled}
              required
            />
            <span className="input-suffix">mm</span>
          </div>
        </div>
      )}
    </>
  );
}
