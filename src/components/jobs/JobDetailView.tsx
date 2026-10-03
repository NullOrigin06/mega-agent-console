import { useState, useEffect, useCallback, useRef } from "react";
import * as Tabs from "@radix-ui/react-tabs";
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
  IconTrash,
} from "../common/Icon";
import { EngineeringDataView } from "./EngineeringDataView";
import { SpecsAndNozzlesView } from "./SpecsAndNozzlesView";
import { BomView } from "./BomView";
import { DrawingView } from "./DrawingView";
import { TankParametersView, TankSummaryView } from "./TankDataViews";

interface JobDetailViewProps {
  jobId: string;
  onBack: () => void;
  onRefreshList: () => void;
  onDeleteJob: (jobId: string) => Promise<void>;
}

const RUN_TITLES: Record<JobDetail["module"], string> = {
  HeatExchangerFab: "Heat Exchanger Complete Fabrication Run",
  GeneralArrangement: "General Arrangement Drawing Run",
  TubeSheet: "Tube Sheet Drilling & Geometry Run",
  BonnetFlange: "Bonnet Flange & Shell Synthesis Run",
  ShopTank: "Shop Tank Sizing & GA Run",
  SiteTank: "Site Tank Sizing & GA Run",
};

type TabType = "values" | "specs" | "bom" | "drawing";

export function JobDetailView({
  jobId,
  onBack,
  onRefreshList,
  onDeleteJob,
}: JobDetailViewProps) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("values");
  const [copied, setCopied] = useState(false);
  const [isTriggeringGeneration, setIsTriggeringGeneration] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleDeleteClick = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setIsDeleting(true);
    try {
      await onDeleteJob(jobId);
    } finally {
      setIsDeleting(false);
    }
  };

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

  const handleGenerateDrawing = async (agentId?: string) => {
    if (!job) return;
    setIsTriggeringGeneration(true);
    try {
      await generateDrawing(job.id, agentId);
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
      <div className="job-detail-loading" data-ambient-quiet>
        <IconLoader size={36} className="text-accent" />
        <p className="loading-text">Loading job detail for {jobId} from mock API...</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="job-detail-not-found" data-ambient-quiet>
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
  const hasEngData = Boolean(job.engineeringData || job.tankData);
  const tank = job.tankData;

  return (
    <div className="job-detail-container" data-ambient-column>
      {/* Detail Header & Navigation */}
      <div className="detail-header-nav" data-ambient-header data-ambient-quiet>
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
          <button
            type="button"
            className={`btn btn-outline-sm btn-danger-sm ${confirmDelete ? "btn-danger-confirm" : ""}`}
            disabled={isDeleting}
            onClick={handleDeleteClick}
            onBlur={() => setConfirmDelete(false)}
            title={confirmDelete ? "Click again to confirm delete" : "Delete this job"}
          >
            <IconTrash size={14} />
            <span>{confirmDelete ? "Confirm Delete?" : "Delete Job"}</span>
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
              {RUN_TITLES[job.module]}
            </h2>
          </div>

          <div className="overview-stats-cluster">
            <div className="stat-box">
              <span className="stat-label">{job.module === "SiteTank" ? "Shell I.D. (calculated)" : job.module === "ShopTank" ? "Shell I.D." : "Nominal Shell ID"}</span>
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
                {job.module === "ShopTank" || job.module === "SiteTank"
                  ? "The engineering engine is sizing the tank from the thickness chart and building its parameters and BOM for Shell I.D. "
                  : "The headless engineering engine is processing geometric formulas, solving tube pitch patterns, and synthesizing 3D geometry for Shell ID "}
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
        <Tabs.Root
          className="detail-tabs-wrapper"
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TabType)}
        >
          <Tabs.List className="detail-tabs-nav" aria-label="Job Detail Sections">
            <Tabs.Trigger value="values" className="detail-tab-btn">
              <IconLayers size={16} />
              <span>{tank ? "Engineering Parameters" : "Calculated Values"}</span>
              <span className="tab-pill">Actual vs. Estimated</span>
            </Tabs.Trigger>

            <Tabs.Trigger value="specs" className="detail-tab-btn">
              <IconFileText size={16} />
              <span>{tank ? "Summary & Inputs" : "Specifications & Nozzles"}</span>
              <span className="tab-pill">
                {tank ? `${tank.summary.length} Figures` : `${job.engineeringData?.nozzles.length || 0} Nozzles`}
              </span>
            </Tabs.Trigger>

            <Tabs.Trigger value="bom" className="detail-tab-btn">
              <IconCheckCircle size={16} />
              <span>Bill of Materials</span>
              <span className="tab-pill">
                {job.bom?.length || 0} Items
              </span>
            </Tabs.Trigger>

            <Tabs.Trigger value="drawing" className="detail-tab-btn">
              <IconDrafting size={16} />
              <span>CAD Drawing & Output</span>
              {job.drawingStatus === "generated" && (
                <span className="tab-pill-ready">Ready</span>
              )}
              {job.drawingStatus === "generating" && (
                <span className="tab-pill">Generating</span>
              )}
            </Tabs.Trigger>
          </Tabs.List>

          {/* Active Tab Panel */}
          <Tabs.Content value="values" className="tab-panel-content">
            {job.engineeringData && (
              <EngineeringDataView initialData={job.engineeringData} />
            )}
            {tank && <TankParametersView data={tank} />}
          </Tabs.Content>

          <Tabs.Content value="specs" className="tab-panel-content">
            {job.engineeringData && (
              <SpecsAndNozzlesView data={job.engineeringData} showPosition={job.module === "GeneralArrangement"} />
            )}
            {tank && <TankSummaryView data={tank} />}
          </Tabs.Content>

          <Tabs.Content value="bom" className="tab-panel-content">
            <BomView bom={job.bom} jobId={job.id} />
          </Tabs.Content>

          <Tabs.Content value="drawing" className="tab-panel-content">
            <DrawingView
              drawingStatus={job.drawingStatus}
              drawingError={job.drawingError}
              jobId={job.id}
              module={job.module}
              shellId={job.shellId}
              onGenerate={handleGenerateDrawing}
              isTriggering={isTriggeringGeneration}
            />
          </Tabs.Content>
        </Tabs.Root>
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
