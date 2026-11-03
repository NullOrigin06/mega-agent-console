import type { NozzleItem, TankModuleKind } from "../../types/engineering";
import { NOZZLE_RATINGS, NOZZLE_SCHEDULES, NOZZLE_TYPES } from "../../constants/nozzleDefaults";
import {
  SHOP_TANK_LOCATIONS,
  SHOP_TANK_NOZZLE_NUMBERS,
  SHOP_TANK_NOZZLE_SIZES,
  SHOP_TANK_UNITS,
  SITE_TANK_NOZZLE_NUMBERS,
  SITE_TANK_NOZZLE_SIZES,
  SITE_TANK_POSITIONS,
  SITE_TANK_SCHEDULES,
  createBlankTankNozzle,
  nextTankNozzleNo,
} from "../../constants/tankNozzles";
import { NOZZLE_UNITS } from "../../constants/nozzleDefaults";
import { IconClose, IconPlus } from "../common/Icon";

interface TankNozzleEditorProps {
  module: TankModuleKind;
  nozzles: NozzleItem[];
  onChange: (nozzles: NozzleItem[]) => void;
  disabled?: boolean;
}

/** The list with the current value kept in it, so a value loaded from a job that is not in the list still shows. */
function withCurrent(list: readonly string[], current: string | undefined): string[] {
  return current && !list.includes(current) ? [current, ...list] : [...list];
}

/** A bare number typed as an orientation gets its degree sign ("270" -> "270°"), as in the desktop grid. */
function withDegreeSign(value: string): string {
  const v = value.trim();
  return /^-?\d+(\.\d+)?$/.test(v) ? `${v}°` : value;
}

/**
 * Nozzle schedule of a Shop Tank or Site Tank, with the columns of the desktop form for that module.
 *  Shop Tank: Location (Dish / Shell), Elevation / Radius, Orientation.
 *  Site Tank: Position (ROOF / SHELL), Orientation (roof nozzles), Elevation (shell nozzles).
 */
