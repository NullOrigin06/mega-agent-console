/** One released Local Agent version, as listed in public/agent-releases.json (newest first; written by publish-release.ps1). */
export interface AgentRelease {
  version: string;
  date: string;
  /** What the version does / changed; several items are separated by ";". */
  notes: string;
}

/** Splits release notes into the list of things the version does. */
export function releaseHighlights(notes: string): string[] {
  return notes
    .split(/;|\n/)
    .map((s) => s.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean);
}

/** Compares dotted versions (1.2.10 > 1.2.9). Anything that is not a version sorts lowest. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => (v.match(/^\d+(\.\d+)*/)?.[0] ?? "").split(".").filter(Boolean).map(Number);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** The newest release of a list (does not rely on the order of the file). */
export function latestRelease(releases: readonly AgentRelease[]): AgentRelease | undefined {
  return releases.reduce<AgentRelease | undefined>((best, r) => (!best || compareVersions(r.version, best.version) > 0 ? r : best), undefined);
}

export type AgentVersionState = "latest" | "outdated" | "unknown";

/** Where an agent's version stands: unknown when it reports none (an agent older than 1.2.13), outdated when a newer release exists. */
export function agentVersionState(agentVersion: string | undefined | null, latest: string | undefined): AgentVersionState {
  if (!agentVersion || !latest) return "unknown";
  return compareVersions(agentVersion, latest) >= 0 ? "latest" : "outdated";
}

let cached: Promise<AgentRelease[]> | null = null;

/** Loads the release history shipped with the site. Returns an empty list when it cannot be read; the page then simply shows no history. */
export function fetchAgentReleases(): Promise<AgentRelease[]> {
  cached ??= fetch("/agent-releases.json", { headers: { Accept: "application/json" } })
    .then((res) => (res.ok ? res.json() : []))
    .then((data: unknown) =>
      Array.isArray(data)
        ? data
            .filter((r): r is AgentRelease => !!r && typeof r.version === "string")
            .map((r) => ({ version: r.version, date: String(r.date ?? ""), notes: String(r.notes ?? "") }))
        : [],
    )
    .catch(() => {
      cached = null;
      return [];
    });
  return cached;
}
