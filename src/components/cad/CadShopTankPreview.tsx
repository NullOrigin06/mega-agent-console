interface CadPreviewProps {
  size?: number;
  className?: string;
}

/**
 * Shop tank elevation: vertical shell between two torispherical dished
 * heads, course seams, and leg supports with base plates - the shop-built
 * vessel the Shop Tank module sizes.
 */
export function CadShopTankPreview({ size = 120, className = "" }: CadPreviewProps) {
  const left = 38;
  const right = 82;
  const top = 30;
  const bottom = 84;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      className={`cad-preview ${className}`}
      role="img"
      aria-label="Shop tank elevation with dished heads and legs"
    >
      <path d={`M ${left} ${top} Q ${left} 16 60 14 Q ${right} 16 ${right} ${top}`} stroke="currentColor" strokeWidth="1.5" opacity="0.85" />
      <path d={`M ${left} ${bottom} Q ${left} 98 60 100 Q ${right} 98 ${right} ${bottom}`} stroke="currentColor" strokeWidth="1.5" opacity="0.85" />
      <line x1={left} y1={top} x2={left} y2={bottom} stroke="currentColor" strokeWidth="1.5" opacity="0.85" />
      <line x1={right} y1={top} x2={right} y2={bottom} stroke="currentColor" strokeWidth="1.5" opacity="0.85" />
      {[top, 48, 66, bottom].map((y) => (
        <line key={y} x1={left} y1={y} x2={right} y2={y} stroke="currentColor" strokeWidth="0.75" strokeDasharray="3 2" opacity="0.45" />
      ))}
      <line x1="60" y1="8" x2="60" y2="106" stroke="currentColor" strokeWidth="0.6" strokeDasharray="6 2 1 2" opacity="0.35" />
      <rect x="56" y="6" width="8" height="8" stroke="currentColor" strokeWidth="1" opacity="0.6" />
      {[44, 76].map((x) => (
        <g key={x} opacity="0.75">
          <line x1={x - 2} y1={92} x2={x - 2} y2={112} stroke="currentColor" strokeWidth="1.1" />
          <line x1={x + 2} y1={92} x2={x + 2} y2={112} stroke="currentColor" strokeWidth="1.1" />
          <line x1={x - 6} y1={112} x2={x + 6} y2={112} stroke="currentColor" strokeWidth="1.4" />
        </g>
      ))}
    </svg>
  );
}