export function TankNozzleEditor({ module, nozzles, onChange, disabled = false }: TankNozzleEditorProps) {
  const shop = module === "ShopTank";
  const numbers = shop ? SHOP_TANK_NOZZLE_NUMBERS : SITE_TANK_NOZZLE_NUMBERS;
  const sizes = shop ? SHOP_TANK_NOZZLE_SIZES : SITE_TANK_NOZZLE_SIZES;
  const schedules = shop ? NOZZLE_SCHEDULES : SITE_TANK_SCHEDULES;
  const units = shop ? SHOP_TANK_UNITS : NOZZLE_UNITS;

  const updateRow = (index: number, patch: Partial<NozzleItem>) => {
    onChange(nozzles.map((n, i) => (i === index ? { ...n, ...patch } : n)));
  };

  // The size decides the unit: a fraction / inch size ("1/2") is inch, a nominal bore ("100") is NB.
  const changeSize = (index: number, size: string) => {
    updateRow(index, { size, unit: size.includes("/") ? "inch" : "NB" });
  };

  // Site Tank: a SHELL nozzle has an elevation and no orientation; a ROOF nozzle has an orientation and no elevation.
  const changePosition = (index: number, position: string) => {
    const row = nozzles[index];
    if (position === "SHELL") {
      updateRow(index, { position, orientation: "-", elevation: !row.elevation || row.elevation === "-" ? "1000" : row.elevation });
    } else {
      updateRow(index, { position, elevation: "-", orientation: !row.orientation || row.orientation === "-" ? "0°" : row.orientation });
    }
  };

  const addRow = () => onChange([...nozzles, createBlankTankNozzle(module, nextTankNozzleNo(module, nozzles))]);
  const removeRow = (index: number) => {
    // The software asks before removing a nozzle.
    if (!window.confirm(`Are you sure you want to remove nozzle '${nozzles[index]?.nozzleNo ?? ""}'?`)) return;
    onChange(nozzles.filter((_, i) => i !== index));
  };

  const columns = shop ? 12 : 12;

  return (
    <div className="nozzle-editor">
      <div className="nozzle-editor-table-wrapper">
        <table className="nozzle-editor-table" aria-label={`${shop ? "Shop" : "Site"} Tank nozzle schedule`}>
          <thead>
            <tr>
              <th>Nozzle No</th>
              <th>Size</th>
              <th>Unit</th>
              <th>SCH./THK.</th>
              <th>Type</th>
              <th>Rating</th>
              {shop ? <th>Nozzle Location</th> : <th>Service</th>}
              {shop ? <th>Service</th> : <th>Position</th>}
              {shop ? (
                <th title="SHELL nozzle: height of its centre line above the bottom weld line W.L. (mm). DISH nozzle: distance from the vessel centre (mm); AUTO = shell I.D. / 2 - 150. N1 / N7 on the centre line need no value. N5, N6, SG and LG sit at fixed heights in the drawing template.">
                  Elevation / Radius (mm)
                </th>
              ) : (
                <th>Nozzle Orientation</th>
              )}
              {shop ? (
                <th title="Angle in degrees clockwise from the plan top (e.g. 270 or 270°). TOP / BOTTOM for N1 / N7.">Nozzle Orientation</th>
              ) : (
                <th title="Height of a SHELL nozzle's centre line above the bottom (mm).">Elevation</th>
              )}
              <th>Remark</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {nozzles.map((n, i) => {
              const shell = shop ? n.location === "Shell" : n.position === "SHELL";
              return (
                <tr key={i}>
                  <td>
                    <select className="nozzle-cell-select" value={n.nozzleNo} disabled={disabled}
                      onChange={(e) => updateRow(i, { nozzleNo: e.target.value })} aria-label="Nozzle No">
                      {withCurrent(numbers, n.nozzleNo).map((no) => <option key={no} value={no}>{no}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className="nozzle-cell-select" value={n.size} disabled={disabled}
                      onChange={(e) => changeSize(i, e.target.value)} aria-label="Size">
                      {withCurrent(sizes, n.size).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className="nozzle-cell-select" value={n.unit} disabled={disabled}
                      onChange={(e) => updateRow(i, { unit: e.target.value })} aria-label="Size unit">
                      {withCurrent(units, n.unit).map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className="nozzle-cell-select" value={n.schedule} disabled={disabled}
                      onChange={(e) => updateRow(i, { schedule: e.target.value })} aria-label="Schedule">
                      {withCurrent(schedules, n.schedule).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className="nozzle-cell-select" value={n.type} disabled={disabled}
                      onChange={(e) => updateRow(i, { type: e.target.value })} aria-label="Type">
                      {withCurrent(NOZZLE_TYPES, n.type).map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className="nozzle-cell-select" value={n.rating} disabled={disabled}
                      onChange={(e) => updateRow(i, { rating: e.target.value })} aria-label="Rating">
                      {withCurrent(NOZZLE_RATINGS, n.rating).map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  {shop ? (
                    <>
                      <td>
                        <select className="nozzle-cell-select" value={n.location ?? "Dish"} disabled={disabled}
                          onChange={(e) => updateRow(i, { location: e.target.value })} aria-label="Nozzle location">
                          {SHOP_TANK_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </td>
                      <td>
                        <input className="nozzle-cell-input" value={n.service} disabled={disabled} aria-label="Service"
                          onChange={(e) => updateRow(i, { service: e.target.value })} />
                      </td>
                      <td>
                        <input className="nozzle-cell-input text-mono" value={n.elevation ?? ""} disabled={disabled} aria-label="Elevation or radius"
                          onChange={(e) => updateRow(i, { elevation: e.target.value })} />
                      </td>
                      <td>
                        <input className="nozzle-cell-input text-mono" value={n.orientation} disabled={disabled} aria-label="Orientation"
                          onChange={(e) => updateRow(i, { orientation: e.target.value })}
                          onBlur={(e) => updateRow(i, { orientation: withDegreeSign(e.target.value) })} />
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <input className="nozzle-cell-input" value={n.service} disabled={disabled} aria-label="Service"
                          onChange={(e) => updateRow(i, { service: e.target.value })} />
                      </td>
                      <td>
                        <select className="nozzle-cell-select" value={n.position ?? "ROOF"} disabled={disabled}
                          onChange={(e) => changePosition(i, e.target.value)} aria-label="Position">
                          {SITE_TANK_POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </td>
                      <td>
                        <input className="nozzle-cell-input text-mono" value={shell ? "-" : n.orientation} disabled={disabled || shell} aria-label="Orientation"
                          title={shell ? "A SHELL nozzle has no orientation" : undefined}
                          onChange={(e) => updateRow(i, { orientation: e.target.value })}
                          onBlur={(e) => updateRow(i, { orientation: withDegreeSign(e.target.value) })} />
                      </td>
                      <td>
                        <input className="nozzle-cell-input text-mono" value={shell ? (n.elevation ?? "") : "-"} disabled={disabled || !shell} aria-label="Elevation"
                          title={shell ? undefined : "A ROOF nozzle has no elevation"}
                          onChange={(e) => updateRow(i, { elevation: e.target.value })} />
                      </td>
                    </>
                  )}
                  <td>
                    <input className="nozzle-cell-input" value={n.remark} disabled={disabled} aria-label="Remark"
                      onChange={(e) => updateRow(i, { remark: e.target.value })} />
                  </td>
                  <td>
                    <button type="button" className="nozzle-row-remove-btn" onClick={() => removeRow(i)} disabled={disabled}
                      title="Remove nozzle" aria-label={`Remove nozzle ${n.nozzleNo}`}>
                      <IconClose size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {nozzles.length === 0 && (
              <tr>
                <td colSpan={columns} className="nozzle-editor-empty">
                  No nozzles — click "Add Nozzle" below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={addRow} disabled={disabled}>
        <IconPlus size={14} />
        <span>Add Nozzle</span>
      </button>
    </div>
  );
}
