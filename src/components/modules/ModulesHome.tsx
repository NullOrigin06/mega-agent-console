import { Suspense, lazy, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { JobSummary, ModuleKind } from "../../types/engineering";
import { MODULE_OPTIONS, type ModuleOption } from "../../constants/modules";
import { MODULE_COLORS, MODULE_SHORT_NAMES } from "../../constants/moduleColors";
import { getJob } from "../../api";
import { IconArrowRight, IconDrafting, IconLoader } from "../common/Icon";
import { CadHeatExchangerPreview } from "../cad/CadHeatExchangerPreview";
import { TYPICAL_VESSEL, vesselSpecFromJob } from "../cad/vesselSpec";
import { DurationTrendChart } from "./DurationTrendChart";

// The 3D viewport pulls in three.js + react-three-fiber (a genuinely heavy
// dependency) - lazy-loaded so it's only fetched once someone actually asks
// to see it, not on every Command Center visit.
const VesselViewport3D = lazy(() =>
  import("../cad/VesselViewport3D").then((m) => ({ default: m.VesselViewport3D }))
);

interface ModulesHomeProps {
  onSelectModule: (module: ModuleKind) => void;
  jobs?: JobSummary[];
}

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function latestJobFor(jobs: JobSummary[], kind: ModuleKind): JobSummary | undefined {
  return jobs
    .filter((j) => j.module === kind)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

/**
 * Landing page mirroring the desktop suite's Form2 ("Structure Selection")
 * - pick a module first, then land on that module's own full workspace page
 * (ModuleWorkspace), rather than a generic job-submission modal.
 *
 * Laid out as an asymmetric bento: whichever module has a job running (or,
 * failing that, the most recently touched one) is the hero tile, so the
 * layout reflects actual activity instead of giving all three equal weight.
 */
export function ModulesHome({ onSelectModule, jobs = [] }: ModulesHomeProps) {
  const [showVessel, setShowVessel] = useState(false);

  // The twin is modelled on the newest completed Heat Exchanger Fab run -
  // the only module whose job carries the whole vessel's dimensions.
  const twinSource = jobs
    .filter((j) => j.module === "HeatExchangerFab" && j.status === "completed")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const { data: twinJob } = useQuery({
    queryKey: ["vessel-twin-job", twinSource?.id],
    queryFn: () => getJob(twinSource!.id),
    enabled: Boolean(twinSource),
    staleTime: 5 * 60_000,
  });
  const vesselSpec = (twinJob && vesselSpecFromJob(twinJob)) || TYPICAL_VESSEL;
  const withActivity = MODULE_OPTIONS.map((mod) => {
    const latest = latestJobFor(jobs, mod.kind);
    const isRunning = latest?.status === "running" || latest?.status === "queued";
    return { mod, latest, isRunning };
  });

  const heroIndex = (() => {
    const runningIdx = withActivity.findIndex((m) => m.isRunning);
    if (runningIdx !== -1) return runningIdx;
    let bestIdx = 0;
    let bestTime = -Infinity;
    withActivity.forEach((m, i) => {
      const t = m.latest ? new Date(m.latest.createdAt).getTime() : -Infinity;
      if (t > bestTime) {
        bestTime = t;
        bestIdx = i;
      }
    });
    return bestIdx;
  })();

  const hero = withActivity[heroIndex];
  const secondary = withActivity.filter((_, i) => i !== heroIndex);

  return (
    <div className="modules-home">
      <div className="modules-home-header">
        <h1 className="modules-home-title">Engineering Modules</h1>
        <p className="modules-home-subtitle">
          Choose a module to size, calculate, review, and generate a drawing
          - all in one place, just like the desktop suite's Form3.
        </p>
      </div>

      <div className="vessel-panel">
        {showVessel ? (
          <Suspense
            fallback={
              <div className="vessel-panel-loading">
                <IconLoader size={24} className="animate-spin text-accent" />
                <span>Loading 3D viewport...</span>
              </div>
            }
          >
            <VesselViewport3D spec={vesselSpec} onSelectModule={onSelectModule} onClose={() => setShowVessel(false)} />
          </Suspense>
        ) : (
          <button type="button" className="vessel-teaser" onClick={() => setShowVessel(true)}>
            <div className="vessel-teaser-text">
              <span className="vessel-teaser-eyebrow">
                <IconDrafting size={14} />
                Interactive 3D
              </span>
              <span className="vessel-teaser-title">Digital twin of your heat exchanger</span>
              <span className="vessel-teaser-source">
                {vesselSpec.jobId
                  ? `Built to scale from ${vesselSpec.jobId} · Shell Ø${vesselSpec.shellId} mm · ${vesselSpec.tubeQty} tubes · ${vesselSpec.baffleQty} baffles`
                  : "Typical proportions until you complete a Heat Exchanger Fab run"}
              </span>
              <span className="vessel-teaser-modules">
                {MODULE_OPTIONS.map((m) => (
                  <span key={m.kind}>
                    <span className="vessel-tip-swatch" style={{ background: MODULE_COLORS[m.kind] }} />
                    {MODULE_SHORT_NAMES[m.kind]}
                  </span>
                ))}
              </span>
              <span className="vessel-teaser-cta">
                Open 3D view <IconArrowRight size={14} />
              </span>
            </div>
            <div className="vessel-teaser-art" aria-hidden="true">
              <CadHeatExchangerPreview size={150} />
            </div>
          </button>
        )}
      </div>

      <div className="modules-bento-grid">
        <ModuleTile
          entry={hero}
          hero
          onSelect={() => onSelectModule(hero.mod.kind)}
        />
        <div className="modules-bento-secondary-col">
          {secondary.map((entry) => (
            <ModuleTile
              key={entry.mod.kind}
              entry={entry}
              onSelect={() => onSelectModule(entry.mod.kind)}
            />
          ))}
        </div>
      </div>

      <DurationTrendChart jobs={jobs} />
    </div>
  );
}

function ModuleTile({
  entry,
  hero = false,
  onSelect,
}: {
  entry: { mod: ModuleOption; latest?: JobSummary; isRunning: boolean };
  hero?: boolean;
  onSelect: () => void;
}) {
  const { mod, latest, isRunning } = entry;
  const Preview = mod.preview;

  return (
    <button
      type="button"
      className={`module-home-card ${hero ? "module-bento-hero" : "module-bento-secondary"}`}
      onClick={onSelect}
    >
      <div className="module-home-card-glow" aria-hidden="true" />
      <div className="module-home-card-top">
        <div className={`module-home-card-icon ${isRunning ? "module-home-card-icon-active" : ""}`}>
          <Preview size={hero ? 64 : 40} />
        </div>
        <div className="module-card-badge-cluster">
          {isRunning && (
            <span className="module-card-live-dot" title="Job in progress" />
          )}
          <span className="module-card-badge">{mod.badge}</span>
        </div>
      </div>
      <h2 className="module-home-card-title">{mod.title}</h2>
      {hero && <p className="module-home-card-desc">{mod.description}</p>}

      <div className="module-card-stat-row">
        {latest ? (
          <span className="module-card-stat text-mono">
            {isRunning ? "Running" : "Last run"} · Shell Ø{latest.shellId}mm ·{" "}
            {timeAgo(latest.createdAt)}
          </span>
        ) : (
          <span className="module-card-stat module-card-stat-empty">No runs yet</span>
        )}
      </div>

      <div className="module-home-card-cta">
        <span>Open Module</span>
        <IconArrowRight size={16} />
      </div>
    </button>
  );
}
