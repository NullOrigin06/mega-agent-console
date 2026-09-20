import { useState } from "react";
import type { EngineeringDataModel, EngineeringValues } from "../../types/engineering";
import { IconInfo, IconRefresh } from "../common/Icon";

interface EngineeringDataViewProps {
  initialData: EngineeringDataModel;
}

interface FieldMeta {
  key: keyof EngineeringValues;
  label: string;
  unit: string;
  type: "number" | "text";
  description: string;
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
      { key: "shellID", label: "Shell ID", unit: "mm", type: "number", description: "Nominal inner diameter of shell" },
      { key: "flangeID", label: "Flange ID", unit: "mm", type: "number", description: "Body flange inner diameter" },
      { key: "tubeSheetFinishOD", label: "Tube Sheet Finish OD", unit: "mm", type: "number", description: "Finished machined outer diameter" },
      { key: "tubeSheetRawOD", label: "Tube Sheet Raw OD", unit: "mm", type: "number", description: "Pre-machined raw plate outer diameter" },
      { key: "linerGasketOD", label: "Liner Gasket OD", unit: "mm", type: "number", description: "Outer diameter of sealing gasket liner" },
      { key: "baffleOD", label: "Baffle OD", unit: "mm", type: "number", description: "Transverse baffle outer diameter" },
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
      { key: "noOfBolts", label: "Number of Bolts", unit: "qty", type: "number", description: "Total bolt circle count" },
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
      { key: "bonnetShellTHK", label: "Bonnet Shell THK", unit: "mm", type: "number", description: "Channel cylindrical shell thickness" },
      { key: "dishendTHK", label: "Dish End THK", unit: "mm", type: "number", description: "Formed dished head nominal thickness" },
    ],
  },
  {
    id: "internal",
    title: "Tubes, Tie Rods & Spacers",
    description: "Internal bundle components holding the tube array in place",
    fields: [
      { key: "tubeQty", label: "Active Tube Count", unit: "tubes", type: "number", description: "Total number of heat transfer tubes" },
      { key: "tieRodDia", label: "Tie Rod Diameter", unit: "mm", type: "number", description: "Skeleton tie rod bar diameter" },
      { key: "tieRodQty", label: "Tie Rod Quantity", unit: "rods", type: "number", description: "Quantity of longitudinal tie rods" },
      { key: "spacerTube", label: "Spacer Tube", unit: "mm", type: "number", description: "Distance sleeve between baffle plates" },
    ],
  },
];

export function EngineeringDataView({ initialData }: EngineeringDataViewProps) {
  // Local state for estimated values (authoritative & editable)
  const [estimated, setEstimated] = useState<EngineeringValues>({
    ...initialData.estimated,
  });
  // Actual values are strictly read-only baseline snapshots
  const actual = initialData.actual;

  // Track field diffs
  const diffKeys = (Object.keys(actual) as (keyof EngineeringValues)[]).filter(
    (key) => actual[key] !== estimated[key]
  );

  const handleFieldChange = (
    key: keyof EngineeringValues,
    value: string,
    type: "number" | "text"
  ) => {
    setEstimated((prev) => ({
      ...prev,
      [key]: type === "number" ? (value === "" ? 0 : Number(value)) : value,
    }));
  };

  const handleResetToActual = () => {
    setEstimated({ ...actual });
  };

  return (
    <div className="engineering-data-view">
      {/* Plain language semantic explanation banner */}
      <div className="semantic-notice-card">
        <div className="notice-icon">
          <IconInfo size={20} />
        </div>
        <div className="notice-content">
          <h4 className="notice-title">
            Understanding Actual vs. Estimated Values
          </h4>
          <p className="notice-text">
            <strong>Estimated overrides Actual for CAD & BOM generation.</strong> In
            the engineering engine, <code>actual</code> is the immutable baseline
            reference captured from initial design sheets, while{" "}
            <code>estimated</code> is the <strong>authoritative value</strong> used for
            all downstream calculations, 3D modeling, and drawings. You can edit the
            Estimated fields below to override parameters for this run.
          </p>
        </div>
      </div>

      {/* Action bar */}
      <div className="values-toolbar">
        <div className="diff-counter">
          {diffKeys.length > 0 ? (
            <span className="diff-pill diff-pill-active">
              ● {diffKeys.length} field{diffKeys.length === 1 ? "" : "s"} modified from
              Actual baseline
            </span>
          ) : (
            <span className="diff-pill">✓ Estimated matches Actual baseline</span>
          )}
        </div>

        <div className="toolbar-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleResetToActual}
            disabled={diffKeys.length === 0}
            title="UI convenience: resets local Estimated inputs to match Actual baseline"
          >
            <IconRefresh size={14} />
            <span>Reset Estimated to Actual</span>
          </button>
        </div>
      </div>

      {/* Categorized Comparison Cards */}
      <div className="categories-stack">
        {CATEGORIES.map((cat) => (
          <section key={cat.id} className="category-card">
            <div className="category-header">
              <div>
                <h3 className="category-title">{cat.title}</h3>
                <p className="category-desc">{cat.description}</p>
              </div>
            </div>

            <div className="fields-table-wrapper">
              <table className="values-table">
                <thead>
                  <tr>
                    <th className="th-field">Parameter</th>
                    <th className="th-actual">
                      Actual
                      <span className="th-sub">Baseline Reference (Read-Only)</span>
                    </th>
                    <th className="th-estimated">
                      Estimated
                      <span className="th-sub">Authoritative (Editable)</span>
                    </th>
                    <th className="th-status">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {cat.fields.map((field) => {
                    const actualVal = actual[field.key];
                    const estVal = estimated[field.key];
                    const isDiff = actualVal !== estVal;

                    return (
                      <tr
                        key={field.key}
                        className={`value-row ${isDiff ? "value-row-diff" : ""}`}
                      >
                        <td className="field-info-cell">
                          <div className="field-label-group">
                            <span className="field-name">{field.label}</span>
                            <span className="field-code">{field.key}</span>
                          </div>
                          <span className="field-desc">{field.description}</span>
                        </td>

                        {/* Read-Only Actual Value */}
                        <td className="actual-val-cell">
                          <div className="readonly-val-badge">
                            <span className="text-mono">{String(actualVal)}</span>
                            {field.unit && (
                              <span className="unit-label">{field.unit}</span>
                            )}
                          </div>
                        </td>

                        {/* Editable Estimated Value */}
                        <td className="estimated-val-cell">
                          <div className="estimated-input-wrapper">
                            <input
                              type={field.type === "number" ? "number" : "text"}
                              step="any"
                              className={`estimated-input text-mono ${isDiff ? "estimated-input-modified" : ""}`}
                              value={estVal}
                              onChange={(e) =>
                                handleFieldChange(
                                  field.key,
                                  e.target.value,
                                  field.type
                                )
                              }
                              title={`Edit estimated ${field.label}`}
                            />
                            {field.unit && (
                              <span className="input-unit-tag">
                                {field.unit}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Status / Diff indicator */}
                        <td className="diff-cell">
                          {isDiff ? (
                            <span
                              className="badge-diff"
                              title={`Baseline is ${actualVal}`}
                            >
                              Modified
                            </span>
                          ) : (
                            <span className="badge-match">Match</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
