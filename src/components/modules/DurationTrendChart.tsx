import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { JobSummary, ModuleKind } from "../../types/engineering";
import { MODULE_COLORS, MODULE_SHORT_NAMES } from "../../constants/moduleColors";
import { MODULE_OPTIONS } from "../../constants/modules";

const MAX_RUNS = 20;

interface Run {
  id: string;
  module: ModuleKind;
  shellId: number;
  seconds: number;
  finishedAt: Date;
  tick: string;
}

function formatDuration(seconds: number): string {
  if (seconds < 1) return `${Math.max(1, Math.round(seconds * 1000))} ms`;
  if (seconds < 10) return `${seconds.toFixed(1)} s`;
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

const TICK_STEPS = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

/** Round-number axis ticks (at most 5 intervals) and a compact label for each. */
function axisTicks(max: number): { ticks: number[]; label: (v: number) => string } {
  const step = TICK_STEPS.find((s) => max / s <= 5) ?? 3600;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Number(v.toFixed(2)));
  const label = (v: number) => {
    if (v === 0) return "0";
    if (step >= 60) return `${+(v / 60).toFixed(1)} min`;
    return `${+v.toFixed(2)} s`;
  };
  return { ticks, label };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const fullFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** The most recent completed runs, oldest first, with their real durations. */
function completedRuns(jobs: JobSummary[]): Run[] {
  const runs = jobs
    .filter((j) => j.status === "completed" && j.completedAt)
    .map((j) => {
      const finishedAt = new Date(j.completedAt!);
      return {
        id: j.id,
        module: j.module,
        shellId: j.shellId,
        seconds: (finishedAt.getTime() - new Date(j.createdAt).getTime()) / 1000,
        finishedAt,
      };
    })
    .filter((r) => r.seconds > 0 && Number.isFinite(r.seconds))
    .sort((a, b) => a.finishedAt.getTime() - b.finishedAt.getTime())
    .slice(-MAX_RUNS);

  // Time-of-day ticks when every run is from one day; dates otherwise.
  const oneDay = runs.length > 0 && runs.every((r) => r.finishedAt.toDateString() === runs[0].finishedAt.toDateString());
  return runs.map((r) => ({ ...r, tick: oneDay ? timeFmt.format(r.finishedAt) : dayFmt.format(r.finishedAt) }));
}

function RunTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) {
  if (!active || !payload?.length) return null;
  const run = payload[0].payload as Run;
  return (
    <div className="run-chart-tooltip">
      <div className="run-chart-tooltip-head">
        <span className="run-chart-swatch" style={{ background: MODULE_COLORS[run.module] }} />
        <span>{MODULE_SHORT_NAMES[run.module]}</span>
        <span className="run-chart-tooltip-id text-mono">{run.id}</span>
      </div>
      <div className="run-chart-tooltip-value">{formatDuration(run.seconds)}</div>
      <div className="run-chart-tooltip-meta">
        Shell Ø{run.shellId} mm · finished {fullFmt.format(run.finishedAt)}
      </div>
    </div>
  );
}

/**
 * How long recent engineering runs took, one column per run (each run is an
 * independent event - a connecting line would invent a trend between
 * them), on a zero baseline so heights compare honestly. Coloured by module,
 * with a median reference, summary figures, and a table view.
 */
