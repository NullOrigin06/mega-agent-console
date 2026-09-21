import { useState } from "react";
import { pairAgent } from "../../api";
import type { PairedAgentInfo } from "../../types/engineering";
import {
  IconCheckCircle,
  IconAlertTriangle,
  IconLoader,
  IconDownload,
  IconRefresh,
  IconPlus,
} from "../common/Icon";

const AGENT_INSTALLER_URL = "/downloads/MegaLocalAgent_Setup.exe";

interface AgentPairingPanelProps {
  agents: PairedAgentInfo[];
  selectedAgentId?: string | null;
  onSelectAgent?: (agentId: string) => void;
  onRefreshAgents: () => Promise<void> | void;
  isRefreshing?: boolean;
}

export function AgentPairingPanel({
  agents,
  selectedAgentId,
  onSelectAgent,
  onRefreshAgents,
  isRefreshing = false,
}: AgentPairingPanelProps) {
  const [codeInput, setCodeInput] = useState("");
  const [isPairing, setIsPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handlePair = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const trimmed = codeInput.trim();
    if (!trimmed) {
      setError("Enter the 6-digit pairing code shown in your Mega Local Agent app.");
      return;
    }

    setIsPairing(true);
    try {
      const newAgent = await pairAgent(trimmed);
      setCodeInput("");
      setSuccessMessage(`Workstation ${newAgent.name || newAgent.agentId} connected successfully.`);
      await onRefreshAgents();
      if (onSelectAgent && newAgent.online) {
        onSelectAgent(newAgent.agentId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not pair agent.");
    } finally {
      setIsPairing(false);
    }
  };

  return (
    <div className="agent-pairing-panel">
      <div className="agent-pairing-header">
        <div>
          <h4 className="agent-roster-title">Connected Local Agents</h4>
          <p className="agent-pairing-hint">
            Drawings generate on <strong>your own workstation</strong> using local GstarCAD/AutoCAD.
            Each engineer can link one or more machines to their account.
          </p>
        </div>
        <div className="agent-pairing-header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={onRefreshAgents}
            disabled={isRefreshing}
            title="Refresh agents status"
          >
            <IconRefresh size={14} className={isRefreshing ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
          <a
            href={AGENT_INSTALLER_URL}
            className="btn btn-secondary btn-icon"
            download
            title="Download Mega Local Agent Installer"
          >
            <IconDownload size={14} />
            <span>Download Agent</span>
          </a>
        </div>
      </div>

      {/* Roster of Paired Agents */}
      <div className="agent-roster-list">
        {agents.length === 0 ? (
          <div className="agent-roster-empty">
            <p>No Local Agents connected to your account yet.</p>
            <span className="agent-roster-empty-hint">
              Install the Mega Local Agent app on your PC, start it, and enter the code below.
            </span>
          </div>
        ) : (
          <div className="agent-grid">
            {agents.map((agent) => {
              const isSelected = selectedAgentId === agent.agentId;
              return (
                <div
                  key={agent.agentId}
                  className={`agent-card ${agent.online ? "agent-card-online" : "agent-card-offline"} ${isSelected ? "agent-card-selected" : ""}`}
                  onClick={() => agent.online && onSelectAgent?.(agent.agentId)}
                  role={agent.online && onSelectAgent ? "button" : undefined}
                  tabIndex={agent.online && onSelectAgent ? 0 : undefined}
                >
                  <div className="agent-card-header">
                    <span className="agent-card-name">{agent.name || "Workstation"}</span>
                    {agent.online ? (
                      <span className="badge badge-status badge-completed">
                        <IconCheckCircle size={12} />
                        <span>Online</span>
                      </span>
                    ) : (
                      <span className="badge badge-status badge-failed">
                        <IconAlertTriangle size={12} />
                        <span>Offline</span>
                      </span>
                    )}
                  </div>
                  <div className="agent-card-details">
                    <span className="agent-card-id text-mono">{agent.agentId}</span>
                    <span className="agent-card-date">
                      Linked {new Date(agent.pairedAt).toLocaleDateString()}
                    </span>
                  </div>
                  {isSelected && (
                    <div className="agent-selected-badge">
                      <span>Target Workstation</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Connect New Agent Form */}
      <div className="agent-connect-section">
        <h5 className="agent-connect-title">Connect Another Local Agent</h5>
        {error && (
          <div className="alert-banner alert-banner-danger" role="alert">
            <IconAlertTriangle size={14} />
            <span>{error}</span>
          </div>
        )}
        {successMessage && (
          <div className="alert-banner alert-banner-success" role="alert">
            <IconCheckCircle size={14} />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handlePair} className="agent-pairing-form">
          <div className="agent-pairing-form-row">
            <input
              type="text"
              className="form-input text-mono"
              placeholder="e.g. 482-913"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              disabled={isPairing}
            />
            <button type="submit" className="btn btn-primary" disabled={isPairing}>
              {isPairing ? (
                <>
                  <IconLoader size={15} className="animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <IconPlus size={15} />
                  <span>Connect Agent</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
