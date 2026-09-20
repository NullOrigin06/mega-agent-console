import { useState, useMemo } from "react";
import type { BomRow } from "../../types/engineering";
import { IconDownload, IconSearch, IconInfo, IconFileText } from "../common/Icon";

interface BomViewProps {
  bom?: BomRow[];
  jobId: string;
}

export function BomView({ bom = [], jobId }: BomViewProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredBom = useMemo(() => {
    if (!searchQuery.trim()) return bom;
    const q = searchQuery.toLowerCase().trim();
    return bom.filter(
      (row) =>
        row.itemNo.toLowerCase().includes(q) ||
        row.description.toLowerCase().includes(q) ||
        row.moc.toLowerCase().includes(q) ||
        row.dimension.toLowerCase().includes(q) ||
        row.remark.toLowerCase().includes(q)
    );
  }, [bom, searchQuery]);

  const totalWeight = useMemo(() => {
    return bom.reduce((sum, row) => sum + (row.weightKg || 0), 0);
  }, [bom]);

  const totalQuantity = useMemo(() => {
    return bom.reduce((sum, row) => sum + (row.qty || 0), 0);
  }, [bom]);

  const uniqueMaterials = useMemo(() => {
    const set = new Set(bom.map((r) => r.moc).filter(Boolean));
    return Array.from(set);
  }, [bom]);

  const handleExportCsv = () => {
    if (bom.length === 0) return;
    const headers = [
      "Item No",
      "Description",
      "Material of Construction (MOC)",
      "Dimension",
      "Quantity",
      "Weight (kg)",
      "Remark",
    ];
    const csvRows = bom.map((r) => [
      `"${r.itemNo}"`,
      `"${r.description}"`,
      `"${r.moc}"`,
      `"${r.dimension}"`,
      r.qty,
      r.weightKg.toFixed(2),
      `"${r.remark || "-"}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...csvRows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `BOM_${jobId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (bom.length === 0) {
    return (
      <div className="empty-state-card">
        <IconFileText size={48} className="empty-icon text-dim" />
        <h4 className="empty-title">No Bill of Materials Available</h4>
        <p className="empty-text">
          BOM generation is finalized once CAD synthesis reaches 100% completion.
        </p>
      </div>
    );
  }

  return (
    <div className="bom-view">
      {/* Metric summary banner */}
      <div className="bom-metrics-grid">
        <div className="bom-metric-card">
          <span className="bom-metric-label">Line Items</span>
          <span className="bom-metric-value text-mono">{bom.length}</span>
          <span className="bom-metric-sub">Components cataloged</span>
        </div>
        <div className="bom-metric-card">
          <span className="bom-metric-label">Total Unit Count</span>
          <span className="bom-metric-value text-mono">{totalQuantity}</span>
          <span className="bom-metric-sub">Individual parts</span>
        </div>
        <div className="bom-metric-card">
          <span className="bom-metric-label">Total Net Weight</span>
          <span className="bom-metric-value text-mono">
            {totalWeight.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{" "}
            <span className="unit-dim">kg</span>
          </span>
          <span className="bom-metric-sub">
            ≈ {(totalWeight / 1000).toFixed(2)} metric tons
          </span>
        </div>
        <div className="bom-metric-card">
          <span className="bom-metric-label">Metallurgies</span>
          <span className="bom-metric-value text-mono">
            {uniqueMaterials.length}
          </span>
          <span className="bom-metric-sub">Unique MOC grades</span>
        </div>
      </div>

      {/* Toolbar: Search and Export */}
      <div className="bom-toolbar">
        <div className="search-box">
          <IconSearch size={16} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search BOM items, materials, dimensions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchQuery("")}
            >
              ×
            </button>
          )}
        </div>

        <div className="bom-toolbar-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleExportCsv}
            title="Download BOM as CSV spreadsheet"
          >
            <IconDownload size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* BOM Table */}
      <div className="table-card">
        <table className="data-table bom-table" aria-label="Bill of Materials">
          <thead>
            <tr>
              <th style={{ width: "60px" }}>Item</th>
              <th>Description</th>
              <th>Material of Construction (MOC)</th>
              <th>Dimensions</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Weight (kg)</th>
              <th>Remark</th>
            </tr>
          </thead>
          <tbody>
            {filteredBom.map((row) => (
              <tr key={row.itemNo} className="data-row">
                <td className="text-mono font-medium">{row.itemNo}</td>
                <td>
                  <strong className="text-white">{row.description}</strong>
                </td>
                <td>
                  <span className="moc-tag text-mono">{row.moc}</span>
                </td>
                <td className="text-mono text-dim">{row.dimension}</td>
                <td className="text-mono text-right font-medium">{row.qty}</td>
                <td className="text-mono text-right font-medium text-accent">
                  {row.weightKg.toFixed(1)}
                </td>
                <td className="text-dim text-sm">{row.remark || "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bom-total-row">
              <td colSpan={4} className="text-right font-bold text-white">
                Total Calculated BOM Net Weight:
              </td>
              <td className="text-right font-bold text-mono text-white">
                {totalQuantity}
              </td>
              <td className="text-right font-bold text-mono text-success">
                {totalWeight.toFixed(1)} kg
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Architectural normalization notice */}
      <div className="table-note">
        <IconInfo size={14} />
        <span>
          <strong>Display Note:</strong> This Bill of Materials uses a normalized presentation format
          customized for the Mega Agent Console UI. In the underlying .NET engine, each engineering module
          creates independent BOM structures.
        </span>
      </div>
    </div>
  );
}
