import { useEffect, useRef, useState } from "react";
import type { EngineeringDataModel, EngineeringValues, JobDetail } from "../../types/engineering";
import { editEstimated } from "../../api";
import { ApiFieldError } from "../../api/errors";
import {
  EstimatedBanner,
  EstimatedCategoryCard,
  EstimatedNoticeCard,
  EstimatedToolbar,
  type EstimatedRow,
} from "./EstimatedFields";

interface EngineeringDataViewProps {
  initialData: EngineeringDataModel;
  /** With the job id and a handler the Estimated column is live: an edit is calculated by the server, like the software's grid. */
  jobId?: string;
  onUpdated?: (job: JobDetail) => void;
  /** Block editing, e.g. while a drawing is being generated. */
  disabled?: boolean;
}

interface FieldMeta {
  key: keyof EngineeringValues;
  label: string;
  unit: string;
  type: "number" | "text";
  description: string;
  /** The software's Estimated grid does not let you edit this value (Baffle OD is derived). Default true. */
  editable?: boolean;
  /** A whole number (counts). */
  integer?: boolean;
  /** Text that may be left empty: the Actual value comes back (the software's MOC grid). */
  allowBlank?: boolean;
}

interface CategoryGroup {
  id: string;
  title: string;
  description: string;
  fields: FieldMeta[];
}

const CATEGORIES: CategoryGroup[] = [
  {
    id: "diameters",
    title: "Shell & Flange Diameters",
    description: "Cylindrical shell, flange, and tube sheet circumferential dimensions",
    fields: [
      { key: "shellID", label: "Shell ID", unit: "mm", type: "number", integer: true, description: "Nominal inner diameter of shell" },
      { key: "flangeID", label: "Flange ID", unit: "mm", type: "number", description: "Body flange inner diameter" },
      { key: "tubeSheetFinishOD", label: "Tube Sheet Finish OD", unit: "mm", type: "number", description: "Finished machined outer diameter" },
      { key: "tubeSheetRawOD", label: "Tube Sheet Raw OD", unit: "mm", type: "number", description: "Pre-machined raw plate outer diameter" },
      { key: "linerGasketOD", label: "Liner Gasket OD", unit: "mm", type: "number", description: "Outer diameter of sealing gasket liner" },
      { key: "baffleOD", label: "Baffle OD", unit: "mm", type: "number", editable: false, description: "Transverse baffle outer diameter (derived from the shell)" },
    ],
  },
  {
    id: "thicknesses",
    title: "Component Thicknesses",
    description: "Plate thickness specifications (finished machined vs. raw cut stock)",
    fields: [
      { key: "tubeSheetFinishTHK", label: "Tube Sheet Finish THK", unit: "mm", type: "number", description: "Finished tube sheet thickness" },
      { key: "tubeSheetRawTHK", label: "Tube Sheet Raw THK", unit: "mm", type: "number", description: "Raw plate procurement thickness" },
      { key: "bodyFlangeFinishTHK", label: "Body Flange Finish THK", unit: "mm", type: "number", description: "Finished flange ring thickness" },
      { key: "bodyFlangeRawTHK", label: "Body Flange Raw THK", unit: "mm", type: "number", description: "Raw flange plate thickness" },
      { key: "partitionPlateTHK", label: "Partition Plate THK", unit: "mm", type: "number", description: "Pass partition baffle thickness" },
      { key: "baffleTHK", label: "Baffle THK", unit: "mm", type: "number", description: "Transverse segment baffle thickness" },
    ],
  },
  {
    id: "bolting",
    title: "Bolting & Fastener Geometry",
    description: "Girth flange bolting arrangement, pitch circle, and hole drilling specs",
    fields: [
      { key: "boltSize", label: "Bolt Size", unit: "", type: "text", description: "Thread designation (e.g. M20, M24)" },
      { key: "boltLength", label: "Bolt Length", unit: "mm", type: "number", description: "Nominal fastener stud/bolt length" },
      { key: "noOfBolts", label: "Number of Bolts", unit: "qty", type: "number", integer: true, description: "Total bolt circle count" },
      { key: "holeDia", label: "Hole Diameter", unit: "mm", type: "number", description: "Clearance hole diameter on flange" },
      { key: "boltPCD", label: "Bolt PCD", unit: "mm", type: "number", description: "Pitch Circle Diameter of bolting" },
    ],
  },
  {
    id: "bonnet",
    title: "Bonnet Shell & Dish End",
    description: "Front & rear bonnet channel dimensions and dished head plate thickness",
    fields: [
      { key: "bonnetShellFSLength", label: "Bonnet Shell FS Length", unit: "mm", type: "number", description: "Front-side channel cylindrical length" },
      { key: "bonnetShellRSLength", label: "Bonnet Shell RS Length", unit: "mm", type: "number", description: "Rear-side channel cylindrical length" },
      { key: "bonnetShellTHK", label: "Shell/Bonnet Thk", unit: "mm", type: "number", description: "Channel cylindrical shell thickness" },
      { key: "dishendTHK", label: "Dish End THK", unit: "mm", type: "number", description: "Formed dished head nominal thickness" },
    ],
  },
  {
    id: "internal",
    title: "Tubes, Tie Rods & Spacers",
    description: "Internal bundle components holding the tube array in place",
    fields: [
      { key: "tubeQty", label: "Active Tube Count", unit: "tubes", type: "number", integer: true, description: "Total number of heat transfer tubes" },
      { key: "tieRodDia", label: "Tie Rod Diameter", unit: "mm", type: "number", description: "Skeleton tie rod bar diameter" },
      { key: "tieRodQty", label: "Tie Rod Quantity", unit: "rods", type: "number", description: "Quantity of longitudinal tie rods" },
      { key: "spacerTube", label: "Spacer Tube", unit: "mm", type: "number", description: "Distance sleeve between baffle plates" },
    ],
  },
  {
    id: "moc",
    title: "Material of Construction (MOC)",
    description: "Materials printed in the BOM and on the drawing; an empty Estimated value goes back to the Actual one",
    fields: [
      { key: "shellMaterial", label: "Shell", unit: "", type: "text", allowBlank: true, description: "Shell plate material" },
      { key: "tubeMaterial", label: "Tube", unit: "", type: "text", allowBlank: true, description: "Tube material" },
      { key: "tubeSheetMaterial", label: "Tubesheet", unit: "", type: "text", allowBlank: true, description: "Tube sheet material" },
      { key: "bodyFlangeMaterial", label: "Body Flange", unit: "", type: "text", allowBlank: true, description: "Body flange material" },
    ],
  },
];

