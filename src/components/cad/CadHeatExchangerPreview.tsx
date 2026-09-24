interface CadPreviewProps {
  size?: number;
  className?: string;
}

/**
 * Real engineering line-art for a heat exchanger: shell wall, segmental
 * baffles, and a multi-row tube bundle in cutaway elevation — not a generic
 * "layers" icon standing in for the module.
 */
export function CadHeatExchangerPreview({ size = 120, className = "" }: CadPreviewProps) {
  const tubeRows = [40, 48, 56, 64, 72, 80];
  const baffleXs = [38, 60, 82];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      className={`cad-preview ${className}`}
      role="img"
      aria-label="Heat exchanger shell and tube bundle"
    >
      {/* Shell */}
      <rect x="16" y="35" width="88" height="50" rx="4" stroke="currentColor" strokeWidth="1.5" opacity="0.85" />

      {/* Tube bundle (dashed, running the length of the shell) */}
      {tubeRows.map((y) => (
        <line
          key={y}
          x1="20"
          y1={y}
          x2="100"
          y2={y}
          stroke="currentColor"
          strokeWidth="0.75"
          strokeDasharray="3 2"
          opacity="0.5"
        />
      ))}

      {/* Segmental baffles, alternating top/bottom cut */}
      {baffleXs.map((x, i) => (
        <line
          key={x}
          x1={x}
          y1={i % 2 === 0 ? 35 : 45}
          x2={x}
          y2={i % 2 === 0 ? 75 : 85}
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.75"
        />
      ))}

      {/* Inlet / outlet nozzles */}
      <rect x="30" y="20" width="10" height="15" stroke="currentColor" strokeWidth="1.25" opacity="0.75" />
      <rect x="80" y="20" width="10" height="15" stroke="currentColor" strokeWidth="1.25" opacity="0.75" />

      {/* Centerline */}
      <line x1="10" y1="60" x2="110" y2="60" stroke="currentColor" strokeWidth="0.5" strokeDasharray="6 3 2 3" opacity="0.35" />
    </svg>
  );
}
