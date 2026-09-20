import { useEffect, useState } from "react";
import { checkAgentByCode } from "../../api";
import {
  getPairedAgent,
  setPairedAgent,
  clearPairedAgent,
  type PairedAgent,
} from "../../utils/agentPairing";
import { IconCheckCircle, IconAlertTriangle, IconLoader, IconDownload } from "../common/Icon";

/**
 * Served from mega-agent-api's wwwroot (same origin as this console — see
 * DrawingView.tsx/JobList.tsx history for why cross-origin links to the
 * tunnel got silently ad-blocked). Not versioned in the URL: whoever deploys
 * a new build copies the freshly-built installer over this same filename in
 * wwwroot/downloads/, so this link never needs a code change to pick up a
 * new version.
 */
const AGENT_INSTALLER_URL = "/downloads/MegaLocalAgent_Setup.exe";

interface AgentPairingPanelProps {
  /** Fires whenever the paired agent changes (paired, unpaired, or online status refreshed). */
  onPairedAgentChange: (agent: PairedAgent | null) => void;
}

/**
 * Lets a user pair this browser to their own Local Agent (device-code
 * pairing, like a Chromecast — see utils/agentPairing.ts and
 * mega-agent-api's AgentRegistry.cs). Once paired, "Generate Drawing" runs
 * on THIS agent's own machine, not on whatever machine hosts the API.
 */
export function AgentPairingPanel({ onPairedAgentChange }: AgentPairingPanelProps) {
  const [paired, setPaired] = useState<PairedAgent | null>(null);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const existing = getPairedAgent();
    setPaired(existing);
    onPairedAgentChange(existing);
    if (existing) {
      refreshOnlineStatus(existing);
    }
    // Only run once on mount — pairing changes happen via handlePair/handleUnpair below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshOnlineStatus = async (agent: PairedAgent) => {
    try {
      const status = await checkAgentByCode(agent.pairingCode);
      setIsOnline(status.isOnline);
    } catch {
      setIsOnline(false);
    }
  };

  const handlePair = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = codeInput.trim();
    if (!trimmed) {
      setError("Enter the pairing code shown in your Mega Local Agent window.");
      return;
    }

    setIsChecking(true);
    try {
      const status = await checkAgentByCode(trimmed);
      const agent: PairedAgent = {
        agentId: status.agentId,
        pairingCode: trimmed,
        pairedAt: new Date().toISOString(),
      };
      setPairedAgent(agent);
      setPaired(agent);
      setIsOnline(status.isOnline);
      onPairedAgentChange(agent);
      setCodeInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify that pairing code.");
    } finally {
      setIsChecking(false);
    }
  };

  const handleUnpair = () => {
    clearPairedAgent();
    setPaired(null);
    setIsOnline(null);
    onPairedAgentChange(null);
  };

  if (paired) {
    return (
      <div className="agent-pairing-panel agent-pairing-connected">
        <div className="agent-pairing-status-row">
          {isOnline ? (
            <span className="badge badge-status badge-completed">
              <IconCheckCircle size={14} />
              <span>Agent Connected</span>
            </span>
          ) : isOnline === false ? (
            <span className="badge badge-status badge-failed">
              <IconAlertTriangle size={14} />
              <span>Agent Offline</span>
            </span>
          ) : (
            <span className="badge badge-status badge-queued">
              <IconLoader size={14} className="animate-spin" />
              <span>Checking...</span>
            </span>
          )}
          <span className="agent-pairing-code text-mono">{paired.pairingCode}</span>
          <button type="button" className="btn-link" onClick={() => refreshOnlineStatus(paired)}>
            Refresh
          </button>
          <button type="button" className="btn-link" onClick={handleUnpair}>
            Unpair
          </button>
        </div>
        {isOnline === false && (
          <p className="agent-pairing-hint">
            This agent hasn't checked in recently — make sure the Mega Local Agent app is
            running on your machine before generating a drawing.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="agent-pairing-panel">
      <p className="agent-pairing-hint">
        Generating a drawing runs on <strong>your own machine</strong>, using your own
        GstarCAD — not on the server. Install the Mega Local Agent app on your PC, run it,
        then enter the pairing code it shows below.
      </p>
      <a
        href={AGENT_INSTALLER_URL}
        className="btn btn-secondary"
        style={{ marginBottom: "12px", display: "inline-flex" }}
        download
      >
        <IconDownload size={16} />
        <span>Download Mega Local Agent</span>
      </a>
      <form onSubmit={handlePair} className="agent-pairing-form">
        {error && (
          <div className="alert-banner alert-banner-danger" role="alert">
            <span>{error}</span>
          </div>
        )}
        <div className="agent-pairing-form-row">
          <input
            type="text"
            className="form-input text-mono"
            placeholder="e.g. 482-913"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            disabled={isChecking}
          />
          <button type="submit" className="btn btn-primary" disabled={isChecking}>
            {isChecking ? (
              <>
                <IconLoader size={16} className="animate-spin" />
                <span>Connecting...</span>
              </>
            ) : (
              <span>Connect Agent</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
