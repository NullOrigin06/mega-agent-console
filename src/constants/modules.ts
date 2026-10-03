import type { ModuleKind, TankModuleKind } from "../types/engineering";
import {
  IconDisc,
  IconCylinder,
  IconLayers,
} from "../components/common/Icon";
import { CadTubeSheetPreview } from "../components/cad/CadTubeSheetPreview";
import { CadFlangePreview } from "../components/cad/CadFlangePreview";
import { CadHeatExchangerPreview } from "../components/cad/CadHeatExchangerPreview";
import { CadShopTankPreview } from "../components/cad/CadShopTankPreview";
import { CadSiteTankPreview } from "../components/cad/CadSiteTankPreview";

export interface ModuleOption {
  kind: ModuleKind;
  title: string;
  badge: string;
  description: string;
  icon: typeof IconDisc;
  /** "exchanger" modules share the HX job model; "tank" modules have their own (docs/TANK_MODULES_CONTRACT.md). */
  family: "exchanger" | "tank";
  /** Real CAD line-art for this module, used on the Command Center bento cards. */
  preview: typeof CadTubeSheetPreview;
}

/**
 * Single source of truth for the engineering modules, mirroring the desktop
 * suite's structure selection (Form2/Form3). Shared between the Modules home
 * page, the sidebar, the command palette and ModuleWorkspace.
 */
export const MODULE_OPTIONS: ModuleOption[] = [
  {
    kind: "TubeSheet",
    family: "exchanger",
    title: "Tube Sheet",
    badge: "TS-GEN",
    description:
      "Generates tube sheet layout, tube pitch pattern, drilling holes, and tube sheet raw/finish geometry.",
    icon: IconDisc,
    preview: CadTubeSheetPreview,
  },
  {
    kind: "BonnetFlange",
    family: "exchanger",
    title: "Bonnet Flange",
    badge: "BF-GEN",
    description:
      "Calculates body flange dimensions, bonnet front/rear shell lengths, dishend geometry, and bolting PCD.",
    icon: IconCylinder,
    preview: CadFlangePreview,
  },
  {
    kind: "HeatExchangerFab",
    family: "exchanger",
    title: "Heat Exchanger Fab",
    badge: "HX-FAB",
    description:
      "Full heat exchanger fabrication package: Shell, Tube Bundle, Baffles, Nozzles, CAD Drawing & BOM generation.",
    icon: IconLayers,
    preview: CadHeatExchangerPreview,
  },
  {
    kind: "ShopTank",
    family: "tank",
    title: "Shop Tank",
    badge: "ST-SHOP",
    description:
      "Shop-built vertical tank: shell, dished heads, stiffeners and leg supports sized from the thickness chart, with BOM and GA drawing.",
    icon: IconCylinder,
    preview: CadShopTankPreview,
  },
  {
    kind: "SiteTank",
    family: "tank",
    title: "Site Tank",
    badge: "ST-SITE",
    description:
      "Field-erected storage tank: courses, shell ID and height from volume and H/D, cone roof framing, sloped bottom, weights and GA drawing.",
    icon: IconLayers,
    preview: CadSiteTankPreview,
  },
];

export function isTankModule(kind: ModuleKind): kind is TankModuleKind {
  return kind === "ShopTank" || kind === "SiteTank";
}
