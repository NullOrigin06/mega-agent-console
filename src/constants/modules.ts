import type { ModuleKind } from "../types/engineering";
import {
  IconDisc,
  IconCylinder,
  IconLayers,
} from "../components/common/Icon";

export interface ModuleOption {
  kind: ModuleKind;
  title: string;
  badge: string;
  description: string;
  icon: typeof IconDisc;
}

/**
 * Single source of truth for the 3 engineering modules, mirroring the
 * Generate buttons in the desktop suite's Form3. Shared between the Modules
 * home page and SubmitJobModal so both list the same set consistently.
 */
export const MODULE_OPTIONS: ModuleOption[] = [
  {
    kind: "TubeSheet",
    title: "Tube Sheet",
    badge: "TS-GEN",
    description:
      "Generates tube sheet layout, tube pitch pattern, drilling holes, and tube sheet raw/finish geometry.",
    icon: IconDisc,
  },
  {
    kind: "BonnetFlange",
    title: "Bonnet Flange",
    badge: "BF-GEN",
    description:
      "Calculates body flange dimensions, bonnet front/rear shell lengths, dishend geometry, and bolting PCD.",
    icon: IconCylinder,
  },
  {
    kind: "HeatExchangerFab",
    title: "Heat Exchanger Fab",
    badge: "HX-FAB",
    description:
      "Full heat exchanger fabrication package: Shell, Tube Bundle, Baffles, Nozzles, CAD Drawing & BOM generation.",
    icon: IconLayers,
  },
];
