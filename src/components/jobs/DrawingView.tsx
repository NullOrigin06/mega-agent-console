import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  IconAlertTriangle,
  IconDrafting,
  IconCheckCircle,
  IconLoader,
} from "../common/Icon";
import type { DrawingStatus } from "../../types/engineering";
import { listAgents } from "../../api";
import { AgentPairingPanel } from "./AgentPairingPanel";

interface DrawingViewProps {
  drawingStatus: DrawingStatus;
  drawingError?: string;
  jobId: string;
  module: string;
  shellId: number;
  onGenerate: (agentId?: string) => void;
  isTriggering: boolean;
}

export function DrawingView({
  drawingStatus,
  drawingError,
  jobId,
  module,
  shellId,
  onGenerate,
  isTriggering,
}: DrawingViewProps) {
  const isGenerating = isTriggering || drawingStatus === "generating";
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const {
    data: agents = [],
    isFetching: isFetchingAgents,
    refetch,
  } = useQuery({
    queryKey: ["agents"],
    queryFn: listAgents,
    // A freshly started agent (or one that just went offline) should show
    // up here on its own - nobody should have to know to press Refresh.
    refetchInterval: 5000,
  });

  const loadAgents = async () => {
    await refetch();
  };

  const onlineAgents = agents.filter((a) => a.online);
  const activeAgentId =
    selectedAgentId && onlineAgents.some((a) => a.agentId === selectedAgentId)
      ? selectedAgentId
      : onlineAgents[0]?.agentId ?? null;

  const canGenerate = Boolean(activeAgentId);



  return (
    <div className="drawing-view">
      {/* CAD Generation Status & Action */}
      <div className="drawing-status-card">
        <div className="drawing-status-main">
          <div className="drawing-icon-badge">
            <IconDrafting size={28} className="text-accent" />
          </div>
          <div className="drawing-info">
            <div className="drawing-title-row">
              <h3 className="drawing-filename text-mono">{jobId}</h3>
              {drawingStatus === "generated" && (
                <span className="badge badge-status badge-completed">
                  <IconCheckCircle size={14} />
                  <span>Drawing Generated</span>
                </span>
              )}
              {isGenerating && (
                <span className="badge badge-status badge-running">
                  <IconLoader size={14} className="animate-spin" />
                  <span>Generating...</span>
                </span>
              )}
              {drawingStatus === "failed" && (
                <span className="badge badge-status badge-failed">
                  <IconAlertTriangle size={14} />
                  <span>Generation Failed</span>
                </span>
              )}
              {drawingStatus === "not_generated" && !isGenerating && (
                <span className="badge badge-status badge-queued">
                  <span>Not Generated Yet</span>
                </span>
              )}
            </div>
            <p className="drawing-meta-text">
              Target Module: <strong>{module}</strong> • Nominal Shell ID:{" "}
              <strong>{shellId} mm</strong> • Engine: GstarCAD/AutoCAD Automation
            </p>
            <p className="drawing-meta-text">
              Generation runs on <strong>your own paired machine</strong>, using your own
              GstarCAD — not on the server. Select your target workstation below.
            </p>
          </div>
        </div>

        <div className="drawing-actions">
          {onlineAgents.length > 1 && (
            <div className="workstation-picker-container">
              <span className="workstation-picker-label">CAD Machine:</span>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="workstation-single-tag workstation-dropdown-trigger"
                    disabled={isGenerating}
                  >
                    <span className="workstation-tag-name text-mono">
                      {onlineAgents.find((a) => a.agentId === activeAgentId)?.name || activeAgentId}
                    </span>
                    <span className="workstation-dropdown-caret" aria-hidden>▾</span>
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="workstation-dropdown-content" align="end" sideOffset={6}>
                    {onlineAgents.map((a) => (
                      <DropdownMenu.Item
                        key={a.agentId}
                        className="workstation-dropdown-item"
                        onSelect={() => setSelectedAgentId(a.agentId)}
                      >
                        <IconCheckCircle size={12} className="text-success" />
                        <span>{a.name || a.agentId}</span>
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          )}

          {onlineAgents.length === 1 && (
            <div className="workstation-single-tag" title={`Agent ID: ${onlineAgents[0].agentId}`}>
              <span className="workstation-tag-label">Target:</span>
              <span className="workstation-tag-name text-mono">
                {onlineAgents[0].name || onlineAgents[0].agentId}
              </span>
              <span className="badge badge-status badge-completed">
                <IconCheckCircle size={10} />
                <span>Online</span>
              </span>
            </div>
          )}

          {onlineAgents.length === 0 && (
            <div className="workstation-offline-notice">
              <IconAlertTriangle size={14} className="text-amber" />
              <span>No online CAD agent</span>
            </div>
          )}

          {drawingStatus === "generated" ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onGenerate(activeAgentId || undefined)}
              disabled={isGenerating || !canGenerate}
              title={canGenerate ? undefined : "Connect or start an online Local Agent below first"}
            >
              <IconDrafting size={16} />
              <span>Generate Again</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onGenerate(activeAgentId || undefined)}
              disabled={isGenerating || !canGenerate}
              title={canGenerate ? undefined : "Connect or start an online Local Agent below first"}
            >
              {isGenerating ? (
                <>
                  <IconLoader size={16} className="animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <IconDrafting size={16} />
                  <span>
                    {drawingStatus === "failed" ? "Retry Generation" : "Generate Drawing"}
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <AgentPairingPanel
        agents={agents}
        selectedAgentId={activeAgentId}
        onSelectAgent={setSelectedAgentId}
        onRefreshAgents={loadAgents}
        isRefreshing={isFetchingAgents}
      />



      {isGenerating && (
        <div className="alert-banner alert-banner-info">
          <IconLoader size={16} className="animate-spin" />
          <span>
            CAD synthesis in progress on your paired agent's machine — a real
            GstarCAD/AutoCAD window should open there shortly. This can take over a
            minute depending on the module; the status here will update
            automatically once it finishes.
          </span>
        </div>
      )}

      {drawingStatus === "generated" && !isGenerating && (
        <div className="alert-banner alert-banner-success">
          <IconCheckCircle size={16} />
          <span>
            Drawing generated successfully. Check GstarCAD/AutoCAD on your
            paired agent's machine — the drawing was opened and left active for review.
          </span>
        </div>
      )}

      {drawingStatus === "failed" && drawingError && !isGenerating && (
        <div className="alert-banner alert-banner-danger" role="alert">
          <IconAlertTriangle size={16} />
          <span>
            Drawing generation failed: <code>{drawingError}</code>
          </span>
        </div>
      )}

    </div>
  );
}
