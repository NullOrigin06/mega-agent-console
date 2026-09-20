import { useState, useEffect, useCallback, useRef } from "react";
import type { JobDetail } from "../../types/engineering";
import { getJob, generateDrawing } from "../../api";
import { StatusBadge, ModuleBadge } from "../common/Badge";
import {
  IconArrowLeft,
  IconRefresh,
  IconAlertTriangle,
  IconClock,
  IconLoader,
  IconCheckCircle,
  IconFileText,
  IconLayers,
  IconDrafting,
} from "../common/Icon";
import { EngineeringDataView } from "./EngineeringDataView";
import { SpecsAndNozzlesView } from "./SpecsAndNozzlesView";
import { BomView } from "./BomView";
import { DrawingView } from "./DrawingView";

interface JobDetailViewProps {
  jobId: string;
  onBack: () => void;
  onRefreshList: () => void;
}

type TabType = "values" | "specs" | "bom" | "drawing";

export function JobDetailView({
  jobId,
  onBack,
  onRefreshList,
}: JobDetailViewProps) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("values");
  const [copied, setCopied] = useState(false);
  const [isTriggeringGeneration, setIsTriggeringGeneration] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Always-current ref to the (identity-unstable, freshly-created-per-render)
  // onRefreshList prop, so effects/callbacks below can call it without
  // needing it in their dependency arrays. Updated in an effect, not during
  // render, per React's rules on refs.
  const onRefreshListRef = useRef(onRefreshList);
  useEffect(() => {
    onRefreshListRef.current = onRefreshList;
  }, [onRefreshList]);

  const fetchDetail = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getJob(jobId);
      setJob(data || null);
    } catch {
      setJob(null);
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  // Silent refresh (no loading spinner) — used while polling for drawing
  // generation status, so the UI doesn't flicker back to a full loading state.
  // Also nudges the parent's global job list (onRefreshList) so a job opened
  // straight from a Module Workspace page - which never itself refetches the
  // list - doesn't leave a stale "Queued"/"Running" row behind in All Jobs
  // once this view's own polling sees it settle.
  const refreshSilently = useCallback(async () => {
    try {
      const data = await getJob(jobId);
      setJob(data || null);
      onRefreshListRef.current();
    } catch {
      // keep last-known state on a transient poll failure
    }
  }, [jobId]);

  // Poll while a drawing is generating (real CAD generation can take over a
  // minute), or while the job itself is still queued/running (BOM/engineering
  // calc is normally fast - a couple seconds - but has no other push signal)
  // - stop as soon as either settles.
  const isPolling =
    job?.drawingStatus === "generating" ||
    job?.status === "queued" ||
    job?.status === "running";

  useEffect(() => {
    if (isPolling) {
      if (!pollIntervalRef.current) {
        const intervalMs = job?.drawingStatus === "generating" ? 3000 : 1000;
        pollIntervalRef.current = setInterval(refreshSilently, intervalMs);
      }
    } else if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isPolling, job?.drawingStatus, refreshSilently]);

  const handleGenerateDrawing = async () => {
    if (!job) return;
    setIsTriggeringGeneration(true);
    try {
      await generateDrawing(job.id);
      await refreshSilently();
    } catch (err) {
      console.warn("[JobDetailView] generateDrawing failed to start:", err);
      await refreshSilently();
    } finally {
      setIsTriggeringGeneration(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    getJob(jobId)
      .then((data) => {
        if (isMounted) {
          setJob(data || null);
          setIsLoading(false);
          // A job opened right after submission (e.g. from a Module Workspace
          // page) may already be "completed" on this very first fetch,
          // before polling ever has a reason to start - make sure the
          // parent's global list picks up its real status too, not just a
          // stale copy from the moment it was queued.
          onRefreshListRef.current();
        }
      })
      .catch(() => {
        if (isMounted) {
          setJob(null);
          setIsLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [jobId]);

  const handleRefresh = () => {
    fetchDetail();
    onRefreshList();
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(jobId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTimestamp = (isoString?: string) => {
    if (!isoString) return "-";
    try {
      const date = new Date(isoString);
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
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
      if (seconds < 60) return `${seconds} seconds`;
      const mins = Math.floor(seconds / 60);
      const remSecs = seconds % 60;
      return `${mins} min ${remSecs} sec`;
    } catch {
      return null;
    }
  };

  if (isLoading) {
    return (
      <div className="job-detail-loading">
        <IconLoader size={36} className="text-accent" />
        <p className="loading-text">Loading job detail for {jobId} from mock API...</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="job-detail-not-found">
        <IconAlertTriangle size={48} className="text-rose" />
        <h2>Job Not Found</h2>
        <p>No job record exists with ID {jobId}.</p>
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          <IconArrowLeft size={16} />
          <span>Back to Jobs</span>
        </button>
      </div>
    );
  }

  const duration = calculateDuration(job.createdAt, job.completedAt);
  const hasEngData = Boolean(job.engineeringData);

  return (
    <div className="job-detail-container">
      {/* Detail Header & Navigation */}
      <div className="detail-header-nav">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
          <IconArrowLeft size={16} />
          <span>Back to Job List</span>
        </button>

        <div className="detail-actions-right">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleRefresh}
            title="Refresh current job and list"
          >
            <IconRefresh size={14} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Job Overview Card */}
      <div className="job-overview-card">
        <div className="overview-main-row">
          <div className="overview-title-block">
            <div className="overview-id-row">
              <span className="overview-job-id text-mono">{job.id}</span>
              <button
                type="button"
                className="btn-copy-id"
                onClick={handleCopyId}
                title="Copy Job ID to clipboard"
              >
                {copied ? "✓ Copied" : "Copy ID"}
              </button>
              <StatusBadge status={job.status} />
              <ModuleBadge module={job.module} />
            </div>
            <h2 className="overview-heading">
              {job.module === "HeatExchangerFab"
                ? "Heat Exchanger Complete Fabrication Run"
                : job.module === "TubeSheet"
                  ? "Tube Sheet Drilling & Geometry Run"
                  : "Bonnet Flange & Shell Synthesis Run"}
            </h2>
          </div>

          <div className="overview-stats-cluster">
            <div className="stat-box">
              <span className="stat-label">Nominal Shell ID</span>
              <span className="stat-value text-mono">
                {job.shellId} <span className="stat-unit">mm</span>
              </span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Created</span>
              <span className="stat-value-sm text-dim">
                {formatTimestamp(job.createdAt)}
              </span>
            </div>
            {job.completedAt && (
              <div className="stat-box">
                <span className="stat-label">Completed</span>
                <span className="stat-value-sm text-dim">
                  {formatTimestamp(job.completedAt)}
                </span>
              </div>
            )}
            {duration && (
              <div className="stat-box">
                <span className="stat-label">Total Duration</span>
                <span className="stat-value text-mono text-success">
                  {duration}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Failed Job Banner */}
        {job.status === "failed" && (
          <div className="status-banner status-banner-failed" role="alert">
            <div className="status-banner-icon">
              <IconAlertTriangle size={24} />
            </div>
            <div className="status-banner-body">
              <div className="status-banner-title">
                Job Failed during CAD Automation Execution
              </div>
              <div className="status-banner-message text-mono">
                {job.errorMessage || "Unknown error occurred during generation run."}
              </div>
              <div className="status-banner-remediation">
                <strong>Diagnostic Note (MegaEngineeringSuite):</strong> Error code{" "}
                <code>GEN-001</code> typically indicates that the CAD COM server
                (GstarCAD / AutoCAD) was busy, crashed, or did not respond in time to
                drawing commands. Ensure the CAD workstation has the required
                drawing template and licensing active.
              </div>
            </div>
          </div>
        )}

        {/* Running Job Banner */}
        {job.status === "running" && (
          <div className="status-banner status-banner-running">
            <div className="status-banner-icon">
              <IconLoader size={24} className="animate-spin text-accent" />
            </div>
            <div className="status-banner-body">
              <div className="status-banner-title">
                Engineering Calculation & CAD Synthesis In Progress
              </div>
              <p className="status-banner-text">
                The headless engineering engine is processing geometric formulas,
                solving tube pitch patterns, and synthesizing 3D geometry for Shell ID{" "}
                <strong>{job.shellId} mm</strong>.
              </p>
              <div className="progress-bar-track">
                <div className="progress-bar-fill animate-progress" />
              </div>
            </div>
          </div>
        )}

        {/* Queued Job Banner */}
        {job.status === "queued" && (
          <div className="status-banner status-banner-queued">
            <div className="status-banner-icon">
              <IconClock size={24} className="text-amber" />
            </div>
            <div className="status-banner-body">
              <div className="status-banner-title">
                Job Queued for Background Execution
              </div>
              <p className="status-banner-text">
                Job is dispatched and awaiting an available CAD worker process. Execution
                will begin automatically.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs Navigation (Shown for jobs with data, or completed jobs) */}
      {hasEngData ? (
        <div className="detail-tabs-wrapper">
          <nav className="detail-tabs-nav" aria-label="Job Detail Sections">
            <button
              type="button"
              className={`detail-tab-btn ${activeTab === "values" ? "detail-tab-active" : ""}`}
              onClick={() => setActiveTab("values")}
            >
              <IconLayers size={16} />
              <span>Calculated Values</span>
              <span className="tab-pill">Actual vs. Estimated</span>
            </button>

            <button
              type="button"
              className={`detail-tab-btn ${activeTab === "specs" ? "detail-tab-active" : ""}`}
              onClick={() => setActiveTab("specs")}
            >
              <IconFileText size={16} />
              <span>Specifications & Nozzles</span>
              <span className="tab-pill">
                {job.engineeringData?.nozzles.length || 0} Nozzles
              </span>
            </button>

            <button
              type="button"
              className={`detail-tab-btn ${activeTab === "bom" ? "detail-tab-active" : ""}`}
              onClick={() => setActiveTab("bom")}
            >
              <IconCheckCircle size={16} />
              <span>Bill of Materials</span>
              <span className="tab-pill">
                {job.bom?.length || 0} Items
              </span>
            </button>

            <button
              type="button"
              className={`detail-tab-btn ${activeTab === "drawing" ? "detail-tab-active" : ""}`}
              onClick={() => setActiveTab("drawing")}
            >
              <IconDrafting size={16} />
              <span>CAD Drawing & Output</span>
              {job.drawingStatus === "generated" && (
                <span className="tab-pill-ready">Ready</span>
              )}
              {job.drawingStatus === "generating" && (
                <span className="tab-pill">Generating</span>
              )}
            </button>
          </nav>

          {/* Active Tab Panel */}
          <div className="tab-panel-content">
            {activeTab === "values" && job.engineeringData && (
              <EngineeringDataView initialData={job.engineeringData} />
            )}

            {activeTab === "specs" && job.engineeringData && (
              <SpecsAndNozzlesView data={job.engineeringData} />
            )}

            {activeTab === "bom" && (
              <BomView bom={job.bom} jobId={job.id} />
            )}

            {activeTab === "drawing" && (
              <DrawingView
                drawingStatus={job.drawingStatus}
                drawingError={job.drawingError}
                jobId={job.id}
                module={job.module}
                shellId={job.shellId}
                onGenerate={handleGenerateDrawing}
                isTriggering={isTriggeringGeneration}
              />
            )}
          </div>
        </div>
      ) : (
        /* When job does not have engineeringData attached yet (e.g. newly queued or running) */
        <div className="no-data-card">
          <IconLayers size={40} className="text-dim" />
          <h3>Data Extraction Pending</h3>
          <p>
            Detailed engineering values, nozzles, BOM, and CAD drawings are compiled
            upon job completion. For a full demonstration of the review screens, explore{" "}
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                onBack();
                // User will click job-1001
              }}
            >
              job-1001
            </button>
            .
          </p>
        </div>
      )}
    </div>
  );
}
