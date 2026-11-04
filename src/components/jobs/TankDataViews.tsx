import { useEffect, useRef, useState } from "react";
import type { JobDetail, NozzleItem, TankData } from "../../types/engineering";
import { TANK_FIELDS } from "../../constants/tankFields";
import { recalculateJob } from "../../api";
import { ApiFieldError } from "../../api/errors";
import { IconAlertTriangle, IconLoader } from "../common/Icon";
import { TankNozzleEditor } from "./TankNozzleEditor";
import {
  EstimatedBanner,
  EstimatedCategoryCard,
  EstimatedNoticeCard,
  EstimatedToolbar,
  type EstimatedRow,
} from "./EstimatedFields";

/** Values the calculation takes from a fixed list rather than a number. */
const CHOICE_VALUES: Record<string, string[]> = {
  TOP_ROOT_TYPE: ["DISH", "FLAT", "CONICAL"],
  BOTTOM_ROOT_TYPE: ["DISH", "FLAT", "CONICAL"],
  SUPPORT_TYPE: ["LEG SUPPORT", "LUG SUPPORT", "SADDLE SUPPORT", "SKIRT SUPPORT"],
};

const isNumber = (v: string) => v.trim() !== "" && Number.isFinite(Number(v));

// Same checks as the desktop grids (and the API's TankOverrideRules).
const MAY_BE_ZERO = new Set(["NO_OF_STIFFENERS", "FIRST_LEG_ORIENTATION", "STIFFENER_SIZE", "STIFFENER_THK", "NO_OF_PARTIAL_COURSES", "PARTIAL_COURSE_HEIGHT"]);
const WHOLE_NUMBERS = new Set(["NO_OF_LEGS", "NO_OF_STIFFENERS", "NO_OF_FULL_COURSES", "NO_OF_PARTIAL_COURSES", "NO_OF_COURSES"]);

export function validateTankValue(key: string, value: string, calculated: string): string | null {
  if (CHOICE_VALUES[key]) return CHOICE_VALUES[key].includes(value.trim().toUpperCase()) ? null : "Choose one of the listed values";
  if (!isNumber(calculated)) return null;
  if (!isNumber(value)) return "Enter a number";
  const n = Number(value);
  if (key === "NO_OF_FULL_COURSES") return Number.isInteger(n) && n >= 1 && n <= 30 ? null : "Whole number from 1 to 30";
  if (key === "NO_OF_PARTIAL_COURSES") return n === 0 || n === 1 ? null : "Must be 0 or 1";
  if (WHOLE_NUMBERS.has(key) && !Number.isInteger(n)) return "Must be a whole number";
  return MAY_BE_ZERO.has(key) ? (n >= 0 ? null : "Zero or more") : n > 0 ? null : "Must be greater than zero";
}

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
 * Tank results in the same Actual / Estimated layout as every other module (see EstimatedFields): grouped category cards,
 * Parameter | Actual | Estimated | Diff. Values arrive pre-formatted by the suite's own calculation (contract §2), so nothing is
 * re-derived here: editing an Estimated value (Enter or leaving the field) sends it to the server, which calculates again with the
 * same code as the software and returns every dependent value (thicknesses, weights, BOM, summary) updated. The nozzle schedule is
 * edited below and sent with its own Recalculate button.
 */
