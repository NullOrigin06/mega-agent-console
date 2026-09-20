import type { EngineeringDataModel } from "../../types/engineering";
import { IconInfo } from "../common/Icon";

interface SpecsAndNozzlesViewProps {
  data: EngineeringDataModel;
}

export function SpecsAndNozzlesView({ data }: SpecsAndNozzlesViewProps) {
  const specs = [
    { label: "Shell Inner Diameter", value: `${data.shellID} mm`, desc: "Nominal cylindrical shell ID" },
    { label: "Heat Transfer Area (HTA)", value: `${data.hta} m²`, desc: "Total effective surface area" },
    { label: "Tube Outer Diameter (OD)", value: `${data.tubeOD} mm`, desc: "Nominal tube outside diameter" },
    { label: "Tube Wall Thickness (THK)", value: `${data.tubeTHK} mm`, desc: "Tube gauge thickness" },
    { label: "Tube Length", value: `${data.tubeLength} mm`, desc: "Straight tube length between sheets" },
    { label: "Tube Count", value: `${data.tubeQty} tubes`, desc: "Active count of installed tubes" },
    { label: "Number of Passes", value: `${data.noOfPass} pass`, desc: "Tube-side fluid flow passes" },
    { label: "Baffle Quantity", value: `${data.baffleQty} baffles`, desc: "Transverse segmental baffles" },
    { label: "Baffle Outer Diameter", value: `${data.baffleOD} mm`, desc: "Machined baffle disk diameter" },
    { label: "Shell & Tube Material", value: data.material, desc: "Base metallurgy designation" },
    { label: "Material Density", value: `${data.materialDensity} kg/dm³`, desc: "Volumetric density constant" },
    { label: "Girth Flange Bolt Size", value: `${data.boltSize} (${data.noOfBolts} bolts)`, desc: "Flange bolting specification" },
  ];

  return (
    <div className="specs-and-nozzles-view">
      {/* General Specifications Grid */}
      <section className="specs-section">
        <div className="section-header">
          <div>
            <h3 className="section-title">General Exchanger Design Specifications</h3>
            <p className="section-subtitle">
              Fundamental thermo-hydraulic and dimensional parameters loaded into this run
            </p>
          </div>
        </div>

        <div className="specs-grid">
          {specs.map((item, idx) => (
            <div key={idx} className="spec-card">
              <span className="spec-label">{item.label}</span>
              <span className="spec-value text-mono">{item.value}</span>
              <span className="spec-desc">{item.desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Nozzle Schedule */}
      <section className="nozzles-section">
        <div className="section-header">
          <div>
            <h3 className="section-title">Nozzle Schedule</h3>
            <p className="section-subtitle">
              Process connections, ratings, wall schedules, and orientation callouts
            </p>
          </div>
          <span className="badge badge-neutral">
            {data.nozzles.length} Nozzles Configured
          </span>
        </div>

        {data.nozzles.length === 0 ? (
          <div className="empty-state-card">
            <p className="empty-text">No nozzle records defined for this configuration.</p>
          </div>
        ) : (
          <div className="table-card">
            <table className="data-table nozzles-table">
              <thead>
                <tr>
                  <th>Nozzle No</th>
                  <th>Service</th>
                  <th>Size & Unit</th>
                  <th>Schedule</th>
                  <th>Type</th>
                  <th>Rating</th>
                  <th>Projection</th>
                  <th>Orientation</th>
                  <th>Remark</th>
                </tr>
              </thead>
              <tbody>
                {data.nozzles.map((nozzle, idx) => (
                  <tr key={idx} className="data-row">
                    <td>
                      <span className="badge-nozzle-no text-mono">
                        {nozzle.nozzleNo}
                      </span>
                    </td>
                    <td>
                      <strong className="text-white">{nozzle.service}</strong>
                    </td>
                    <td className="text-mono">
                      {nozzle.size} {nozzle.unit}
                    </td>
                    <td className="text-mono">{nozzle.schedule}</td>
                    <td>
                      <span className="type-tag">{nozzle.type}</span>
                    </td>
                    <td className="text-mono">{nozzle.rating}</td>
                    <td className="text-mono">{nozzle.projection} mm</td>
                    <td>
                      <span className="orientation-tag">{nozzle.orientation}</span>
                    </td>
                    <td className="text-dim text-sm">{nozzle.remark || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="table-note">
          <IconInfo size={14} />
          <span>
            Nozzle orientations and projections are mapped to ASME/TEMA nozzle clearance standards for vessel fabrication.
          </span>
        </div>
      </section>
    </div>
  );
}
