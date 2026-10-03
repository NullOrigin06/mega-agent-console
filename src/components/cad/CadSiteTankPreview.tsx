interface CadPreviewProps {
  size?: number;
  className?: string;
}

/**
 * Site tank elevation: a wide field-erected shell built up in plate
 * courses, a self-supported cone roof with its central drum, and the
 * sloped bottom - the API 650-style storage tank the Site Tank module sizes.
 */
export function CadSiteTankPreview({ size = 120, className = "" }: CadPreviewProps) {
  const left = 14;
  const right = 106;
  const eave = 46;
  const base = 96;
  const courses = [56, 66, 76, 86];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      className={`cad-preview ${className}`}
      role="img"
      aria-label="Site tank elevation with cone roof and plate courses"
    >
      <path d={`M ${left - 2} ${eave} L 60 30 L ${right + 2} ${eave}`} stroke="currentColor" strokeWidth="1.5" opacity="0.85" />
      <rect x="55" y="27" width="10" height="5" stroke="currentColor" strokeWidth="1" opacity="0.6" />
      <line x1={left} y1={eave} x2={left} y2={base} stroke="currentColor" strokeWidth="1.5" opacity="0.85" />
      <line x1={right} y1={eave} x2={right} y2={base} stroke="currentColor" strokeWidth="1.5" opacity="0.85" />
      {courses.map((y) => (
        <line key={y} x1={left} y1={y} x2={right} y2={y} stroke="currentColor" strokeWidth="0.75" strokeDasharray="3 2" opacity="0.45" />
      ))}
      <path d={`M ${left} ${base} L 60 ${base + 4} L ${right} ${base}`} stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
      <line x1={left - 6} y1={base + 6} x2={right + 6} y2={base + 6} stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <line x1="60" y1="20" x2="60" y2="108" stroke="currentColor" strokeWidth="0.6" strokeDasharray="6 2 1 2" opacity="0.35" />
      <line x1={left} y1={eave - 4} x2={right} y2={eave - 4} stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
    </svg>
  );
}
