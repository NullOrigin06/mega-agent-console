import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { JobSummary } from "../../types/engineering";
import { getJob } from "../../api";
import { REFERENCE_GA_SPEC, gaSpecFromJob, type GaSpec } from "./gaSpec";

/**
 * The vessel the General Arrangement twin is modelled on: the newest completed
 * General Arrangement run (its shell, tube length and nozzle list), or the
 * reference condenser (shell I.D. 920, N1-N7) until one exists - the GA
 * counterpart of useTwinVesselSpec. `enabled` keeps the job-detail fetch off
 * until the twin is actually opened.
 */
export function useGaTwinSpec(jobs: JobSummary[], enabled = true): GaSpec {
  const source = jobs
    .filter((j) => j.module === "GeneralArrangement" && j.status === "completed")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const { data } = useQuery({
    queryKey: ["ga-twin-job", source?.id],
    queryFn: () => getJob(source!.id),
    enabled: enabled && Boolean(source),
    staleTime: 5 * 60_000,
  });
  return useMemo(() => (data && gaSpecFromJob(data)) || REFERENCE_GA_SPEC, [data]);
}