export function EngineeringDataView({ initialData, jobId, onUpdated, disabled = false }: EngineeringDataViewProps) {
  // The Estimated values come from the server (it calculates every edit, like the software's grid); what is typed lives in `draft`
  // until Enter / leaving the field sends it.
  const estimated = initialData.estimated;
  // Actual values are strictly read-only baseline snapshots
  const actual = initialData.actual;

  const live = !!jobId && !!onUpdated;
  const [draft, setDraft] = useState<Partial<Record<keyof EngineeringValues, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof EngineeringValues, string>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Set<string>>(new Set());
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (clearTimer.current) clearTimeout(clearTimer.current); }, []);

  // Track field diffs
  const diffKeys = (Object.keys(actual) as (keyof EngineeringValues)[]).filter(
    (key) => actual[key] !== estimated[key]
  );

  const clearDraft = (key: keyof EngineeringValues) =>
    setDraft((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });

  /** Same checks as the software: a positive number (a whole one for counts); Bolt Size not empty. */
  const validate = (field: FieldMeta, value: string): string | null => {
    if (field.type === "text") return value.trim() || field.allowBlank ? null : `${field.label} cannot be empty.`;
    const n = Number(value);
    if (value.trim() === "" || !Number.isFinite(n) || n <= 0) return `Invalid value '${value}' entered for '${field.label}'. Please enter a valid positive number.`;
    if (field.integer && !Number.isInteger(n)) return `${field.label} must be a whole number.`;
    return null;
  };

  const apply = async (call: () => Promise<{ job: JobDetail; notice?: string | null }>) => {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    setNotice(null);
    const before = estimated;
    try {
      const { job, notice: n } = await call();
      const after = job.engineeringData?.estimated;
      if (after) {
        const changed = (Object.keys(after) as (keyof EngineeringValues)[]).filter((k) => after[k] !== before[k]);
        setUpdated(new Set(changed));
        if (clearTimer.current) clearTimeout(clearTimer.current);
        clearTimer.current = setTimeout(() => setUpdated(new Set()), 3000);
      }
      setDraft({});
      if (n) setNotice(n);
      onUpdated?.(job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not recalculate.");
      if (err instanceof ApiFieldError) setFieldErrors(err.fieldErrors as typeof fieldErrors);
      setDraft({});                                           // the field goes back to the last accepted value, as in the software
    } finally {
      setBusy(false);
    }
  };

  /** Enter / leaving the field: send the edit, the server cascades it and every connected value comes back. */
  const commit = (field: FieldMeta) => {
    const value = draft[field.key];
    if (value === undefined || busy || !jobId) return;
    const current = String(estimated[field.key]);
    const same = field.type === "text" ? value.trim() === current || (field.allowBlank === true && value.trim() === "" && current === String(actual[field.key])) : Number(value) === Number(current) && value.trim() !== "";
    if (same) {
      clearDraft(field.key);
      return;
    }
    const problem = validate(field, value);
    if (problem) {
      setError(problem);
      setFieldErrors({ [field.key]: problem });
      clearDraft(field.key);
      return;
    }
    void apply(() => editEstimated(jobId, { key: field.key, value: value.trim() }));
  };

  const handleResetToActual = () => {
    if (!jobId) return;
    void apply(() => editEstimated(jobId, { reset: true }));
  };

  const rowsOf = (cat: CategoryGroup): EstimatedRow[] =>
    cat.fields.map((f) => ({
      key: f.key,
      label: f.label,
      unit: f.unit,
      description: f.description,
      actual: String(actual[f.key]),
      estimated: String(estimated[f.key]),
      editable: f.editable !== false,
      numeric: f.type === "number",
    }));
  const fieldOf = (key: string) => CATEGORIES.flatMap((c) => c.fields).find((f) => f.key === key)!;

  return (
    <div className="engineering-data-view">
      <EstimatedNoticeCard />

      {live && <EstimatedBanner busy={busy} busyText="Recalculating the connected values…" error={error} notice={notice} disabled={disabled} />}

      <EstimatedToolbar diffCount={diffKeys.length} canReset={diffKeys.length > 0 && live && !busy && !disabled} onReset={handleResetToActual} />

      <div className="categories-stack">
        {CATEGORIES.map((cat) => (
          <EstimatedCategoryCard
            key={cat.id}
            title={cat.title}
            description={cat.description}
            rows={rowsOf(cat)}
            draft={draft}
            errors={fieldErrors}
            updated={updated}
            live={live && !disabled}
            busy={busy}
            same={(a, b) => a === b}
            onChange={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
            onCommit={(row) => commit(fieldOf(row.key))}
            onCancel={(key) => clearDraft(key as keyof EngineeringValues)}
          />
        ))}
      </div>
    </div>
  );
}
