import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { JobSummary } from "../../types/engineering";
import { getJob } from "../../api";
import { TYPICAL_VESSEL, vesselSpecFromJob, type VesselSpec } from "./vesselSpec";

/**
 * The vessel the digital twin is modelled on: the newest completed Heat
 * Exchanger Fab run (the only module whose job carries the whole vessel's
 * dimensions), or typical proportions until one exists. Shared by the
 * Command Center's 3D twin and the ambient background, so the job-detail
 * fetch is one cached query whichever of them asks first.
 */
export function useTwinVesselSpec(jobs: JobSummary[]): VesselSpec {
  const twinSource = jobs
    .filter((j) => j.module === "HeatExchangerFab" && j.status === "completed")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const { data: twinJob } = useQuery({
    queryKey: ["vessel-twin-job", twinSource?.id],
    queryFn: () => getJob(twinSource!.id),
    enabled: Boolean(twinSource),
    staleTime: 5 * 60_000,
  });
  // Memoised so consumers can key effects on the spec's identity.
  return useMemo(() => (twinJob && vesselSpecFromJob(twinJob)) || TYPICAL_VESSEL, [twinJob]);
}
