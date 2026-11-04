import type { ReactNode } from "react";
import { IconInfo, IconLoader, IconRefresh } from "../common/Icon";

/**
 * The Actual / Estimated layout every module's Engineering Data tab uses (Tube Sheet's, the software's grids):
 * an explanation card, a toolbar with the number of modified values and "Reset Estimated to Actual", a banner for
 * progress / errors, and category cards with one row per value: Parameter | Actual | Estimated | Diff.
 * Heat Exchanger, Tube Sheet, Bonnet Flange, General Arrangement, Shop Tank and Site Tank all render through these pieces,
 * so the containers and the fields look and behave the same everywhere.
 */

export interface EstimatedRow {
  key: string;
  label: string;
  unit?: string;
  /** Small print under the name. */
  description?: string;
  actual: string;
  estimated: string;
  /** False: shown, not editable (a derived value). */
  editable: boolean;
  numeric: boolean;
  /** A fixed list: the Estimated value is picked, not typed. */
  choices?: string[];
}

/** Explains what Actual and Estimated mean. */
export function EstimatedNoticeCard() {
  return (
    <div className="semantic-notice-card">
      <div className="notice-icon">
        <IconInfo size={20} />
      </div>
      <div className="notice-content">
        <h4 className="notice-title">Understanding Actual vs. Estimated Values</h4>
        <p className="notice-text">
          <strong>Estimated overrides Actual for CAD & BOM generation.</strong> In the engineering engine, <code>actual</code> is the
          immutable baseline reference captured from initial design sheets, while <code>estimated</code> is the{" "}
          <strong>authoritative value</strong> used for all downstream calculations, 3D modeling, and drawings. You can edit the
          Estimated fields below to override parameters for this run.
        </p>
      </div>
    </div>
  );
}

/** Progress, the last problem, the engine's notice, or "editing is paused" - one line above the cards. */
export function EstimatedBanner({
  busy,
  busyText,
  error,
  notice,
  disabled,
  children,
}: {
  busy: boolean;
  busyText: string;
  error: string | null;
  notice?: string | null;
  disabled: boolean;
  children?: ReactNode;
}) {
  if (!(busy || error || notice || disabled)) return null;
  return (
    <div
      className={`engineering-edit-banner${error ? " engineering-edit-banner-error" : notice ? " engineering-edit-banner-notice" : ""}`}
      role={error ? "alert" : "status"}
    >
      {busy ? (
        <>
          <IconLoader size={14} className="animate-spin" />
          <span>{busyText}</span>
        </>
      ) : error ? (
        <span>{error}</span>
      ) : notice ? (
        <span>{notice}</span>
      ) : (
        <span>{children ?? "A drawing is being generated - editing is available when it has finished."}</span>
      )}
    </div>
  );
}

/** Number of modified values and the button that puts every Estimated value back to the calculated one. */
export function EstimatedToolbar({
  diffCount,
  canReset,
  onReset,
  extra,
}: {
  diffCount: number;
  canReset: boolean;
  onReset: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="values-toolbar">
      <div className="diff-counter">
        {diffCount > 0 ? (
          <span className="diff-pill diff-pill-active">
            ● {diffCount} field{diffCount === 1 ? "" : "s"} modified from Actual baseline
          </span>
        ) : (
          <span className="diff-pill">✓ Estimated matches Actual baseline</span>
        )}
      </div>
      <div className="toolbar-actions">
        {extra}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onReset}
          disabled={!canReset}
          title="Puts every Estimated value back to the calculated (Actual) value"
        >
          <IconRefresh size={14} />
          <span>Reset Estimated to Actual</span>
        </button>
      </div>
    </div>
  );
}

