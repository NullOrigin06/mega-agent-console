import type { ModuleKind } from "../../types/engineering";
import { MODULE_OPTIONS } from "../../constants/modules";
import { IconArrowRight } from "../common/Icon";

interface ModulesHomeProps {
  onSelectModule: (module: ModuleKind) => void;
}

/**
 * Landing page mirroring the desktop suite's Form2 ("Structure Selection")
 * - pick a module first, then land on that module's own full workspace page
 * (ModuleWorkspace), rather than a generic job-submission modal.
 */
export function ModulesHome({ onSelectModule }: ModulesHomeProps) {
  return (
    <div className="modules-home">
      <div className="modules-home-header">
        <h1 className="modules-home-title">Engineering Modules</h1>
        <p className="modules-home-subtitle">
          Choose a module to size, calculate, review, and generate a drawing
          - all in one place, just like the desktop suite's Form3.
        </p>
      </div>

      <div className="modules-home-grid">
        {MODULE_OPTIONS.map((mod) => {
          const IconComponent = mod.icon;
          return (
            <button
              key={mod.kind}
              type="button"
              className="module-home-card"
              onClick={() => onSelectModule(mod.kind)}
            >
              <div className="module-home-card-glow" aria-hidden="true" />
              <div className="module-home-card-top">
                <div className="module-home-card-icon">
                  <IconComponent size={30} />
                </div>
                <span className="module-card-badge">{mod.badge}</span>
              </div>
              <h2 className="module-home-card-title">{mod.title}</h2>
              <p className="module-home-card-desc">{mod.description}</p>
              <div className="module-home-card-cta">
                <span>Open Module</span>
                <IconArrowRight size={16} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