export function TankParametersView({ data, jobId, onRecalculated, disabled = false }: TankParametersViewProps) {
  const editing = !!jobId && !!onRecalculated;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [nozzleDraft, setNozzleDraft] = useState<NozzleItem[]>(data.nozzles ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [updated, setUpdated] = useState<Set<string>>(new Set());
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (clearTimer.current) clearTimeout(clearTimer.current); }, []);

  // A fresh result (after a recalculation or a reload) replaces whatever was being typed.
  const [shownData, setShownData] = useState(data);
  if (shownData !== data) {
    setShownData(data);
    setDraft({});
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

  const nozzlesChanged = JSON.stringify(nozzleDraft) !== JSON.stringify(data.nozzles ?? []);
  const diffCount = data.parameters.filter((p) => p.editable && !sameValue(p.actual, p.estimated)).length;
  const locked = disabled || busy;

  const clearDraft = (key: string) =>
    setDraft((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });

  /** Sends the complete set of edited values (those that differ from the calculated one); `change` replaces one of them; `resetAll` sends none. */
  const send = async (change: { key: string; value: string } | null, nozzles?: NozzleItem[], resetAll = false) => {
    if (!jobId || !onRecalculated || busy) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const overrides: Record<string, string> = {};
    for (const p of data.parameters) {
      if (!p.editable || resetAll) continue;
      const v = (change && change.key === p.key ? change.value : p.estimated).trim();
      if (!sameValue(v, p.actual)) overrides[p.key] = v;
    }
    const before = Object.fromEntries(data.parameters.map((p) => [p.key, p.estimated]));
    try {
      const job = await recalculateJob(jobId, { overrides, ...(nozzles ? { nozzles } : {}) });
      const after = job.tankData?.parameters ?? [];
      setUpdated(new Set(after.filter((p) => !sameValue(p.estimated, before[p.key] ?? "")).map((p) => p.key)));
      if (clearTimer.current) clearTimeout(clearTimer.current);
      clearTimer.current = setTimeout(() => setUpdated(new Set()), 3000);
      setDraft({});
      onRecalculated(job);
    } catch (err) {
      if (err instanceof ApiFieldError) {
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.fieldErrors)) mapped[k.replace(/^overrides\./, "")] = v;
        setFieldErrors(mapped);
      }
      setError(err instanceof Error ? err.message : "Could not recalculate.");
      setDraft({});                                           // the field goes back to the last accepted value, as in the software
    } finally {
      setBusy(false);
    }
  };

  /** Enter / leaving the field / picking from a list: check it like the software grid, then send it. */
  const commit = (row: EstimatedRow, picked?: string) => {
    const value = picked ?? draft[row.key];
    if (value === undefined || busy || !jobId) return;
    if (sameValue(value, row.estimated)) {
      clearDraft(row.key);
      return;
    }
    const problem = validateTankValue(row.key, value, row.actual);
    if (problem) {
      setError(`${row.label}: ${problem}`);
      setFieldErrors({ [row.key]: problem });
      clearDraft(row.key);
      return;
    }
    void send({ key: row.key, value });
  };

  const rowsOf = (list: TankData["parameters"]): EstimatedRow[] =>
    list.map((p) => ({
      key: p.key,
      label: p.label,
      unit: p.unit ?? undefined,
      actual: p.actual,
      estimated: p.estimated,
      editable: p.editable,
      numeric: isNumber(p.actual),
      choices: CHOICE_VALUES[p.key],
    }));

  return (
    <div className="engineering-data-view">
      {data.warnings.length > 0 && <TankWarnings warnings={data.warnings} />}
      <EstimatedNoticeCard />

      {editing && <EstimatedBanner busy={busy} busyText="Recalculating the connected values…" error={error} disabled={disabled} />}

      <EstimatedToolbar diffCount={diffCount} canReset={editing && !locked && diffCount > 0} onReset={() => void send(null, undefined, true)} />

      <div className="categories-stack">
        {[...groups.entries()].map(([group, rows]) => (
          <EstimatedCategoryCard
            key={group}
            title={group}
            rows={rowsOf(rows)}
            draft={draft}
            errors={fieldErrors}
            updated={updated}
            live={editing && !disabled}
            busy={busy}
            same={sameValue}
            onChange={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
            onCommit={commit}
            onCancel={clearDraft}
          />
        ))}
      </div>

      {editing && (
        <section className="category-card" aria-label="Nozzle schedule">
          <div className="category-header">
            <div>
              <h3 className="category-title">Nozzle Schedule</h3>
              <p className="category-desc">Edit the nozzles, then Recalculate to update the BOM and the drawing data. A drawing made before a change is cleared - generate it again.</p>
            </div>
            <div className="toolbar-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setNozzleDraft(data.nozzles ?? []);
                  setFieldErrors({});
                  setError(null);
                }}
                disabled={!nozzlesChanged || locked}
              >
                Discard changes
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void send(null, nozzleDraft)} disabled={!nozzlesChanged || locked} id="btn-tank-recalculate">
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
