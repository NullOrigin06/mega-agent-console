import type { TankData } from "../../types/engineering";
import { TANK_FIELDS } from "../../constants/tankFields";
import { IconAlertTriangle } from "../common/Icon";

/**
 * Tank results, mirroring the desktop tank forms' "ENGINEERING PARAMETERS"
 * grid (Actual vs. Estimated, grouped) - values arrive pre-formatted by the
 * suite's own calculation (contract §2), so nothing is re-derived here.
 */
export function TankParametersView({ data }: { data: TankData }) {
  const groups = new Map<string, TankData["parameters"]>();
  for (const p of data.parameters) {
    const list = groups.get(p.group) ?? [];
    list.push(p);
    groups.set(p.group, list);
  }
  return (
    <div className="tank-params">
      {data.warnings.length > 0 && <TankWarnings warnings={data.warnings} />}
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
                const overridden = p.estimated !== p.actual;
                return (
                  <tr key={p.key}>
                    <th scope="row">{p.label}</th>
                    <td className="num text-mono">{p.actual}</td>
                    <td className={`num text-mono${overridden ? " tank-overridden" : ""}`} title={overridden ? "Estimated value overrides the calculation" : undefined}>
                      {p.estimated}
                    </td>
                    <td className="tank-params-unit">{p.unit ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
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
