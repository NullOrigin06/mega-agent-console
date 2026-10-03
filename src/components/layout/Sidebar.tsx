import type { ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { ModuleKind } from "../../types/engineering";
import { moduleGroup } from "../../utils/moduleGroup";
import { MODULE_OPTIONS } from "../../constants/modules";
import { IconGrid, IconList, IconCpu, IconArrowLeft, IconArrowRight } from "../common/Icon";
import { ambientBus } from "../ambient/ambientBus";
import megaLogo from "../../assets/mega-logo.png";

type Page = "modules" | "jobs";

interface SidebarProps {
  page: Page;
  workspaceModule: ModuleKind | null;
  onGoHome: () => void;
  onNavigate: (page: Page) => void;
  onSelectModule: (module: ModuleKind) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  agentSummary: { online: number; total: number };
  mobileOpen?: boolean;
}

/** Collapsed sidebar hides link labels, so give collapsed icons a tooltip. */
function NavItem({ collapsed, label, children }: { collapsed: boolean; label: string; children: ReactNode }) {
  if (!collapsed) return <>{children}</>;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip-content" side="right" sideOffset={8}>
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function Sidebar({
  page,
  workspaceModule,
  onGoHome,
  onNavigate,
  onSelectModule,
  collapsed,
  onToggleCollapsed,
  agentSummary,
  mobileOpen = false,
}: SidebarProps) {
  const onModules = page === "modules" && !workspaceModule;

  return (
    <aside
      className={`sidebar ${collapsed ? "sidebar-collapsed" : ""} ${mobileOpen ? "sidebar-open" : ""}`}
    >
      <div className="sidebar-header">
        <button type="button" className="sidebar-brand" onClick={onGoHome} title="MEGA Agent Console">
          <div className="sidebar-brand-logo">
            <img src={megaLogo} alt="Mega EPC" />
          </div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">MEGA</span>
            <span className="sidebar-brand-tag">ENGINEERING</span>
          </div>
        </button>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <IconArrowRight size={13} /> : <IconArrowLeft size={13} />}
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        <div>
          <div className="sidebar-section-title">Modules</div>
          <NavItem collapsed={collapsed} label="Command Center">
            <button
              type="button"
              className={`sidebar-link ${onModules ? "sidebar-link-active" : ""}`}
              onClick={() => onNavigate("modules")}
            >
              <IconGrid size={16} />
              <span>Command Center</span>
            </button>
          </NavItem>
          {MODULE_OPTIONS.map((mod) => (
            <NavItem key={mod.kind} collapsed={collapsed} label={mod.title}>
              <button
                type="button"
                className={`sidebar-link sidebar-link-sub ${workspaceModule && moduleGroup(workspaceModule) === mod.kind ? "sidebar-link-active" : ""}`}
                onClick={() => onSelectModule(mod.kind)}
                onPointerEnter={() => ambientBus.highlight(mod.kind)}
                onPointerLeave={() => ambientBus.highlight(null)}
              >
                <mod.icon size={14} />
                <span>{mod.title}</span>
              </button>
            </NavItem>
          ))}
        </div>

        <div>
          <div className="sidebar-section-title">Operations</div>
          <NavItem collapsed={collapsed} label="Jobs Dashboard">
            <button
              type="button"
              className={`sidebar-link ${page === "jobs" && !workspaceModule ? "sidebar-link-active" : ""}`}
              onClick={() => onNavigate("jobs")}
            >
              <IconList size={16} />
              <span>Jobs Dashboard</span>
            </button>
          </NavItem>
        </div>
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-system-status">
          <span
            className={`sidebar-status-dot ${
              agentSummary.total === 0
                ? "sidebar-status-dot-warn"
                : agentSummary.online === 0
                  ? "sidebar-status-dot-error"
                  : ""
            }`}
          />
          <IconCpu size={13} />
          <span>
            {agentSummary.total === 0
              ? "No agent paired"
              : `${agentSummary.online}/${agentSummary.total} agent online`}
          </span>
        </div>
      </div>
    </aside>
  );
}
