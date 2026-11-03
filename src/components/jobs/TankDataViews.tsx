import { useMemo, useState } from "react";
import type { JobDetail, NozzleItem, TankData, TankParameter } from "../../types/engineering";
import { TANK_FIELDS } from "../../constants/tankFields";
import { recalculateJob } from "../../api";
import { ApiFieldError } from "../../api/errors";
import { IconAlertTriangle, IconLoader } from "../common/Icon";
import { TankNozzleEditor } from "./TankNozzleEditor";

/** Values the calculation takes from a fixed list rather than a number. */
const CHOICE_VALUES: Record<string, string[]> = {
  TOP_ROOT_TYPE: ["DISH", "FLAT", "CONICAL"],
  BOTTOM_ROOT_TYPE: ["DISH", "FLAT", "CONICAL"],
};

const isNumber = (v: string) => v.trim() !== "" && Number.isFinite(Number(v));

/** The same value written differently ("6" / "6.0") is not an edit. */
function sameValue(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  return x === y || (isNumber(x) && isNumber(y) && Number(x) === Number(y));
}

interface TankParametersViewProps {
  data: TankData;
  /** With the job id and a handler the Estimated column and the nozzle schedule can be edited and recalculated. */
  jobId?: string;
  onRecalculated?: (job: JobDetail) => void;
  /** Block editing, e.g. while a drawing is being made from the current values. */
  disabled?: boolean;
}

/**
 * Tank results, mirroring the desktop tank forms' "ENGINEERING PARAMETERS" grid (Actual vs. Estimated, grouped).
 * Values arrive pre-formatted by the suite's own calculation (contract §2), so nothing is re-derived here: editing an
 * Estimated value (or the nozzle schedule) and pressing Recalculate sends it to the server, which calculates again with
 * the same code as the software and returns every dependent value (thicknesses, weights, BOM, summary) updated.
 */
