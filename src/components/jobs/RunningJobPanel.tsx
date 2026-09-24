import { useEffect, useState } from "react";
import type { JobSummary } from "../../types/engineering";
import type { PairedAgentInfo } from "../../api";
import { ModuleBadge } from "../common/Badge";
import { IconLoader } from "../common/Icon";

interface RunningJobPanelProps {
  job: JobSummary;
  agents: PairedAgentInfo[];
  onView: (jobId: string) => void;
}

type StageState = "done" | "active" | "pending";

function Stage({ label, state }: { label: string; state: StageState }) {
  return (
    <div className={`pipeline-stage pipeline-stage-${state}`}>
      <span className="pipeline-stage-dot" />
      <span className="pipeline-stage-label">{label}</span>
    </div>
  );
}

/**
 * Full-width hero for whichever job is actually running right now - a real
 * status strip built only from `status` and `drawingStatus` (the two fields
 * the job model actually reports), not a fabricated percent-complete bar.
 */
export function RunningJobPanel({ job, agents, onView }: RunningJobPanelProps) {
  const [now, setNow] = useState(() => Date.now());

  // Re-render once a second so the elapsed-time readout stays live - real
  // elapsed time computed from createdAt, not a simulated progress value.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(job.createdAt).getTime()) / 1000));
  const elapsed = (() => {
    if (elapsedSeconds < 60) return `${elapsedSeconds}s`;
    const mins = Math.floor(elapsedSeconds / 60);
    if (mins < 60) return `${mins}m ${elapsedSeconds % 60}s`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ${mins % 60}m`;
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  })();

  const onlineAgents = agents.filter((a) => a.online);

  const queuedState: StageState = "done";
  const calculatingState: StageState = job.status === "running" ? "active" : "done";
  const bomReadyState: StageState =
    job.status === "completed" ? "done" : job.status === "running" ? "pending" : "pending";
  const drawingState: StageState =
    job.drawingStatus === "generated"
      ? "done"
      : job.drawingStatus === "generating"
        ? "active"
        : "pending";

  return (
    <div className="running-job-panel">
      <div className="running-job-panel-header">
        <IconLoader size={20} className="animate-spin text-accent" />
        <span className="text-mono running-job-id">{job.id}</span>
        <ModuleBadge module={job.module} />
        <span className="running-job-shell text-mono">Shell Ø{job.shellId}mm</span>
        <span className="running-job-elapsed text-mono">{elapsed} elapsed</span>
        <button type="button" className="btn btn-outline-sm running-job-view-btn" onClick={() => onView(job.id)}>
          View Detail
        </button>
      </div>

      <div className="pipeline-stage-strip">
        <Stage label="Queued" state={queuedState} />
        <span className="pipeline-stage-connector" />
        <Stage label="Calculating" state={calculatingState} />
        <span className="pipeline-stage-connector" />
        <Stage label="BOM Ready" state={bomReadyState} />
        <span className="pipeline-stage-connector" />
        <Stage label="Drawing" state={drawingState} />
      </div>

      <div className="running-job-agent-line text-mono">
        {onlineAgents.length > 0
          ? `Local Agent: ${onlineAgents[0].name || onlineAgents[0].agentId} · GstarCAD ready`
          : "No Local Agent online - drawing generation will wait until one connects"}
      </div>
    </div>
  );
}
