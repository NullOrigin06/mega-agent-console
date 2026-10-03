import type { ProjectInfo, ShopTankInputs, SiteTankInputs, TankModuleKind } from "../types/engineering";

/**
 * Input schemas for the two storage-tank workspaces, mirroring the desktop
 * forms field-for-field (ShopTankDesignForm "SHOP TANK INPUTS" and
 * SiteTankForm "USER INPUTS"): same labels, units, defaults, dropdown
 * options and validation messages.
 */
export interface TankField {
  key: string;
  label: string;
  unit?: string;
  kind: "number" | "select" | "combo";
  /** select = fixed list; combo = editable number with suggested values (desktop DropDown). */
  options?: string[];
  integer?: boolean;
  defaultValue: string;
  /** Returns the desktop validation message, or null when valid. */
  validate?: (value: number, all: Record<string, string>) => string | null;
  /** Hidden (and forced to its default) when this returns false. */
  visible?: (all: Record<string, string>) => boolean;
}

const positive = (msg: string) => (v: number) => (v > 0 ? null : msg);

export const SHOP_TANK_FIELDS: TankField[] = [
  { key: "shellId", label: "Shell I.D.", unit: "mm", kind: "number", defaultValue: "1200",
    validate: (v) => (v <= 0 ? "Shell I.D. must be > 0." : v < 300 || v > 3000 ? "Diameter Out of Range (300 - 3000 mm)." : null) },
  { key: "shellHeight", label: "Shell Height", unit: "mm", kind: "number", defaultValue: "1500", validate: positive("Shell Height must be > 0.") },
  { key: "designPressureType", label: "Design Pressure Type", kind: "select", options: ["Atmospheric", "Full Vacuum"], defaultValue: "Atmospheric" },
  { key: "courseHeight", label: "Course Height", unit: "mm", kind: "number", defaultValue: "1250", validate: positive("Course Height must be > 0.") },
  { key: "supportType", label: "Support Type", kind: "select", options: ["LEG SUPPORT", "LUG SUPPORT", "SADDLE SUPPORT", "SKIRT SUPPORT"], defaultValue: "LEG SUPPORT" },
  { key: "noOfStiffeners", label: "No. of Stiffeners", kind: "number", integer: true, defaultValue: "0",
    visible: (all) => all.designPressureType !== "Atmospheric",
    validate: (v) => (v >= 0 && Number.isInteger(v) ? null : "No. of Stiffeners must be a whole number >= 0.") },
  { key: "straightFlangeSF", label: "Straight Flange SF", unit: "mm", kind: "number", defaultValue: "25", validate: positive("Straight Flange SF must be > 0.") },
];

export const SITE_TANK_FIELDS: TankField[] = [
  { key: "courseHeight", label: "Course Height", unit: "mm", kind: "combo", options: ["1200", "1250", "1500", "1800", "2000", "2400"], defaultValue: "1500", validate: positive("Course Height must be > 0.") },
  { key: "requiredVolume", label: "Required Tank Volume", unit: "m³", kind: "combo", options: ["100", "200", "300", "400", "500", "550", "600", "675", "750", "850", "1000", "1200", "1500"], defaultValue: "675", validate: positive("Required Volume must be > 0.") },
  { key: "hdRatio", label: "H/D Ratio", kind: "combo", options: ["0.60", "0.70", "0.80", "0.90", "1.00", "1.10", "1.15", "1.20", "1.25", "1.40", "1.50", "1.75", "2.00"], defaultValue: "1.15", validate: positive("H/D Ratio must be > 0.") },
  { key: "bottomSlopeRatio", label: "Bottom Slope (1 : X)", kind: "combo", options: ["15", "20", "25", "30", "50"], defaultValue: "25", validate: positive("Slope Ratio must be > 0.") },
  { key: "topConeAngle", label: "Top Cone Angle", unit: "deg", kind: "combo", options: ["8", "10", "12", "15", "18", "20"], defaultValue: "15",
    validate: (v) => (v >= 0 && v < 90 ? null : "Cone angle must be between 0 and 90°.") },
  { key: "designCode", label: "Equipment Design Code", kind: "select", options: ["API 650", "API 620", "IS 803", "EN 14015"], defaultValue: "API 650" },
];

export const TANK_FIELDS: Record<TankModuleKind, TankField[]> = { ShopTank: SHOP_TANK_FIELDS, SiteTank: SITE_TANK_FIELDS };

function today(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

/** Desktop form defaults for the title block of each tank. */
export function defaultTankProjectInfo(module: TankModuleKind): ProjectInfo {
  return module === "ShopTank"
    ? { customerName: "MEGA CLIENT", drawingTitle: "RECTIFIER COLUMN REFLUX TANK", projectNo: "25-005", drawingNo: "25-005-WFD-TK-1442-R0", revision: "0", date: today(), preparedBy: "NSS", checkedBy: "ASK", approvedBy: "ASK" }
    : { customerName: "MEGA EPC", drawingTitle: "Site Tank Fabrication Details", projectNo: "ST-26-001", drawingNo: "ST-26-001-GAD-01", revision: "0", date: today(), preparedBy: "NSS", checkedBy: "ASK", approvedBy: "ASK" };
}

export function defaultTankValues(module: TankModuleKind): Record<string, string> {
  return Object.fromEntries(TANK_FIELDS[module].map((f) => [f.key, f.defaultValue]));
}

/** Validates like the desktop form and builds the typed inputs object (contract §1). */
export function buildTankInputs(
  module: TankModuleKind,
  values: Record<string, string>,
): { inputs: ShopTankInputs | SiteTankInputs } | { fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const out: Record<string, string | number> = {};
  for (const f of TANK_FIELDS[module]) {
    const shown = f.visible ? f.visible(values) : true;
    const raw = shown ? (values[f.key] ?? "").trim() : f.defaultValue;
    if (f.kind === "select") {
      out[f.key] = raw || f.defaultValue;
      continue;
    }
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n)) {
      fieldErrors[f.key] = `${f.label} must be a number.`;
      continue;
    }
    const msg = f.validate?.(n, values);
    if (msg) fieldErrors[f.key] = msg;
    out[f.key] = f.integer ? Math.trunc(n) : n;
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors };
  return { inputs: out as unknown as ShopTankInputs | SiteTankInputs };
}

/** Live derived values the desktop form shows read-only while typing. */
export function tankDerived(module: TankModuleKind, values: Record<string, string>): Array<{ label: string; value: string; unit?: string }> {
  if (module === "ShopTank") {
    const id = Number(values.shellId);
    const h = Number(values.shellHeight);
    const ok = id > 0 && h > 0;
    return [
      { label: "H/D Ratio", value: ok ? (h / id).toFixed(3) : "-" },
      { label: "Design Volume", value: ok ? ((Math.PI / 4) * (id / 1000) ** 2 * (h / 1000)).toFixed(3) : "-", unit: "m³" },
    ];
  }
  const slope = Number(values.bottomSlopeRatio);
  return [{ label: "Bottom Slope Angle", value: slope > 0 ? ((Math.atan(1 / slope) * 180) / Math.PI).toFixed(2) : "-", unit: "°" }];
}