export function TankParametersView({ data, jobId, onRecalculated, disabled = false }: TankParametersViewProps) {
  const editing = !!jobId && !!onRecalculated;
  const estimatedOf = (d: TankData) => Object.fromEntries(d.parameters.map((p) => [p.key, p.estimated]));
  const [draft, setDraft] = useState<Record<string, string>>(() => estimatedOf(data));
  const [nozzleDraft, setNozzleDraft] = useState<NozzleItem[]>(data.nozzles ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // A fresh result (after a recalculation or a reload) replaces whatever was being typed.
  const [shownData, setShownData] = useState(data);
  if (shownData !== data) {
    setShownData(data);
    setDraft(estimatedOf(data));
    setNozzleDraft(data.nozzles ?? []);
    setError(null);
    setFieldErrors({});
  }

  const groups = new Map<string, TankData["parameters"]>();
  for (const p of data.parameters) {
    const list = groups.get(p.group) ?? [];
    list.push(p);
    groups.set(p.group, list);
  }

  const valueOf = (p: TankParameter) => draft[p.key] ?? p.estimated;
  const parameterErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    for (const p of data.parameters) {
      if (!p.editable || CHOICE_VALUES[p.key]) continue;
      const v = draft[p.key] ?? p.estimated;
      if (isNumber(p.actual) && !isNumber(v)) errors[p.key] = "Enter a number";
    }
    return errors;
  }, [data.parameters, draft]);

  const valuesChanged = data.parameters.some((p) => p.editable && !sameValue(draft[p.key] ?? p.estimated, p.estimated));
  const nozzlesChanged = JSON.stringify(nozzleDraft) !== JSON.stringify(data.nozzles ?? []);
  const dirty = valuesChanged || nozzlesChanged;
  const hasErrors = Object.keys(parameterErrors).length > 0;

  const discard = () => {
    setDraft(Object.fromEntries(data.parameters.map((p) => [p.key, p.estimated])));
    setNozzleDraft(data.nozzles ?? []);
    setError(null);
    setFieldErrors({});
  };

  const recalculate = async () => {
    if (!jobId || !onRecalculated || busy || hasErrors) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    // The complete set of edited values: those that differ from the calculated ("Actual") value.
    const overrides: Record<string, string> = {};
    for (const p of data.parameters) {
      if (!p.editable) continue;
      const v = (draft[p.key] ?? p.estimated).trim();
      if (!sameValue(v, p.actual)) overrides[p.key] = v;
    }
    try {
      const job = await recalculateJob(jobId, { overrides, ...(nozzlesChanged ? { nozzles: nozzleDraft } : {}) });
      onRecalculated(job);
    } catch (err) {
      if (err instanceof ApiFieldError) setFieldErrors(err.fieldErrors);
      setError(err instanceof Error ? err.message : "Could not recalculate.");
    } finally {
      setBusy(false);
    }
  };

  const locked = disabled || busy;

  return (
    <div className="tank-params">
      {data.warnings.length > 0 && <TankWarnings warnings={data.warnings} />}
      {editing && (
        <div className="tank-edit-bar" role="region" aria-label="Edit and recalculate">
          <span className="tank-edit-hint">
            {disabled
              ? "A drawing is being generated - editing is available when it has finished."
              : dirty
                ? "You have unsaved changes. Recalculate to update every dependent value, the BOM and the summary."
                : "Edit the Estimated values or the nozzle schedule, then Recalculate. A drawing made before a change is cleared - generate it again."}
          </span>
          <div className="tank-edit-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={discard} disabled={!dirty || locked}>
              Discard changes
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={recalculate} disabled={!dirty || locked || hasErrors} id="btn-tank-recalculate">
              {busy ? (
                <>
                  <IconLoader size={14} className="animate-spin" />
                  <span>Recalculating...</span>
                </>
              ) : (
                <span>Recalculate</span>
              )}
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="alert-banner alert-banner-danger" role="alert">
          <span>{error}</span>
        </div>
      )}
      {[...groups.entries()].map(([group, rows]) => (
        <section key={group} className="workspace-panel tank-params-group" aria-label={group}>
          <h3 className="workspace-panel-title">{group}</h3>
          <table className="tank-params-table">
            <colgroup>
              <col style={{ width: "46%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "14%" }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Parameter</th>
                <th scope="col" className="num">Actual</th>
                <th scope="col" className="num">Estimated</th>
                <th scope="col">Unit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const current = valueOf(p);
                const overridden = !sameValue(current, p.actual);
                const choices = CHOICE_VALUES[p.key];
                const err = parameterErrors[p.key] ?? fieldErrors[`overrides.${p.key}`];
                return (
                  <tr key={p.key}>
                    <th scope="row">{p.label}</th>
                    <td className="num text-mono">{p.actual}</td>
                    <td className={`num text-mono${overridden ? " tank-overridden" : ""}`} title={overridden ? "Estimated value overrides the calculation" : undefined}>
                      {editing && p.editable ? (
                        choices ? (
                          <select
                            className={`tank-estimated-input${overridden ? " tank-estimated-modified" : ""}`}
                            value={current}
                            disabled={locked}
                            aria-label={`Estimated ${p.label}`}
                            onChange={(e) => setDraft((d) => ({ ...d, [p.key]: e.target.value }))}
                          >
                            {(choices.includes(current) ? choices : [current, ...choices]).map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className={`tank-estimated-input text-mono${overridden ? " tank-estimated-modified" : ""}${err ? " tank-estimated-invalid" : ""}`}
                            value={current}
                            disabled={locked}
                            inputMode="decimal"
                            aria-label={`Estimated ${p.label}`}
                            aria-invalid={!!err}
                            title={err ?? "Edit the estimated value"}
                            onChange={(e) => setDraft((d) => ({ ...d, [p.key]: e.target.value }))}
                          />
                        )
                      ) : (
                        p.estimated
                      )}
                      {err && <span className="tank-field-error" role="alert">{err}</span>}
                    </td>
                    <td className="tank-params-unit">{p.unit ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
      {editing && (
        <section className="workspace-panel" aria-label="Nozzle schedule">
          <h3 className="workspace-panel-title">Nozzle Schedule</h3>
          <TankNozzleEditor module={data.module} nozzles={nozzleDraft} onChange={setNozzleDraft} disabled={locked} />
          {fieldErrors.nozzles && <span className="tank-field-error" role="alert">{fieldErrors.nozzles}</span>}
        </section>
      )}
    </div>
  );
}

/** Summary tiles (volumes, weights) plus the inputs the run was made with. */
export function TankSummaryView({ data }: { data: TankData }) {
  const fields = TANK_FIELDS[data.module];
  const inputs = data.inputs as unknown as Record<string, string | number>;
  return (
    <div className="tank-summary">
      {data.warnings.length > 0 && <TankWarnings warnings={data.warnings} />}
      <div className="tank-summary-tiles">
        {data.summary.map((s) => (
          <div key={s.key} className="stat-box tank-summary-tile">
            <span className="stat-label">{s.label}</span>
            <span className="stat-value text-mono">
              {s.value} {s.unit && <span className="stat-unit">{s.unit}</span>}
            </span>
          </div>
        ))}
      </div>
      <section className="workspace-panel" aria-label="Inputs">
        <h3 className="workspace-panel-title">Inputs</h3>
        <dl className="tank-inputs-list">
          {fields.map((f) => (
            <div key={f.key} className="tank-inputs-item">
              <dt>{f.label}</dt>
              <dd className="text-mono">
                {inputs[f.key] ?? "-"}
                {f.unit && inputs[f.key] !== undefined ? ` ${f.unit}` : ""}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function TankWarnings({ warnings }: { warnings: string[] }) {
  return (
    <div className="alert-banner tank-warnings" role="status">
      <IconAlertTriangle size={16} />
      <ul>
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}
