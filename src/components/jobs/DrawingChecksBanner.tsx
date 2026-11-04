import { IconAlertTriangle } from "../common/Icon";

/**
 * Why a drawing cannot be made with the current values (the software's pre-generate checks: impossible dimensions, more tubes
 * than the shell holds). Shown where the values are edited and where the drawing is started; nothing is shown when nothing
 * stands in the way.
 */
export function DrawingChecksBanner({ reasons }: { reasons?: readonly string[] }) {
  if (!reasons || reasons.length === 0) return null;
  return (
    <div className="alert-banner alert-banner-danger drawing-checks-banner" role="alert">
      <IconAlertTriangle size={16} />
      <div>
        <strong>The drawing cannot be made with these values yet.</strong>
        <ul className="drawing-checks-list">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <span className="drawing-checks-hint">Correct them in the Estimated column; this clears as soon as the values work.</span>
      </div>
    </div>
  );
}
