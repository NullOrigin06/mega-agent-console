import type { ModuleKind } from "../../types/engineering";
import tubeSheetArt from "../../assets/module-art/tube-sheet.webp";
import bonnetFlangeArt from "../../assets/module-art/bonnet-flange.webp";
import shopTankArt from "../../assets/module-art/shop-tank.webp";
import siteTankArt from "../../assets/module-art/site-tank.webp";
import heatExchangerArt from "../../assets/module-art/heat-exchanger.webp";
import generalArrangementArt from "../../assets/module-art/general-arrangement.webp";

// Renders of each module's part, generated from the same geometry as the 3D
// twin so they stay consistent with it and with each other. Shared by the
// Command Center cards and the module workspace headers.
export const MODULE_ART: Partial<Record<ModuleKind, string>> = {
  TubeSheet: tubeSheetArt,
  BonnetFlange: bonnetFlangeArt,
  HeatExchangerFab: heatExchangerArt,
  GeneralArrangement: generalArrangementArt,
  ShopTank: shopTankArt,
  SiteTank: siteTankArt,
};
