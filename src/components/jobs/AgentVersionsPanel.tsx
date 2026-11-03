import { useEffect, useState } from "react";
import {
  fetchAgentReleases,
  latestRelease,
  releaseHighlights,
  type AgentRelease,
} from "../../utils/agentReleases";
import { IconCheckCircle } from "../common/Icon";

/**
 * The released Local Agent versions and what each one does. Only the newest can be downloaded (the Download Agent button
 * always serves it); the older ones are listed for information so an engineer can see what an older agent cannot do.
 */
export function AgentVersionsPanel() {
  const [releases, setReleases] = useState<AgentRelease[] | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchAgentReleases().then((r) => alive && setReleases(r));
    return () => {
      alive = false;
    };
  }, []);

  if (!releases || releases.length === 0) return null;
  const latest = latestRelease(releases)!;
  const older = releases.filter((r) => r.version !== latest.version);

  return (
    <div className="agent-versions">
      <div className="agent-versions-latest">
        <div className="agent-versions-latest-head">
          <h5 className="agent-connect-title">Latest Local Agent</h5>
          <span className="badge badge-status badge-completed">
            <IconCheckCircle size={12} />
            <span>v{latest.version}</span>
          </span>
          {latest.date && <span className="agent-card-date">Released {new Date(latest.date).toLocaleDateString()}</span>}
        </div>
        <ul className="agent-versions-list">
          {releaseHighlights(latest.notes).map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="agent-pairing-hint">Download Agent always gives this version. Agents update themselves when they restart.</p>
      </div>

      {older.length > 0 && (
        <details className="agent-versions-history">
          <summary>Earlier versions ({older.length}) and what they do</summary>
          <ul className="agent-versions-history-list">
            {older.map((r) => (
              <li key={r.version}>
                <strong className="text-mono">v{r.version}</strong>
                {r.date && <span className="agent-card-date"> {new Date(r.date).toLocaleDateString()}</span>}
                <ul className="agent-versions-list">
                  {releaseHighlights(r.notes).map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
