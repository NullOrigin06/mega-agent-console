import { useEffect, useState, type ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { JobSummary, ModuleKind } from "../../types/engineering";
import type { PairedAgentInfo } from "../../api";
import type { AuthSession } from "../../utils/authSession";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { PipelineStatusRail } from "./PipelineStatusRail";
import { CommandPalette } from "../common/CommandPalette";
import { RotateKeyModal } from "../auth/RotateKeyModal";

type Page = "modules" | "jobs";

interface AppShellProps {
  page: Page;
  workspaceModule: ModuleKind | null;
  jobs: JobSummary[];
  agents: PairedAgentInfo[];
  apiOk: boolean;
  onGoHome: () => void;
  onNavigate: (page: Page) => void;
  onSelectModule: (module: ModuleKind) => void;
  onSelectJob: (jobId: string) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  session?: AuthSession | null;
  onLogout?: () => void;
  onSessionUpdate?: (session: AuthSession) => void;
  children: ReactNode;
}

export function AppShell({
  page,
  workspaceModule,
  jobs,
  agents,
  apiOk,
  onGoHome,
  onNavigate,
  onSelectModule,
  onSelectJob,
  onRefresh,
  isRefreshing,
  session,
  onLogout,
  onSessionUpdate,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showRotateKey, setShowRotateKey] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const agentSummary = {
    online: agents.filter((a) => a.online).length,
    total: agents.length,
  };

  // Below the sidebar's mobile breakpoint it's off-canvas by default (see
  // index.css's `@media (max-width: 900px)` rule) - any navigation there
  // should also close it again, same as a click on the backdrop.
  const closeMobileNav = () => setMobileNavOpen(false);

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="app-shell">
        <Sidebar
          page={page}
          workspaceModule={workspaceModule}
          onGoHome={() => {
            onGoHome();
            closeMobileNav();
          }}
          onNavigate={(p) => {
            onNavigate(p);
            closeMobileNav();
          }}
          onSelectModule={(m) => {
            onSelectModule(m);
            closeMobileNav();
          }}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((c) => !c)}
          agentSummary={agentSummary}
          mobileOpen={mobileNavOpen}
        />
        {mobileNavOpen && (
          <div className="sidebar-backdrop" onClick={closeMobileNav} aria-hidden="true" />
        )}
        <div className="app-shell-body">
          <Header
            session={session}
            onLogout={onLogout}
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
            onOpenMobileNav={() => setMobileNavOpen(true)}
            onOpenRotateKey={() => setShowRotateKey(true)}
          />
          <PipelineStatusRail jobs={jobs} agents={agents} apiOk={apiOk} />
          <main className="main-content">{children}</main>
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onNavigate={onNavigate}
        onSelectModule={onSelectModule}
        onSelectJob={onSelectJob}
        onRefresh={onRefresh}
        onOpenRotateKey={() => setShowRotateKey(true)}
        onLogout={onLogout}
        jobs={jobs}
      />

      {showRotateKey && session && (
        <RotateKeyModal
          session={session}
          onClose={() => setShowRotateKey(false)}
          onKeyRotated={(updated) => onSessionUpdate?.(updated)}
        />
      )}
    </Tooltip.Provider>
  );
}
