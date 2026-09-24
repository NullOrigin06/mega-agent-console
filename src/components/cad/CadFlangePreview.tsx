interface CadPreviewProps {
  size?: number;
  className?: string;
}

/**
 * Real engineering line-art for a body flange face: bolt circle diameter
 * (PCD), bolt holes, gasket sealing face, and hub — not a generic cylinder
 * icon standing in for the module.
 */
export function CadFlangePreview({ size = 120, className = "" }: CadPreviewProps) {
  const center = 60;
  const boltCount = 12;
  const pcd = 42;
  const bolts = Array.from({ length: boltCount }, (_, i) => {
    const angle = (i / boltCount) * Math.PI * 2 - Math.PI / 2;
    return {
      cx: center + pcd * Math.cos(angle),
      cy: center + pcd * Math.sin(angle),
    };
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      className={`cad-preview ${className}`}
      role="img"
      aria-label="Bonnet flange bolt circle"
    >
      <circle cx={center} cy={center} r={52} stroke="currentColor" strokeWidth="1.5" opacity="0.85" />
      <circle
        cx={center}
        cy={center}
        r={pcd}
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity="0.45"
      />
      <circle cx={center} cy={center} r={26} stroke="currentColor" strokeWidth="1.25" opacity="0.7" />
      <circle cx={center} cy={center} r={15} stroke="currentColor" strokeWidth="1" opacity="0.5" />
      {bolts.map((b, i) => (
        <circle key={i} cx={b.cx} cy={b.cy} r="3" stroke="currentColor" strokeWidth="1.25" fill="none" />
      ))}
      <line x1={center} y1={center - 52} x2={center} y2={center - 60} stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
      <line x1={center} y1={center + 52} x2={center} y2={center + 60} stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
    </svg>
  );
}
