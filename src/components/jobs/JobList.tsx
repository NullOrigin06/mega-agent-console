import { useState, useMemo, Fragment } from "react";
import type { JobSummary, ModuleKind, JobStatus } from "../../types/engineering";
import { StatusBadge, ModuleBadge } from "../common/Badge";
import { IS_REAL_API, API_BASE_URL, type PairedAgentInfo } from "../../api";
import { RunningJobPanel } from "./RunningJobPanel";
import {
  IconSearch,
  IconAlertTriangle,
  IconExternalLink,
  IconTrash,
  IconArrowRight,
} from "../common/Icon";

interface JobListProps {
  jobs: JobSummary[];
  agents?: PairedAgentInfo[];
  selectedJobId?: string | null;
  onSelectJob: (jobId: string) => void;
  onGoToModules: () => void;
  onDeleteJob: (jobId: string) => Promise<void>;
}

export function JobList({
  jobs,
  agents = [],
  selectedJobId,
  onSelectJob,
  onGoToModules,
  onDeleteJob,
}: JobListProps) {
  const [selectedModule, setSelectedModule] = useState<ModuleKind | "All">(
    "All"
  );
  const [selectedStatus, setSelectedStatus] = useState<JobStatus | "All">(
    "All"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = (jobId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  // Whichever job is actually running becomes the hero panel - the most
  // recently started one, if somehow more than one is running at once.
  const runningJob = useMemo(
    () =>
      jobs
        .filter((j) => j.status === "running")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0],
    [jobs]
  );

  const handleDeleteClick = async (jobId: string) => {
    if (confirmDeleteId !== jobId) {
      setConfirmDeleteId(jobId);
      return;
    }
    setDeletingId(jobId);
    try {
      await onDeleteJob(jobId);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (selectedModule !== "All" && job.module !== selectedModule) {
        return false;
      }
      if (selectedStatus !== "All" && job.status !== selectedStatus) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = job.id.toLowerCase().includes(q);
        const matchesShell = job.shellId.toString().includes(q);
        const matchesModule = job.module.toLowerCase().includes(q);
        const matchesError = job.errorMessage?.toLowerCase().includes(q);
        if (!matchesId && !matchesShell && !matchesModule && !matchesError) {
          return false;
        }
      }
      return true;
    });
  }, [jobs, selectedModule, selectedStatus, searchQuery]);

  const formatTimestamp = (isoString?: string) => {
    if (!isoString) return "-";
    try {
      const date = new Date(isoString);
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const calculateDuration = (start?: string, end?: string) => {
    if (!start || !end) return null;
    try {
      const ms = new Date(end).getTime() - new Date(start).getTime();
      if (ms <= 0) return null;
      const seconds = Math.floor(ms / 1000);
      if (seconds < 60) return `${seconds}s`;
      const mins = Math.floor(seconds / 60);
      const remSecs = seconds % 60;
      return `${mins}m ${remSecs}s`;
    } catch {
      return null;
    }
  };

  return (
    <div className="job-list-view">
      <div className="view-header">
        <div>
          <h1 className="view-title">Engineering Jobs Dashboard</h1>
          <p className="view-subtitle">
            Monitor real-time status of background CAD synthesis and BOM
            extraction runs
          </p>
        </div>

        <div className="view-header-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onGoToModules}
          >
            + New Generation Job
          </button>
        </div>
      </div>

      {runningJob && (
        <RunningJobPanel job={runningJob} agents={agents} onView={onSelectJob} />
      )}

      {/* Control Bar: Filters & Search */}
      <div className="controls-bar">
        <div className="filter-group">
          <span className="control-label">Module:</span>
          <div className="segmented-control">
            {(
              [
                "All",
                "HeatExchangerFab",
                "TubeSheet",
                "BonnetFlange",
              ] as const
            ).map((mod) => (
              <button
                key={mod}
                type="button"
                className={`segment-btn ${selectedModule === mod ? "segment-btn-active" : ""}`}
                onClick={() => setSelectedModule(mod)}
              >
                {mod === "All"
                  ? "All Modules"
                  : mod === "HeatExchangerFab"
                    ? "HX Fab"
                    : mod === "TubeSheet"
                      ? "Tube Sheet"
                      : "Bonnet Flange"}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <span className="control-label">Status:</span>
          <div className="status-pills">
            {(
              ["All", "completed", "running", "queued", "failed"] as const
            ).map((st) => {
              const count =
                st === "All"
                  ? jobs.length
                  : jobs.filter((j) => j.status === st).length;
              return (
                <button
                  key={st}
                  type="button"
                  className={`status-filter-pill status-pill-${st} ${selectedStatus === st ? "status-filter-pill-active" : ""}`}
                  onClick={() => setSelectedStatus(st)}
                >
                  <span className="status-pill-dot" />
                  <span className="capitalize">{st}</span>
                  <span className="status-pill-count">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="search-box">
          <IconSearch size={16} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search Shell ID, Job ID, or errors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Jobs Table */}
      <div className="table-card">
        <table className="jobs-table" aria-label="Engineering Jobs Table">
          <thead>
            <tr>
              <th aria-label="Expand" />
              <th>Job ID</th>
              <th>Module</th>
              <th>Shell ID</th>
              <th>Status</th>
              <th>Created</th>
              <th>Duration</th>
              <th>Output / Notes</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredJobs.length === 0 ? (
              <tr>
                <td colSpan={9} className="empty-state-cell">
                  <div className="empty-state">
                    <p className="empty-state-title">No matching jobs found</p>
                    <p className="empty-state-text">
                      Try adjusting your search query or status filter, or submit
                      a new job.
                    </p>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setSelectedModule("All");
                        setSelectedStatus("All");
                        setSearchQuery("");
                      }}
                    >
                      Reset Filters
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              filteredJobs.map((job) => {
                const duration = calculateDuration(
                  job.createdAt,
                  job.completedAt
                );
                const isSelected = selectedJobId === job.id;
                const isExpanded = expandedIds.has(job.id);

                return (
                  <Fragment key={job.id}>
                  <tr
                    className={`job-row ${isSelected ? "job-row-selected" : ""} job-row-status-${job.status}`}
                    onClick={() => onSelectJob(job.id)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        onSelectJob(job.id);
                      }
                    }}
                  >
                    <td className="text-center">
                      <button
                        type="button"
                        className={`job-row-expand-toggle ${isExpanded ? "job-row-expand-toggle-open" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpanded(job.id);
                        }}
                        aria-label={isExpanded ? "Collapse row" : "Expand row"}
                        aria-expanded={isExpanded}
                      >
                        <IconArrowRight size={13} />
                      </button>
                    </td>
                    <td className="job-id-cell">
                      <span className="text-mono job-id-text">{job.id}</span>
                    </td>
                    <td>
                      <ModuleBadge module={job.module} />
                    </td>
                    <td className="text-mono font-medium">
                      {job.shellId}{" "}
                      <span className="unit-dim">mm</span>
                    </td>
                    <td>
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="text-dim text-sm">
                      {formatTimestamp(job.createdAt)}
                    </td>
                    <td className="text-mono text-sm text-dim">
                      {duration ? (
                        <span className="duration-tag">{duration}</span>
                      ) : job.status === "running" ? (
                        <span className="duration-tag duration-tag-active">
                          In progress
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="output-cell">
                      {job.status === "failed" && job.errorMessage ? (
                        <div
                          className="error-message-chip"
                          title={job.errorMessage}
                        >
                          <IconAlertTriangle size={13} />
                          <span className="error-text-truncate">
                            {job.errorMessage}
                          </span>
                        </div>
                      ) : job.status === "completed" ? (
                        <span className="text-success text-sm flex-center">
                          ✓ BOM & Drawing Ready
                        </span>
                      ) : job.status === "running" ? (
                        <span className="text-accent text-sm flex-center">
                          ⚙ Processing geometry...
                        </span>
                      ) : (
                        <span className="text-dim text-sm">
                          ⏳ Waiting in execution queue
                        </span>
                      )}
                    </td>
                    <td className="text-right">
                      <div className="job-row-actions">
                        <button
                          type="button"
                          className="btn btn-outline-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectJob(job.id);
                          }}
                        >
                          <span>View</span>
                          <IconExternalLink size={13} />
                        </button>
                        <button
                          type="button"
                          className={`btn btn-outline-sm btn-danger-sm ${confirmDeleteId === job.id ? "btn-danger-confirm" : ""}`}
                          disabled={deletingId === job.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(job.id);
                          }}
                          onBlur={() => setConfirmDeleteId((id) => (id === job.id ? null : id))}
                          title={confirmDeleteId === job.id ? "Click again to confirm delete" : "Delete job"}
                        >
                          <IconTrash size={13} />
                          {confirmDeleteId === job.id && <span>Confirm?</span>}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="job-row-expanded-detail">
                      <td colSpan={9}>
                        <div className="job-row-expanded-grid">
                          <div className="job-row-expanded-field">
                            <span className="job-row-expanded-label">Created</span>
                            <span className="job-row-expanded-value text-mono">
                              {formatTimestamp(job.createdAt)}
                            </span>
                          </div>
                          <div className="job-row-expanded-field">
                            <span className="job-row-expanded-label">Completed</span>
                            <span className="job-row-expanded-value text-mono">
                              {job.completedAt ? formatTimestamp(job.completedAt) : "—"}
                            </span>
                          </div>
                          <div className="job-row-expanded-field">
                            <span className="job-row-expanded-label">Drawing Status</span>
                            <span className="job-row-expanded-value">
                              {job.drawingStatus === "generated"
                                ? "Generated"
                                : job.drawingStatus === "generating"
                                  ? "Generating..."
                                  : job.drawingStatus === "failed"
                                    ? "Failed"
                                    : "Not generated yet"}
                            </span>
                          </div>
                          {job.errorMessage && (
                            <div className="job-row-expanded-field">
                              <span className="job-row-expanded-label">Error</span>
                              <span className="job-row-expanded-value text-mono">{job.errorMessage}</span>
                            </div>
                          )}
                        </div>
                        <div className="job-row-expanded-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => onSelectJob(job.id)}
                          >
                            <span>Open Full Detail</span>
                            <IconExternalLink size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="table-footer-meta">
        <span>
          Showing <strong>{filteredJobs.length}</strong> of{" "}
          <strong>{jobs.length}</strong> total jobs
        </span>
        <span className="text-dim">
          {IS_REAL_API
            ? `Connected to ${new URL(API_BASE_URL, window.location.origin).origin}`
            : "Mock API delay: 400ms"}{" "}
          • Contract source: <code>src/types/engineering.ts</code>
        </span>
      </div>
    </div>
  );
}
