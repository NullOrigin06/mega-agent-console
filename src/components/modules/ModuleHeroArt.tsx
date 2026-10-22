import type { ModuleKind } from "../../types/engineering";
import { MODULE_ART } from "./moduleArt";

interface ModuleHeroArtProps {
  module: ModuleKind;
  /** A job of this module is queued or running: the render gets a brighter rim and a slow pulse ring. */
  active?: boolean;
}

/**
 * The module's rendered part, shown at the right of a workspace header (the
 * same renders as the Command Center cards). Decorative: the title, badge and
 * description next to it carry the information.
 */
export function ModuleHeroArt({ module, active = false }: ModuleHeroArtProps) {
  const src = MODULE_ART[module];
  if (!src) return null;
  return (
    <div className={`module-hero-art module-hero-art-${module}`} data-active={active ? "true" : undefined} aria-hidden="true">
      <span className="module-hero-art-glow" />
      <span className="module-hero-art-ring" />
      <img src={src} alt="" decoding="async" draggable={false} />
    </div>
  );
}