interface CardProps {
  title: string;
  description?: string;
  rows: EstimatedRow[];
  /** What is typed and not sent yet, by row key. */
  draft: Record<string, string | undefined>;
  errors: Record<string, string | undefined>;
  /** Keys whose value just changed (a short highlight). */
  updated: ReadonlySet<string>;
  /** The page is live (a job is open and not locked): editable rows get an input. */
  live: boolean;
  busy: boolean;
  /** Two values written differently ("6" / "6.0") are the same. */
  same: (a: string, b: string) => boolean;
  onChange: (key: string, value: string) => void;
  /** Enter, or leaving the field. */
  onCommit: (row: EstimatedRow, picked?: string) => void;
  /** Escape. */
  onCancel: (key: string) => void;
}

/** One category card: a titled table of Parameter | Actual | Estimated | Diff rows. */
export function EstimatedCategoryCard({ title, description, rows, draft, errors, updated, live, busy, same, onChange, onCommit, onCancel }: CardProps) {
  return (
    <section className="category-card">
      <div className="category-header">
        <div>
          <h3 className="category-title">{title}</h3>
          {description && <p className="category-desc">{description}</p>}
        </div>
      </div>

      <div className="fields-table-wrapper">
        <table className="values-table">
          <thead>
            <tr>
              <th className="th-field">Parameter</th>
              <th className="th-actual">
                Actual
                <span className="th-sub">Baseline Reference (Read-Only)</span>
              </th>
              <th className="th-estimated">
                Estimated
                <span className="th-sub">Authoritative (Editable)</span>
              </th>
              <th className="th-status">Diff</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const typed = draft[row.key];
              const shown = typed ?? row.estimated;
              const isDiff = !same(row.actual, row.estimated);
              const canEdit = live && row.editable;
              const fieldError = errors[row.key];
              const cls = `estimated-input text-mono ${isDiff ? "estimated-input-modified" : ""}${updated.has(row.key) ? " estimated-input-updated" : ""}${fieldError ? " estimated-input-invalid" : ""}`;
              return (
                <tr key={row.key} className={`value-row ${isDiff ? "value-row-diff" : ""}`}>
                  <td className="field-info-cell">
                    <div className="field-label-group">
                      <span className="field-name">{row.label}</span>
                      <span className="field-code">{row.key}</span>
                    </div>
                    {row.description && <span className="field-desc">{row.description}</span>}
                  </td>

                  <td className="actual-val-cell">
                    <div className="readonly-val-badge">
                      <span className="text-mono">{row.actual}</span>
                      {row.unit && <span className="unit-label">{row.unit}</span>}
                    </div>
                  </td>

                  <td className="estimated-val-cell">
                    <div className="estimated-input-wrapper">
                      {canEdit && row.choices ? (
                        <select
                          className={cls}
                          value={shown}
                          disabled={busy}
                          aria-label={`Estimated ${row.label}`}
                          onChange={(e) => {
                            onChange(row.key, e.target.value);
                            onCommit(row, e.target.value);
                          }}
                          title={`Pick the estimated ${row.label}`}
                        >
                          {(row.choices.includes(shown) ? row.choices : [shown, ...row.choices]).map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          inputMode={row.numeric ? "decimal" : "text"}
                          className={cls}
                          value={shown}
                          readOnly={!canEdit}
                          disabled={busy}
                          aria-label={`Estimated ${row.label}`}
                          aria-invalid={!!fieldError}
                          onChange={(e) => onChange(row.key, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              onCommit(row);
                            } else if (e.key === "Escape") {
                              onCancel(row.key);
                            }
                          }}
                          onBlur={() => onCommit(row)}
                          title={row.editable ? `Edit estimated ${row.label}, then press Enter` : `${row.label} is derived - it is not edited`}
                        />
                      )}
                      {row.unit && <span className="input-unit-tag">{row.unit}</span>}
                    </div>
                  </td>

                  <td className="diff-cell">
                    {isDiff ? (
                      <span className="badge-diff" title={`Baseline is ${row.actual}`}>
                        Modified
                      </span>
                    ) : (
                      <span className="badge-match">Match</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
