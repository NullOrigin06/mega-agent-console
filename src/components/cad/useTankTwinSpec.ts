import { useQuery } from "@tanstack/react-query";
import type { JobSummary, TankModuleKind } from "../../types/engineering";
import { getJob } from "../../api";
import { defaultTankValues } from "../../constants/tankFields";
import type { TankTwinSpec } from "./TankViewport3D";
import { tankTwinSpecFromValues } from "./tankTwinSpec";

/**
 * Twin spec for one tank module on the Command Center: built from the newest
 * completed run of that module (its stored inputs, plus the result parameters
 * for thicknesses and roof framing), or the desktop form defaults until a run
 * exists - the tank counterpart of useTwinVesselSpec.
 */
export function useTankTwinSpec(jobs: JobSummary[], module: TankModuleKind, enabled = true): TankTwinSpec {
  const source = jobs
    .filter((j) => j.module === module && j.status === "completed")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const { data } = useQuery({
    queryKey: ["tank-twin-job", source?.id],
    queryFn: () => getJob(source!.id),
    enabled: enabled && Boolean(source),
    staleTime: 5 * 60_000,
  });
  const tank = data?.tankData;
  if (!tank) return tankTwinSpecFromValues(module, defaultTankValues(module));
  const values = Object.fromEntries(Object.entries(tank.inputs as unknown as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
  const params = Object.fromEntries(tank.parameters.map((p) => [p.key, p.estimated]));
  const spec = tankTwinSpecFromValues(module, values);
  const n = (k: string) => {
    const v = Number(params[k]);
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };
  return {
    ...spec,
    jobId: data?.id ?? null,
    params,
    shellId: n("SHELL_ID") ?? spec.shellId,
    height: n(module === "ShopTank" ? "SHELL_HT" : "TANK_HEIGHT") ?? spec.height,
    legs: n("NO_OF_LEGS") ?? spec.legs,
    legNb: n("LEG_PIPE_SIZE") ?? spec.legNb,
    basePlate: n("BASE_PLATE_SIZE") ?? spec.basePlate,
    rafters: n("RAFTER_QTY") ?? spec.rafters,
    anchorChairs: n("ANCHOR_CHAIR_QTY") ?? spec.anchorChairs,
    drumDia: n("CENTRAL_DRUM_DIA") ?? spec.drumDia,
  };
}