export function DurationTrendChart({ jobs }: { jobs: JobSummary[] }) {
  const runs = useMemo(() => completedRuns(jobs), [jobs]);
  const [view, setView] = useState<"chart" | "table">("chart");

  if (runs.length === 0) return null;

  const seconds = runs.map((r) => r.seconds);
  const med = median(seconds);
  const fastest = runs.reduce((a, b) => (b.seconds < a.seconds ? b : a));
  const slowest = runs.reduce((a, b) => (b.seconds > a.seconds ? b : a));
  const modulesPresent = MODULE_OPTIONS.map((m) => m.kind).filter((k) => runs.some((r) => r.module === k));
  const showChart = runs.length >= 2;
  const axis = axisTicks(Math.max(...seconds));

  return (
    <section className="run-chart-card" aria-labelledby="run-chart-title">
      <header className="run-chart-header">
        <div>
          <h2 id="run-chart-title" className="run-chart-title">Run time</h2>
          <p className="run-chart-subtitle">
            Submit to completion, last {runs.length} completed {runs.length === 1 ? "run" : "runs"}
          </p>
        </div>
        {showChart && (
          <div className="run-chart-toggle" role="group" aria-label="View">
            {(["chart", "table"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={view === v ? "active" : ""}
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {v === "chart" ? "Chart" : "Table"}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="run-chart-stats">
        <Stat label="Median" value={formatDuration(med)} />
        <Stat label="Fastest" value={formatDuration(fastest.seconds)} detail={MODULE_SHORT_NAMES[fastest.module]} />
        <Stat label="Slowest" value={formatDuration(slowest.seconds)} detail={MODULE_SHORT_NAMES[slowest.module]} />
        <Stat label="Runs" value={String(runs.length)} detail={runs.length >= MAX_RUNS ? `latest ${MAX_RUNS}` : undefined} />
      </div>

      {showChart && view === "chart" && (
        <>
          <ul className="run-chart-legend" aria-label="Modules">
            {modulesPresent.map((k) => (
              <li key={k}>
                <span className="run-chart-swatch" style={{ background: MODULE_COLORS[k] }} />
                {MODULE_SHORT_NAMES[k]}
              </li>
            ))}
          </ul>
          <div
            className="run-chart-plot"
            role="img"
            aria-label={`Run times for the last ${runs.length} runs: median ${formatDuration(med)}, fastest ${formatDuration(fastest.seconds)}, slowest ${formatDuration(slowest.seconds)}. Switch to Table for every value.`}
          >
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={runs} margin={{ top: 18, right: 12, bottom: 0, left: 0 }} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
                <XAxis
                  dataKey="tick"
                  tickLine={false}
                  axisLine={{ stroke: "var(--border-medium)" }}
                  tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <YAxis
                  domain={[0, axis.ticks[axis.ticks.length - 1]]}
                  ticks={axis.ticks}
                  tickFormatter={axis.label}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                  allowDecimals
                />
                <Tooltip content={(p) => <RunTooltip active={p.active} payload={p.payload} />} cursor={{ fill: "rgba(148, 163, 184, 0.08)" }} isAnimationActive={false} />
                <ReferenceLine
                  y={med}
                  stroke="var(--text-dim)"
                  strokeWidth={1}
                  label={{ value: `median ${formatDuration(med)}`, position: "insideTopRight", fill: "var(--text-secondary)", fontSize: 10 }}
                />
                <Bar dataKey="seconds" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {runs.map((r) => (
                    <Cell key={r.id} fill={MODULE_COLORS[r.module]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {showChart && view === "table" && (
        <div className="run-chart-table-wrap">
          <table className="run-chart-table">
            <thead>
              <tr>
                <th scope="col">Job</th>
                <th scope="col">Module</th>
                <th scope="col" className="num">Shell Ø</th>
                <th scope="col" className="num">Run time</th>
                <th scope="col">Finished</th>
              </tr>
            </thead>
            <tbody>
              {[...runs].reverse().map((r) => (
                <tr key={r.id}>
                  <td className="text-mono">{r.id}</td>
                  <td>
                    <span className="run-chart-swatch" style={{ background: MODULE_COLORS[r.module] }} />
                    {MODULE_SHORT_NAMES[r.module]}
                  </td>
                  <td className="num">{r.shellId} mm</td>
                  <td className="num">{formatDuration(r.seconds)}</td>
                  <td>{fullFmt.format(r.finishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="run-chart-stat">
      <span className="run-chart-stat-label">{label}</span>
      <span className="run-chart-stat-value">{value}</span>
      {detail && <span className="run-chart-stat-detail">{detail}</span>}
    </div>
  );
}
