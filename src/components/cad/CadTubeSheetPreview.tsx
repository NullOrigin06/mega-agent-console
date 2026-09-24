interface CadPreviewProps {
  size?: number;
  className?: string;
}

/**
 * Real engineering line-art for a tube sheet: outer OD, dashed Outer Tube
 * Limit (OTL) circle, centerlines, and a triangular-pitch drilling pattern —
 * not a generic disc icon standing in for the module.
 */
export function CadTubeSheetPreview({ size = 120, className = "" }: CadPreviewProps) {
  const rows: { cy: number; cxs: number[] }[] = [];
  const rowSpacing = 11;
  const colSpacing = 12.7; // sin(60deg) * pitch, for a triangular array
  const otlRadius = 38;
  const center = 60;

  for (let row = -3; row <= 3; row++) {
    const cy = center + row * rowSpacing;
    const rowOffset = row % 2 !== 0 ? colSpacing / 2 : 0;
    const cxs: number[] = [];
    for (let col = -4; col <= 4; col++) {
      const cx = center + col * colSpacing + rowOffset;
      const dx = cx - center;
      const dy = cy - center;
      if (Math.sqrt(dx * dx + dy * dy) <= otlRadius - 4) {
        cxs.push(cx);
      }
    }
    rows.push({ cy, cxs });
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      className={`cad-preview ${className}`}
      role="img"
      aria-label="Tube sheet drilling pattern"
    >
      <circle cx={center} cy={center} r={52} stroke="currentColor" strokeWidth="1.5" opacity="0.85" />
      <circle
        cx={center}
        cy={center}
        r={otlRadius}
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="4 3"
        opacity="0.5"
      />
      <line x1={center} y1="10" x2={center} y2="24" stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
      <line x1={center} y1="96" x2={center} y2="110" stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
      <line x1="10" y1={center} x2="24" y2={center} stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
      <line x1="96" y1={center} x2="110" y2={center} stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
      {rows.map((r) =>
        r.cxs.map((cx) => (
          <circle key={`${r.cy}-${cx}`} cx={cx} cy={r.cy} r="2" fill="currentColor" opacity="0.75" />
        ))
      )}
    </svg>
  );
}
