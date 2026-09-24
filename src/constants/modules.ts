import type { ModuleKind } from "../types/engineering";
import {
  IconDisc,
  IconCylinder,
  IconLayers,
} from "../components/common/Icon";
import { CadTubeSheetPreview } from "../components/cad/CadTubeSheetPreview";
import { CadFlangePreview } from "../components/cad/CadFlangePreview";
import { CadHeatExchangerPreview } from "../components/cad/CadHeatExchangerPreview";

export interface ModuleOption {
  kind: ModuleKind;
  title: string;
  badge: string;
  description: string;
  icon: typeof IconDisc;
  /** Real CAD line-art for this module, used on the Command Center bento cards. */
  preview: typeof CadTubeSheetPreview;
}

/**
 * Single source of truth for the 3 engineering modules, mirroring the
 * Generate buttons in the desktop suite's Form3. Shared between the Modules
 * home page and ModuleWorkspace so both list the same set consistently.
 */
export const MODULE_OPTIONS: ModuleOption[] = [
  {
    kind: "TubeSheet",
    title: "Tube Sheet",
    badge: "TS-GEN",
    description:
      "Generates tube sheet layout, tube pitch pattern, drilling holes, and tube sheet raw/finish geometry.",
    icon: IconDisc,
    preview: CadTubeSheetPreview,
  },
  {
    kind: "BonnetFlange",
    title: "Bonnet Flange",
    badge: "BF-GEN",
    description:
      "Calculates body flange dimensions, bonnet front/rear shell lengths, dishend geometry, and bolting PCD.",
    icon: IconCylinder,
    preview: CadFlangePreview,
  },
  {
    kind: "HeatExchangerFab",
    title: "Heat Exchanger Fab",
    badge: "HX-FAB",
    description:
      "Full heat exchanger fabrication package: Shell, Tube Bundle, Baffles, Nozzles, CAD Drawing & BOM generation.",
    icon: IconLayers,
    preview: CadHeatExchangerPreview,
  },
];
