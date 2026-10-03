import type { NozzleItem } from "../../types/engineering";
import {
  NOZZLE_SIZES,
  NOZZLE_UNITS,
  NOZZLE_SCHEDULES,
  NOZZLE_TYPES,
  NOZZLE_RATINGS,
  createBlankNozzle,
} from "../../constants/nozzleDefaults";
import { IconClose, IconPlus } from "../common/Icon";

interface NozzleScheduleEditorProps {
  nozzles: NozzleItem[];
  onChange: (nozzles: NozzleItem[]) => void;
  disabled?: boolean;
  /** General Arrangement: show the "GA Position" column (distance from the left tube-sheet face). */
  showPosition?: boolean;
  /** Size choices; defaults to the desktop form's list. */
  sizes?: string[];
}

/**
 * Editable Nozzle Input/Schedule grid, mirroring Form3's own nozzle table
 * (Nozzle No, Size, Unit, Schedule/THK, Type, Rating, Projection From
 * Center, Service, Orientation, Remark) with add/remove rows.
 */
export function NozzleScheduleEditor({
  nozzles,
  onChange,
  disabled = false,
  showPosition = false,
  sizes = NOZZLE_SIZES,
}: NozzleScheduleEditorProps) {
  const updateRow = (index: number, patch: Partial<NozzleItem>) => {
    const next = nozzles.map((n, i) => (i === index ? { ...n, ...patch } : n));
    onChange(next);
  };

  const addRow = () => {
    const nextNo = `N${nozzles.length + 1}`;
    onChange([...nozzles, createBlankNozzle(nextNo)]);
  };

  const removeRow = (index: number) => {
    onChange(nozzles.filter((_, i) => i !== index));
  };

  return (
    <div className="nozzle-editor">
      <div className="nozzle-editor-table-wrapper">
        <table className="nozzle-editor-table">
          <thead>
            <tr>
              <th>Nozzle No</th>
              <th>Size</th>
              <th>Unit</th>
              <th>Schedule</th>
              <th>Type</th>
              <th>Rating</th>
              <th>Proj. From Center</th>
              <th>Service</th>
              <th>Orientation</th>
              {showPosition && <th title="Distance of the nozzle axis from the left tube-sheet face. Blank = reference / automatic placement.">GA Position (mm)</th>}
              <th>Remark</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {nozzles.map((n, i) => (
              <tr key={i}>
                <td>
                  <input
                    className="nozzle-cell-input text-mono"
                    value={n.nozzleNo}
                    onChange={(e) => updateRow(i, { nozzleNo: e.target.value })}
                    disabled={disabled}
                  />
                </td>
                <td>
                  <select
                    className="nozzle-cell-select"
                    value={n.size}
                    onChange={(e) => updateRow(i, { size: e.target.value })}
                    disabled={disabled}
                  >
                    {(sizes.includes(n.size) ? sizes : [n.size, ...sizes]).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="nozzle-cell-select"
                    value={n.unit}
                    onChange={(e) => updateRow(i, { unit: e.target.value })}
                    disabled={disabled}
                  >
                    {NOZZLE_UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="nozzle-cell-select"
                    value={n.schedule}
                    onChange={(e) => updateRow(i, { schedule: e.target.value })}
                    disabled={disabled}
                  >
                    {NOZZLE_SCHEDULES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="nozzle-cell-select"
                    value={n.type}
                    onChange={(e) => updateRow(i, { type: e.target.value })}
                    disabled={disabled}
                  >
                    {NOZZLE_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="nozzle-cell-select"
                    value={n.rating}
                    onChange={(e) => updateRow(i, { rating: e.target.value })}
                    disabled={disabled}
                  >
                    {NOZZLE_RATINGS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="nozzle-cell-input text-mono"
                    value={n.projection}
                    onChange={(e) => updateRow(i, { projection: e.target.value })}
                    disabled={disabled}
                  />
                </td>
                <td>
                  <input
                    className="nozzle-cell-input"
                    value={n.service}
                    onChange={(e) => updateRow(i, { service: e.target.value })}
                    disabled={disabled}
                  />
                </td>
                <td>
                  <input
                    className="nozzle-cell-input text-mono"
                    value={n.orientation}
                    onChange={(e) => updateRow(i, { orientation: e.target.value })}
                    disabled={disabled}
                  />
                </td>
                {showPosition && (
                  <td>
                    <input
                      className="nozzle-cell-input text-mono"
                      inputMode="decimal"
                      placeholder="auto"
                      value={n.position ?? ""}
                      onChange={(e) => updateRow(i, { position: e.target.value })}
                      disabled={disabled}
                    />
                  </td>
                )}
                <td>
                  <input
                    className="nozzle-cell-input"
                    value={n.remark}
                    onChange={(e) => updateRow(i, { remark: e.target.value })}
                    disabled={disabled}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="nozzle-row-remove-btn"
                    onClick={() => removeRow(i)}
                    disabled={disabled}
                    title="Remove nozzle"
                  >
                    <IconClose size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {nozzles.length === 0 && (
              <tr>
                <td colSpan={showPosition ? 12 : 11} className="nozzle-editor-empty">
                  No nozzles — click "Add Nozzle" below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={addRow}
        disabled={disabled}
      >
        <IconPlus size={14} />
        <span>Add Nozzle</span>
      </button>
    </div>
  );
}
