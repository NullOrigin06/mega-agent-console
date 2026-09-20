import { IconCpu, IconPlus, IconRefresh } from "../common/Icon";
import type { JobSummary } from "../../types/engineering";

interface HeaderProps {
  jobs: JobSummary[];
  onOpenSubmit: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  onGoHome: () => void;
}

export function Header({
  jobs,
  onOpenSubmit,
  onRefresh,
  isRefreshing = false,
  onGoHome,
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
            <IconCpu size={22} className="text-accent" />
          </div>
          <div className="brand-text">
            <div className="brand-title-row">
              <span className="brand-name">MEGA AGENT CONSOLE</span>
              <span className="brand-env-tag">MOCK API v1.0</span>
            </div>
            <span className="brand-subtitle">
              Mega EPC Pressure Vessel & CAD Automation
            </span>
          </div>
        </button>
      </div>

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

        <button
          type="button"
          className="btn btn-primary"
          onClick={onOpenSubmit}
          id="btn-submit-job-header"
        >
          <IconPlus size={16} />
          <span>Submit Job</span>
        </button>
      </div>
    </header>
  );
}
