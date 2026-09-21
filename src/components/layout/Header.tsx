import { IconRefresh, IconGrid, IconList, IconUser, IconLogOut } from "../common/Icon";
import type { JobSummary } from "../../types/engineering";
import { API_MODE } from "../../api";
import type { AuthSession } from "../../utils/authSession";
import megaLogo from "../../assets/mega-logo.png";

interface HeaderProps {
  jobs: JobSummary[];
  page: "modules" | "jobs";
  onNavigate: (page: "modules" | "jobs") => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  onGoHome: () => void;
  session?: AuthSession | null;
  onLogout?: () => void;
}

export function Header({
  jobs,
  page,
  onNavigate,
  onRefresh,
  isRefreshing = false,
  onGoHome,
  session,
  onLogout,
}: HeaderProps) {

  const total = jobs.length;
  const running = jobs.filter((j) => j.status === "running").length;
  const queued = jobs.filter((j) => j.status === "queued").length;
  const completed = jobs.filter((j) => j.status === "completed").length;
  const failed = jobs.filter((j) => j.status === "failed").length;

  return (
    <header className="console-header">
      <div className="header-brand-container">
        <button
          type="button"
          className="brand-button"
          onClick={onGoHome}
          title="Return to Jobs Dashboard"
        >
          <div className="brand-logo">
            <img src={megaLogo} alt="Mega EPC" />
          </div>
          <div className="brand-text">
            <div className="brand-title-row">
              <span className="brand-name">MEGA AGENT CONSOLE</span>
              <span className={`brand-env-tag ${API_MODE === "real" ? "brand-env-real" : ""}`}>
                {API_MODE === "real" ? "REAL API" : "MOCK API v1.0"}
              </span>
            </div>
            <span className="brand-subtitle">
              Mega EPC Pressure Vessel & CAD Automation
            </span>
          </div>
        </button>
      </div>

      <nav className="header-page-nav" aria-label="Primary">
        <button
          type="button"
          className={`page-nav-btn ${page === "modules" ? "page-nav-active" : ""}`}
          onClick={() => onNavigate("modules")}
        >
          <IconGrid size={15} />
          <span>Modules</span>
        </button>
        <button
          type="button"
          className={`page-nav-btn ${page === "jobs" ? "page-nav-active" : ""}`}
          onClick={() => onNavigate("jobs")}
        >
          <IconList size={15} />
          <span>All Jobs</span>
        </button>
      </nav>

      <div className="header-metrics">
        <div className="metric-pill">
          <span className="metric-label">Total Jobs</span>
          <span className="metric-value">{total}</span>
        </div>
        {running > 0 && (
          <div className="metric-pill metric-pill-running">
            <span className="metric-pulse-dot" />
            <span className="metric-label">Running</span>
            <span className="metric-value">{running}</span>
          </div>
        )}
        {queued > 0 && (
          <div className="metric-pill metric-pill-queued">
            <span className="metric-label">Queued</span>
            <span className="metric-value">{queued}</span>
          </div>
        )}
        <div className="metric-pill metric-pill-completed">
          <span className="metric-label">Completed</span>
          <span className="metric-value">{completed}</span>
        </div>
        {failed > 0 && (
          <div className="metric-pill metric-pill-failed">
            <span className="metric-label">Failed</span>
            <span className="metric-value">{failed}</span>
          </div>
        )}
      </div>

      <div className="header-actions">
        {session && (
          <div className="header-account-pill" title={`Logged in as ${session.email}`}>
            <IconUser size={14} className="text-accent" />
            <span className="header-account-email text-mono">{session.email}</span>
          </div>
        )}

        <button
          type="button"
          className="btn btn-secondary btn-icon"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh job status from API"
        >
          <IconRefresh
            size={16}
            className={isRefreshing ? "animate-spin" : ""}
          />
          <span className="hide-mobile">Refresh</span>
        </button>

        {onLogout && (
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={onLogout}
            title="Sign Out"
          >
            <IconLogOut size={16} />
            <span className="hide-mobile">Sign Out</span>
          </button>
        )}
      </div>
    </header>

  );
}
