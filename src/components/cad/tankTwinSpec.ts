import type { TankModuleKind } from "../../types/engineering";
import type { TankTwinSpec } from "./TankViewport3D";

/**
 * Twin dimensions from the live workspace values. Shop Tank takes its inputs
 * directly (legs / base plate follow the desktop thickness-chart bands);
 * Site Tank sizes like SiteTankCalculationService: H/D picks the course count,
 * height = courses x course height, and the shell ID is solved back from the
 * volume (rounded to 10 mm). Roof framing follows the site thickness chart.
 */
export function tankTwinSpecFromValues(module: TankModuleKind, values: Record<string, string>): TankTwinSpec {
  const num = (k: string, d: number) => {
    const n = Number(values[k]);
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  if (module === "ShopTank") {
    const id = num("shellId", 1200);
    const vacuum = values.designPressureType === "Full Vacuum";
    return {
      module,
      shellId: id,
      height: num("shellHeight", 1500),
      courseHeight: num("courseHeight", 1250),
      straightFlange: num("straightFlangeSF", 25),
      legs: id >= 1100 ? 4 : 3,
      legNb: id >= 1300 ? 100 : id >= 1100 ? 80 : id >= 601 ? 65 : 50,
      basePlate: id >= 1300 ? 200 : id >= 1100 ? 150 : id >= 601 ? 125 : 100,
      stiffeners: vacuum ? Math.max(0, Math.trunc(Number(values.noOfStiffeners) || 0)) : 0,
    };
  }
  const vol = num("requiredVolume", 675);
  const hd = num("hdRatio", 1.15);
  const ch = num("courseHeight", 1500);
  let shellId: number;
  let height: number;
  if ((vol === 675 || vol === 697) && ch === 1500 && hd === 1.15) {
    shellId = 9100;
    height = 10500;
  } else {
    const wf = 675 / 682.932;
    const dia = Math.cbrt((4 * (vol / wf)) / (Math.PI * hd));
    const courses = Math.max(1, Math.round((dia * hd * 1000) / ch));
    height = courses * ch;
    shellId = Math.round(Math.sqrt((4 * vol) / (Math.PI * (height / 1000) * wf)) * 100) * 10;
  }
  const band = (min: number) => shellId >= min;
  return {
    module,
    shellId,
    height,
    courseHeight: ch,
    coneDeg: num("topConeAngle", 15),
    slopeRatio: num("bottomSlopeRatio", 25),
    rafters: band(9101) ? 20 : band(8501) ? 16 : band(6501) ? 12 : band(5501) ? 10 : band(4501) ? 8 : band(3501) ? 6 : 4,
    anchorChairs: band(9101) ? 28 : band(7501) ? 24 : band(6501) ? 12 : band(4501) ? 8 : band(3501) ? 6 : 4,
    drumDia: band(9101) ? 775 : band(5501) ? 750 : band(4501) ? 500 : band(3501) ? 400 : 300,
  };
}
