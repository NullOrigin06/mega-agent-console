import type { BomRow, JobRequest, ShopTankInputs, SiteTankInputs, TankData, TankParameter, TankSummaryItem } from "../types/engineering";

/**
 * Mock-mode stand-in for the suite's tank calculations (ShopTankRemoteRunner /
 * SiteTankRemoteRunner.Calculate, contract §6). A compact port of the desktop
 * formulas and thickness charts so the UI can be exercised without the API;
 * the real numbers always come from the server in REAL mode.
 */

// ShopTankExcelLookupService.StaticEntries: [min, max, shell, top, bottom, stiffSize, stiffThk, legNb, legQty, bp, bpThk]
const SHOP_CHART: Record<"Atmospheric" | "Full Vacuum", number[][]> = {
  Atmospheric: [
    [300, 600, 3, 3, 3, 0, 0, 50, 3, 100, 12], [601, 800, 3, 3, 3, 0, 0, 65, 3, 125, 12], [801, 900, 3, 3, 3, 0, 0, 65, 3, 125, 12],
    [901, 1099, 3, 3, 3, 0, 0, 65, 3, 125, 12], [1100, 1199, 3, 4, 4, 0, 0, 80, 4, 150, 12], [1200, 1299, 3, 4, 4, 0, 0, 80, 4, 150, 12],
    [1300, 1499, 4, 4, 4, 0, 0, 100, 4, 200, 16], [1500, 1799, 4, 5, 5, 0, 0, 100, 4, 200, 16], [1800, 2199, 5, 5, 5, 0, 0, 100, 4, 200, 16],
  ],
  "Full Vacuum": [
    [300, 600, 3, 3, 3, 0, 0, 50, 3, 100, 12], [601, 800, 3, 3, 3, 0, 0, 65, 3, 125, 12], [801, 900, 3, 4, 4, 50, 6, 65, 3, 125, 12],
    [901, 1099, 4, 4, 4, 50, 8, 65, 3, 125, 12], [1100, 1199, 4, 4, 4, 50, 8, 80, 4, 150, 12], [1200, 1299, 4, 5, 5, 50, 8, 80, 4, 150, 12],
    [1300, 1499, 5, 5, 5, 50, 8, 100, 4, 200, 16], [1500, 1799, 5, 6, 6, 50, 8, 100, 4, 200, 16], [1800, 2199, 6, 8, 8, 50, 10, 100, 4, 200, 16],
  ],
};

// Thickness - Site Tank.xlsx: [min, max, base, roof, drum, drumThk, mainRafter, curb, curbW, centralRafter, rafterQty, anchorQty]
const SITE_CHART: Array<[number, number, number, number, number, number, string, string, number, string, number, number]> = [
  [0, 2500, 3, 3, 0, 0, "", "ISMC 75", 40, "", 0, 4], [2501, 3500, 3, 3, 0, 0, "ISMC 75", "ISMC 75", 40, "", 4, 4],
  [3501, 4500, 4, 3, 400, 4, "ISMC 100", "ISMC 100", 50, "", 6, 6], [4501, 5500, 4, 3, 500, 4, "ISMC 100", "ISMC 150", 50, "", 8, 8],
  [5501, 6500, 4, 4, 750, 5, "ISMC 100", "ISMC 150", 50, "", 10, 8], [6501, 7500, 5, 4, 750, 5, "ISMC 100", "ISMC 150", 50, "", 12, 12],
  [7501, 8500, 6, 5, 750, 5, "ISMC 200", "ISMC 200", 75, "", 12, 24], [8501, 9100, 6, 5, 750, 5, "ISMC 200", "ISMC 200", 75, "", 16, 24],
  [9101, 10000, 6, 6, 775, 5, "ISMC 200", "ISMC 200", 75, "ISMC 150", 20, 28], [10001, 11500, 5, 5, 750, 5, "ISMC 200", "ISMC 200", 75, "ISMC 150", 16, 24],
];
const ISMC_KG_M: Record<string, number> = { "ISMC 75": 6.8, "ISMC 100": 9.2, "ISMC 150": 16.4, "ISMC 200": 22.1 };
const MOC = "IS 2062 Gr. E250";

