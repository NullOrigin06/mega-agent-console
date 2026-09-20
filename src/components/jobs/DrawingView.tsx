import { useState } from "react";
import {
  IconAlertTriangle,
  IconDrafting,
  IconCheckCircle,
  IconLoader,
} from "../common/Icon";
import type { DrawingStatus } from "../../types/engineering";
import { AgentPairingPanel } from "./AgentPairingPanel";
import type { PairedAgent } from "../../utils/agentPairing";

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
  const [pairedAgent, setPairedAgent] = useState<PairedAgent | null>(null);
  const canGenerate = Boolean(pairedAgent);

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
              GstarCAD — not on the server. Pair your Mega Local Agent below before generating.
            </p>
          </div>
        </div>

        <div className="drawing-actions">
          {drawingStatus === "generated" ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onGenerate(pairedAgent?.agentId)}
              disabled={isGenerating || !canGenerate}
              title={canGenerate ? undefined : "Pair a Local Agent below first"}
            >
              <IconDrafting size={16} />
              <span>Generate Again</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onGenerate(pairedAgent?.agentId)}
              disabled={isGenerating || !canGenerate}
              title={canGenerate ? undefined : "Pair a Local Agent below first"}
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

      <AgentPairingPanel onPairedAgentChange={setPairedAgent} />

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

      {/* Blueprint Schematic Section with PROMINENT Mockup Label */}
      <div className="blueprint-preview-container">
        {/* Prominent Mockup Disclaimer */}
        <div className="mockup-disclaimer-banner">
          <IconAlertTriangle size={16} className="text-amber" />
          <div className="disclaimer-text">
            <strong>ILLUSTRATIVE PLACEHOLDER MOCKUP — NOT REAL COMPUTED GEOMETRY</strong>
            <p>
              The drawing below is a visual placeholder demonstrating the
              console's layout. It does not represent real calculated
              geometry for Shell ID {shellId} — the real drawing, once
              generated, opens directly in GstarCAD/AutoCAD, not here.
            </p>
          </div>
        </div>

        {/* Technical Blueprint SVG */}
        <div className="blueprint-canvas-wrapper">
          <div className="blueprint-grid-overlay" />
          <svg
            className="blueprint-svg"
            viewBox="0 0 900 460"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Grid & Centerlines */}
            <line x1="40" y1="230" x2="860" y2="230" stroke="#3b82f6" strokeWidth="0.8" strokeDasharray="16 4 4 4" opacity="0.6" />
            <line x1="450" y1="30" x2="450" y2="430" stroke="#3b82f6" strokeWidth="0.8" strokeDasharray="16 4 4 4" opacity="0.4" />

            {/* Front Bonnet (Dish End + Shell) */}
            <path
              d="M 120 140 C 90 140 70 170 70 230 C 70 290 90 320 120 320 L 170 320 L 170 140 Z"
              stroke="#60a5fa"
              strokeWidth="2"
              fill="#1e3a8a"
              fillOpacity="0.2"
            />
            {/* Body Flange Front */}
            <rect x="170" y="125" width="22" height="210" rx="2" stroke="#93c5fd" strokeWidth="1.5" fill="#1e293b" />
            <rect x="194" y="120" width="24" height="220" rx="2" stroke="#93c5fd" strokeWidth="1.5" fill="#1e293b" />

            {/* Main Shell Body */}
            <rect x="220" y="140" width="460" height="180" stroke="#60a5fa" strokeWidth="2" fill="#0f172a" fillOpacity="0.6" />

            {/* Tube Bundle Tubes (Illustrative Array) */}
            <g stroke="#38bdf8" strokeWidth="1" opacity="0.5">
              <line x1="222" y1="165" x2="678" y2="165" strokeDasharray="6 3" />
              <line x1="222" y1="185" x2="678" y2="185" strokeDasharray="6 3" />
              <line x1="222" y1="205" x2="678" y2="205" strokeDasharray="6 3" />
              <line x1="222" y1="225" x2="678" y2="225" strokeDasharray="6 3" />
              <line x1="222" y1="235" x2="678" y2="235" strokeDasharray="6 3" />
              <line x1="222" y1="255" x2="678" y2="255" strokeDasharray="6 3" />
              <line x1="222" y1="275" x2="678" y2="275" strokeDasharray="6 3" />
              <line x1="222" y1="295" x2="678" y2="295" strokeDasharray="6 3" />
            </g>

            {/* Baffles */}
            <line x1="290" y1="140" x2="290" y2="280" stroke="#f59e0b" strokeWidth="2.5" />
            <line x1="360" y1="180" x2="360" y2="320" stroke="#f59e0b" strokeWidth="2.5" />
            <line x1="430" y1="140" x2="430" y2="280" stroke="#f59e0b" strokeWidth="2.5" />
            <line x1="500" y1="180" x2="500" y2="320" stroke="#f59e0b" strokeWidth="2.5" />
            <line x1="570" y1="140" x2="570" y2="280" stroke="#f59e0b" strokeWidth="2.5" />
            <line x1="640" y1="180" x2="640" y2="320" stroke="#f59e0b" strokeWidth="2.5" />

            {/* Body Flange Rear */}
            <rect x="682" y="120" width="24" height="220" rx="2" stroke="#93c5fd" strokeWidth="1.5" fill="#1e293b" />
            <rect x="708" y="125" width="22" height="210" rx="2" stroke="#93c5fd" strokeWidth="1.5" fill="#1e293b" />

            {/* Rear Bonnet (Dish End + Shell) */}
            <path
              d="M 732 140 L 782 140 C 812 140 832 170 832 230 C 832 290 812 320 782 320 L 732 320 Z"
              stroke="#60a5fa"
              strokeWidth="2"
              fill="#1e3a8a"
              fillOpacity="0.2"
            />

            {/* Nozzle N1 (Top Inlet) */}
            <rect x="270" y="80" width="50" height="60" stroke="#38bdf8" strokeWidth="2" fill="#1e293b" />
            <rect x="260" y="70" width="70" height="12" rx="2" stroke="#38bdf8" strokeWidth="2" fill="#0f172a" />
            <line x1="295" y1="50" x2="295" y2="80" stroke="#38bdf8" strokeWidth="1" strokeDasharray="3 3" />
            <text x="295" y="45" fill="#38bdf8" fontSize="11" fontFamily="monospace" textAnchor="middle">
              N1: INLET (100 NB)
            </text>

            {/* Nozzle N2 (Top Outlet) */}
            <rect x="580" y="80" width="50" height="60" stroke="#38bdf8" strokeWidth="2" fill="#1e293b" />
            <rect x="570" y="70" width="70" height="12" rx="2" stroke="#38bdf8" strokeWidth="2" fill="#0f172a" />
            <line x1="605" y1="50" x2="605" y2="80" stroke="#38bdf8" strokeWidth="1" strokeDasharray="3 3" />
            <text x="605" y="45" fill="#38bdf8" fontSize="11" fontFamily="monospace" textAnchor="middle">
              N2: OUTLET (100 NB)
            </text>

            {/* Dimension Indicators */}
            <g stroke="#94a3b8" strokeWidth="1">
              <line x1="220" y1="360" x2="680" y2="360" markerEnd="url(#arrow)" />
              <line x1="220" y1="340" x2="220" y2="370" />
              <line x1="680" y1="340" x2="680" y2="370" />
              <text x="450" y="375" fill="#cbd5e1" fontSize="11" fontFamily="monospace" textAnchor="middle">
                TUBE LENGTH: 3000 mm NOMINAL
              </text>

              {/* Vertical Dimension (Shell ID) */}
              <line x1="45" y1="140" x2="45" y2="320" />
              <line x1="35" y1="140" x2="55" y2="140" />
              <line x1="35" y1="320" x2="55" y2="320" />
              <text x="35" y="235" fill="#cbd5e1" fontSize="11" fontFamily="monospace" textAnchor="end">
                ID {shellId} mm
              </text>
            </g>

            {/* Engineering Drawing Title Block */}
            <g transform="translate(560, 390)">
              <rect x="0" y="0" width="310" height="55" fill="#0f172a" stroke="#475569" strokeWidth="1.5" />
              <line x1="0" y1="20" x2="310" y2="20" stroke="#475569" strokeWidth="1" />
              <line x1="160" y1="20" x2="160" y2="55" stroke="#475569" strokeWidth="1" />
              <text x="10" y="14" fill="#38bdf8" fontSize="10" fontWeight="bold" fontFamily="sans-serif">
                MEGA EPC ENGINEERING SUITE • CAD AUTOMATION
              </text>
              <text x="10" y="34" fill="#f8fafc" fontSize="9" fontFamily="sans-serif">
                MODULE: {module}
              </text>
              <text x="10" y="47" fill="#94a3b8" fontSize="8" fontFamily="monospace">
                JOB ID: {jobId}
              </text>
              <text x="170" y="34" fill="#f8fafc" fontSize="9" fontFamily="monospace">
                DWG NO: MEGA-GA-{shellId}
              </text>
              <text x="170" y="47" fill="#f59e0b" fontSize="8" fontFamily="monospace">
                MOCKUP PREVIEW (N.T.S.)
              </text>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
