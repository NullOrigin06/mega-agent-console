import type { JobSummary } from "../../types/engineering";
import type { PairedAgentInfo } from "../../api";

interface PipelineStatusRailProps {
  jobs: JobSummary[];
  agents: PairedAgentInfo[];
  apiOk: boolean;
}

type NodeState = "ok" | "active" | "warn" | "error" | "idle";

function Node({ label, detail, state }: { label: string; detail?: string; state: NodeState }) {
  return (
    <div className={`pipeline-node ${state !== "idle" ? `pipeline-node-${state}` : ""}`}>
      <span className="pipeline-node-dot" />
      <span className="pipeline-node-label">{label}</span>
      {detail && <span className="pipeline-node-detail">{detail}</span>}
    </div>
  );
}

/**
 * Persistent, live rendering of the system's real topology
 * (Console -> API -> Queue -> Local Agent -> GstarCAD), so "is the pipeline
 * healthy" is answered on every page instead of nowhere.
 */
export function PipelineStatusRail({ jobs, agents, apiOk }: PipelineStatusRailProps) {
  const running = jobs.filter((j) => j.status === "running").length;
  const queued = jobs.filter((j) => j.status === "queued").length;
  const onlineAgents = agents.filter((a) => a.online).length;
  const hasAgent = agents.length > 0;
  const agentOnline = onlineAgents > 0;
  const queueActive = running > 0 || queued > 0;

  return (
    <div className="pipeline-rail" role="status" aria-label="System pipeline status">
      <Node label="CONSOLE" state="ok" />
      <span className="pipeline-connector" />
      <Node label="API" detail={apiOk ? "ONLINE" : "UNREACHABLE"} state={apiOk ? "ok" : "error"} />
      <span className="pipeline-connector" />
      <Node
        label="QUEUE"
        detail={`${running} RUNNING · ${queued} QUEUED`}
        state={queueActive ? "active" : "idle"}
      />
      <span className="pipeline-connector" />
      <Node
        label="LOCAL AGENT"
        detail={hasAgent ? (agentOnline ? "CONNECTED" : "OFFLINE") : "NOT PAIRED"}
        state={!hasAgent ? "warn" : agentOnline ? "ok" : "error"}
      />
      <span className="pipeline-connector" />
      <Node
        label="GSTARCAD"
        detail={hasAgent ? (agentOnline ? "READY" : "UNAVAILABLE") : "—"}
        state={!hasAgent ? "idle" : agentOnline ? "ok" : "error"}
      />
    </div>
  );
}