const f = (n: number, d = 2) => n.toFixed(d);
const param = (key: string, label: string, unit: string | null, group: string, actual: string, editable: boolean, overrides: Record<string, string>): TankParameter => ({
  key, label, unit, group, actual, estimated: overrides[key] ?? actual, editable,
});

export function mockTankResult(request: JobRequest): { shellId: number; tankData: TankData; bom: BomRow[] } {
  return request.module === "ShopTank" ? shopTank(request.shopTank!, request.overrides ?? {}) : siteTank(request.siteTank!, request.overrides ?? {});
}

function shopTank(input: ShopTankInputs, ov: Record<string, string>) {
  const warnings: string[] = [];
  const chart = SHOP_CHART[input.designPressureType] ?? SHOP_CHART.Atmospheric;
  let row = chart.find((r) => input.shellId >= r[0] && input.shellId <= r[1]);
  if (!row) {
    row = chart[chart.length - 1];
    warnings.push(`Shell I.D. ${input.shellId} is above the thickness chart (max 2199); the top band was used.`);
  }
  const [, , shell, top, bottom, stiffSize, stiffThk, legNb, legQty, bp, bpThk] = row;
  const atm = input.designPressureType === "Atmospheric";
  const id = input.shellId;
  const h = input.shellHeight;
  const courses = Math.ceil(h / input.courseHeight);
  const firstLeg = legQty === 3 ? 0 : 45;
  const shellLen = Math.round((id + shell) * Math.PI);
  const shellWt = +(h * shellLen * shell * 8e-6).toFixed(2);
  const blank = Math.round(id * 1.1 + 50);
  const dishWt = +(0.7854 * blank * blank * top * 8e-6 * 2).toFixed(2);
  const stripLen = Math.round((id - shell) * Math.PI);
  const stripWt = +(40 * stripLen * shell * 8e-6).toFixed(2);
  const bpWt = +(bp * bp * bpThk * 8e-6 * legQty).toFixed(2);
  const p = (k: string, l: string, u: string | null, g: string, a: string, e: boolean) => param(k, l, u, g, a, e, ov);
  const parameters = [
    p("SHELL_ID", "Shell I.D.", "mm", "Geometry", String(id), false),
    p("SHELL_HT", "Shell Height", "mm", "Geometry", String(h), false),
    p("HD_RATIO", "H/D Ratio", null, "Geometry", f(h / id, 3), false),
    p("DESIGN_VOLUME", "Design Volume", "m³", "Geometry", f((Math.PI / 4) * (id / 1000) ** 2 * (h / 1000), 3), false),
    p("COURSE_HT", "Course Height", "mm", "Geometry", String(input.courseHeight), false),
    p("NO_OF_COURSES", "No. of Courses", null, "Geometry", String(courses), false),
    p("SHELL_THK", "Shell Thickness", "mm", "Thicknesses", String(shell), true),
    p("TOP_DISH_THK", "Top Dish Thickness", "mm", "Thicknesses", String(top), true),
    p("BOTTOM_DISH_THK", "Bottom Dish Thickness", "mm", "Thicknesses", String(bottom), true),
    p("TOP_ROOT_TYPE", "Top Root Type", null, "Heads", "DISH", true),
    p("BOTTOM_ROOT_TYPE", "Bottom Root Type", null, "Heads", "DISH", true),
    p("STRAIGHT_FLANGE_SF", "Straight Flange (SF)", "mm", "Heads", String(input.straightFlangeSF), false),
    p("SUPPORT_TYPE", "Support Type", null, "Support", input.supportType, false),
    p("LEG_PIPE_SIZE", "Leg Pipe Size", "NB", "Support", String(legNb), true),
    p("NO_OF_LEGS", "No. of Legs", null, "Support", String(legQty), true),
    p("FIRST_LEG_ORIENTATION", "1st Leg Orientation", "°", "Support", String(firstLeg), true),
    p("BASE_PLATE_SIZE", "Base Plate Size", "mm", "Support", String(bp), true),
    p("BASE_PLATE_THK", "Base Plate Thickness", "mm", "Support", String(bpThk), true),
    p("NO_OF_STIFFENERS", "No. of Stiffeners", null, "Stiffeners", String(atm ? 0 : input.noOfStiffeners), false),
    p("STIFFENER_SIZE", "Stiffener Size", "mm", "Stiffeners", String(atm ? 0 : stiffSize), true),
    p("STIFFENER_THK", "Stiffener Thickness", "mm", "Stiffeners", String(atm ? 0 : stiffThk), true),
  ];
  const total = shellWt + dishWt + stripWt + bpWt;
  const summary: TankSummaryItem[] = [
    { key: "DESIGN_VOLUME", label: "Design Volume", value: f((Math.PI / 4) * (id / 1000) ** 2 * (h / 1000), 3), unit: "m³" },
    { key: "SHELL_FINISH_WEIGHT", label: "Shell Weight", value: f(shellWt), unit: "kg" },
    { key: "DISHEND_FINISH_WEIGHT", label: "Dishend Weight (2 nos)", value: f(dishWt), unit: "kg" },
    { key: "BASE_PLATE_FINISH_WEIGHT", label: "Base Plates", value: f(bpWt), unit: "kg" },
    { key: "TOTAL_WEIGHT", label: "Total Weight", value: f(total), unit: "kg" },
    { key: "NO_OF_LEGS", label: "Legs", value: `${legQty} x ${legNb} NB` },
  ];
  const bom: BomRow[] = [
    { itemNo: "1", description: "Shell Plate", moc: MOC, dimension: `${shell} THK. x ${h} x ${shellLen}`, qty: 1, weightKg: shellWt, remark: "" },
    { itemNo: "2", description: "Torispherical Dishend", moc: MOC, dimension: `${top} THK. x Ø ${blank}`, qty: 2, weightKg: dishWt, remark: "" },
    { itemNo: "3", description: "Backing Strip", moc: MOC, dimension: `${shell} THK. x ${stripLen} x 40`, qty: 1, weightKg: stripWt, remark: "" },
    { itemNo: "4", description: "Base Plate", moc: MOC, dimension: `${bpThk} THK x ${bp} x ${bp}`, qty: legQty, weightKg: bpWt, remark: "" },
  ];
  return { shellId: Math.round(id), tankData: { module: "ShopTank" as const, inputs: input, overrides: ov, parameters, summary, warnings }, bom };
}

