import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import type { JobSummary } from "../../types/engineering";

interface DurationTrendChartProps {
  jobs: JobSummary[];
}

interface TrendPoint {
  label: string;
  seconds: number;
}

function completedDurations(jobs: JobSummary[]): TrendPoint[] {
  return jobs
    .filter((j) => j.status === "completed" && j.completedAt)
    .map((j) => ({
      job: j,
      seconds: (new Date(j.completedAt!).getTime() - new Date(j.createdAt).getTime()) / 1000,
    }))
    .filter((p) => p.seconds > 0)
    .sort((a, b) => new Date(a.job.completedAt!).getTime() - new Date(b.job.completedAt!).getTime())
    .map((p) => ({ label: p.job.id, seconds: Math.round(p.seconds) }));
}

/**
 * Real completion-time trend across recently completed jobs - built only
 * from actual createdAt/completedAt pairs, and hidden entirely rather than
 * padded with fake points when there isn't enough real data yet to trend.
 */
export function DurationTrendChart({ jobs }: DurationTrendChartProps) {
  const points = completedDurations(jobs);
  if (points.length < 2) return null;

  return (
    <div className="duration-trend-card">
      <div className="duration-trend-header">
        <span className="duration-trend-title">Recent Completion Time</span>
        <span className="duration-trend-subtitle text-mono">
          {points.length} completed runs
        </span>
      </div>
      <div className="duration-trend-chart">
        <ResponsiveContainer width="100%" height={56}>
          <LineChart data={points} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <YAxis hide domain={["dataMin - 5", "dataMax + 5"]} />
            <Tooltip
              formatter={(value) => [`${value}s`, "Duration"]}
              labelFormatter={(label) => label}
              contentStyle={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-medium)",
                borderRadius: 6,
                fontSize: 11,
              }}
            />
            <Line
              type="monotone"
              dataKey="seconds"
              stroke="var(--accent-cyan)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--accent-cyan)" }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
