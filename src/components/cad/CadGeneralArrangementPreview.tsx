interface CadPreviewProps {
  size?: number;
  className?: string;
}

/**
 * Real engineering line-art for a General Arrangement drawing: the vessel in
 * elevation with dished ends, body flanges, two saddles, flanged nozzles with
 * their hexagon tags, a centre-line and an overall dimension line - the same
 * language the generated GAD uses.
 */
export function CadGeneralArrangementPreview({ size = 120, className = "" }: CadPreviewProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      className={`cad-preview ${className}`}
      role="img"
      aria-label="General arrangement drawing of a shell and tube vessel"
    >
      {/* Shell with torispherical dished ends */}
      <path
        d="M 27 44 H 93 Q 106 44 106 58 Q 106 72 93 72 H 27 Q 14 72 14 58 Q 14 44 27 44 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.85"
      />

      {/* Body flanges / tube sheets */}
      <line x1="33" y1="41" x2="33" y2="75" stroke="currentColor" strokeWidth="2" opacity="0.75" />
      <line x1="87" y1="41" x2="87" y2="75" stroke="currentColor" strokeWidth="2" opacity="0.75" />

      {/* Tube bundle (hidden) */}
      <line x1="35" y1="52" x2="85" y2="52" stroke="currentColor" strokeWidth="0.75" strokeDasharray="3 2" opacity="0.45" />
      <line x1="35" y1="64" x2="85" y2="64" stroke="currentColor" strokeWidth="0.75" strokeDasharray="3 2" opacity="0.45" />

      {/* Saddles */}
      <path d="M 41 72 L 38 90 H 52 L 49 72" stroke="currentColor" strokeWidth="1.25" opacity="0.8" />
      <path d="M 71 72 L 68 90 H 82 L 79 72" stroke="currentColor" strokeWidth="1.25" opacity="0.8" />
      <line x1="30" y1="90" x2="90" y2="90" stroke="currentColor" strokeWidth="1.25" opacity="0.7" />

      {/* Flanged nozzles (top) with tags */}
      <rect x="40" y="30" width="7" height="14" stroke="currentColor" strokeWidth="1.25" opacity="0.8" />
      <line x1="38" y1="30" x2="49" y2="30" stroke="currentColor" strokeWidth="2" opacity="0.8" />
      <rect x="67" y="26" width="14" height="18" stroke="currentColor" strokeWidth="1.25" opacity="0.8" />
      <line x1="64" y1="26" x2="84" y2="26" stroke="currentColor" strokeWidth="2" opacity="0.8" />
      <polygon points="43.5,14 47,16 47,20 43.5,22 40,20 40,16" stroke="currentColor" strokeWidth="0.9" opacity="0.7" />
      <polygon points="74,10 77.5,12 77.5,16 74,18 70.5,16 70.5,12" stroke="currentColor" strokeWidth="0.9" opacity="0.7" />
      <line x1="43.5" y1="22" x2="43.5" y2="28" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.5" />
      <line x1="74" y1="18" x2="74" y2="24" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.5" />

      {/* Bottom nozzle */}
      <rect x="57" y="72" width="5" height="9" stroke="currentColor" strokeWidth="1.25" opacity="0.8" />
      <line x1="55" y1="81" x2="64" y2="81" stroke="currentColor" strokeWidth="2" opacity="0.8" />

      {/* Centre-line */}
      <line x1="8" y1="58" x2="112" y2="58" stroke="currentColor" strokeWidth="0.5" strokeDasharray="6 3 2 3" opacity="0.35" />

      {/* Overall dimension line with arrowheads */}
      <line x1="14" y1="102" x2="106" y2="102" stroke="currentColor" strokeWidth="0.75" opacity="0.6" />
      <line x1="14" y1="98" x2="14" y2="106" stroke="currentColor" strokeWidth="0.75" opacity="0.6" />
      <line x1="106" y1="98" x2="106" y2="106" stroke="currentColor" strokeWidth="0.75" opacity="0.6" />
      <path d="M 14 102 L 19 100 V 104 Z M 106 102 L 101 100 V 104 Z" fill="currentColor" opacity="0.6" />
    </svg>
  );
}