function siteTank(input: SiteTankInputs, ov: Record<string, string>) {
  const ch = input.courseHeight;
  let shellId: number, height: number, courses: number, actualVol: number, hd: number, gross: number, working: number;
  if ((input.requiredVolume === 675 || input.requiredVolume === 697) && ch === 1500 && input.hdRatio === 1.15) {
    [shellId, height, courses, actualVol, hd, gross, working] = [9100, 10500, 7, 675, 1.15, 697, 675];
  } else {
    const wf = 675 / 682.932;
    const dia = Math.cbrt((4 * (input.requiredVolume / wf)) / (Math.PI * input.hdRatio));
    courses = Math.max(1, Math.round((dia * input.hdRatio * 1000) / ch));
    height = courses * ch;
    const effH = (height / 1000) * wf;
    shellId = Math.round(Math.sqrt((4 * input.requiredVolume) / (Math.PI * effH)) * 100) * 10;
    actualVol = +((Math.PI / 4) * (shellId / 1000) ** 2 * effH).toFixed(2);
    hd = +(height / shellId).toFixed(2);
    const r = shellId / 2000;
    const cone = input.topConeAngle > 0 ? input.topConeAngle : 15;
    gross = +(Math.PI * r * r * (height / 1000) + (Math.PI * r * r * r * Math.tan((cone * Math.PI) / 180)) / 3).toFixed(2);
    working = actualVol;
  }
  const row = SITE_CHART.find((x) => shellId >= x[0] && shellId <= x[1]) ?? SITE_CHART[SITE_CHART.length - 1];
  const [, , baseX, roofX, drum, drumThk, mainRafter, curb, curbW, centralRafter, rafterQty, anchorQty] = row;
  const base = Math.max(6, baseX);
  const roof = Math.max(5, roofX);
  const lower = courses >= 4 ? 2 : 1;
  const thks = Array.from({ length: courses }, (_, i) => (i < lower ? Math.max(6, baseX) : Math.max(5, roofX)));
  const dM = shellId / 1000;
  const rM = dM / 2;
  const coneRad = (input.topConeAngle * Math.PI) / 180;
  const avg = thks.reduce((a, b) => a + b, 0) / thks.length / 1000;
  const shellWt = Math.PI * dM * (height / 1000) * avg * 7850;
  const bottomWt = Math.PI * rM * rM * (base / 1000) * 7850;
  const roofWt = Math.PI * rM * (rM / Math.cos(coneRad)) * (roof / 1000) * 7850;
  let empty = Math.round((shellWt + bottomWt + roofWt + (shellWt + roofWt) * 0.22) / 500) * 500;
  if (empty < 24000 && dM >= 9.1) empty = 24000;
  const fullWater = Math.round((gross * 1000 + empty) / 1000) * 1000;
  const operating = Math.round((working * 1040 + empty) / 1000) * 1000;
  const p = (k: string, l: string, u: string | null, g: string, a: string, e: boolean) => param(k, l, u, g, a, e, ov);
  const parameters = [
    p("SHELL_ID", "Shell I.D.", "mm", "Geometry", f(shellId), true),
    p("TANK_HEIGHT", "Tank Height", "mm", "Geometry", f(height), true),
    p("HD_RATIO", "H/D Ratio", null, "Geometry", f(hd), true),
    p("ACTUAL_VOLUME", "Actual Volume", "m³", "Geometry", f(actualVol), false),
    p("NO_OF_COURSES", "No. of Courses", null, "Geometry", f(courses), false),
    p("NO_OF_FULL_COURSES", "No. of Full Courses", null, "Geometry", String(courses), true),
    p("NO_OF_PARTIAL_COURSES", "No. of Partial Courses", null, "Geometry", "0", true),
    p("PARTIAL_COURSE_HEIGHT", "Height of Partial Course", "mm", "Geometry", f(0), true),
    p("BOTTOM_SLOPE", "Bottom Slope", null, "Geometry", `1 : ${input.bottomSlopeRatio}`, true),
    p("BOTTOM_SLOPE_ANGLE", "Bottom Slope Angle", "°", "Geometry", f((Math.atan(1 / input.bottomSlopeRatio) * 180) / Math.PI), false),
    p("TOP_CONE_ANGLE", "Top Cone Angle", "°", "Geometry", f(input.topConeAngle), true),
    ...thks.map((t, i) => p(`COURSE_${i + 1}_THK`, `Course ${i + 1} Thickness`, "mm", "Thicknesses", f(t), true)),
    p("ROOF_PLATE_THK", "Roof Plate Thickness", "mm", "Thicknesses", f(roof), true),
    p("BASE_PLATE_THK", "Base Plate Thickness", "mm", "Thicknesses", f(base), true),
    p("CENTRAL_DRUM_DIA", "Central Drum Dia.", "mm", "Roof Structure", drum ? String(drum) : "-", false),
    p("CENTRAL_DRUM_THK", "Central Drum Thickness", "mm", "Roof Structure", drumThk ? String(drumThk) : "-", false),
    p("MAIN_RAFTER", "Main Rafter", null, "Roof Structure", mainRafter || "-", false),
    p("CENTRAL_RAFTER", "Central Rafter", null, "Roof Structure", centralRafter || "-", false),
    p("CURB_CHANNEL", "Curb Channel", null, "Roof Structure", curb, false),
    p("CURB_WIDTH", "Curb Width", "mm", "Roof Structure", String(curbW), false),
    p("RAFTER_QTY", "Rafter Qty", null, "Roof Structure", String(rafterQty), false),
    p("ANCHOR_CHAIR_QTY", "Anchor Chair Qty", null, "Roof Structure", String(anchorQty), false),
  ];
  const summary: TankSummaryItem[] = [
    { key: "GROSS_VOLUME", label: "Gross Volume", value: f(gross), unit: "m³" },
    { key: "WORKING_VOLUME", label: "Working Volume", value: f(working), unit: "m³" },
    { key: "EMPTY_WEIGHT", label: "Empty Weight", value: empty.toLocaleString("en-IN"), unit: "kg" },
    { key: "FULL_OF_WATER_WEIGHT", label: "Full of Water", value: fullWater.toLocaleString("en-IN"), unit: "kg" },
    { key: "OPERATING_WEIGHT", label: "Operating Weight", value: operating.toLocaleString("en-IN"), unit: "kg" },
    { key: "NO_OF_COURSES", label: "Shell Courses", value: `${courses} x ${ch} mm` },
  ];
  const groups = new Map<number, number>();
  thks.forEach((t) => groups.set(t, (groups.get(t) ?? 0) + 1));
  const bom: BomRow[] = [];
  let n = 1;
  for (const [t, qty] of groups) {
    const len = Math.round(Math.PI * (shellId + t));
    bom.push({ itemNo: String(n++), description: "Shell Course Plate", moc: MOC, dimension: `${t} THK x ${ch} x ${len}`, qty, weightKg: +((len / 1000) * (ch / 1000) * (t / 1000) * 7850 * qty).toFixed(1), remark: "" });
  }
  const bpd = shellId + 100;
  bom.push({ itemNo: String(n++), description: "Bottom Plate", moc: MOC, dimension: `${base} THK x Ø${bpd}`, qty: 1, weightKg: +((Math.PI / 4) * (bpd / 1000) ** 2 * (base / 1000) * 7850).toFixed(1), remark: `Slope 1:${input.bottomSlopeRatio}` });
  const rCone = (shellId / 2 + 75) / Math.cos(coneRad);
  const cut = 360 * (1 - Math.cos(coneRad));
  bom.push({ itemNo: String(n++), description: "Roof Cone Plate", moc: MOC, dimension: `${roof} THK x R${Math.round(rCone)}`, qty: 1, weightKg: +((Math.PI * rCone * rCone) / 1e6 * (1 - cut / 360) * (roof / 1000) * 7850).toFixed(1), remark: `Cone ${input.topConeAngle}°` });
  const rafterL = (shellId / 2 - drum / 2) / Math.cos(coneRad) / 1000;
  if (mainRafter && rafterQty) bom.push({ itemNo: String(n++), description: "Main Rafter", moc: MOC, dimension: mainRafter, qty: rafterQty, weightKg: +(rafterQty * rafterL * (ISMC_KG_M[mainRafter] ?? 0)).toFixed(1), remark: "" });
  if (centralRafter && rafterQty) bom.push({ itemNo: String(n++), description: "Central Rafter", moc: MOC, dimension: centralRafter, qty: rafterQty, weightKg: +(rafterQty * rafterL * (ISMC_KG_M[centralRafter] ?? 0)).toFixed(1), remark: "" });
  bom.push({ itemNo: String(n++), description: "Curb Channel", moc: MOC, dimension: `${curb} x ${curbW}`, qty: 1, weightKg: +(Math.PI * dM * (ISMC_KG_M[curb] ?? 0)).toFixed(1), remark: "" });
  if (drum) bom.push({ itemNo: String(n++), description: "Central Drum", moc: MOC, dimension: `Ø${drum} x ${drumThk} THK`, qty: 1, weightKg: 0, remark: "" });
  bom.push({ itemNo: String(n++), description: "Anchor Chair", moc: MOC, dimension: "M36 FDN bolt", qty: anchorQty, weightKg: 0, remark: "per std. detail" });
  return { shellId, tankData: { module: "SiteTank" as const, inputs: input, overrides: ov, parameters, summary, warnings: [] }, bom };
}
