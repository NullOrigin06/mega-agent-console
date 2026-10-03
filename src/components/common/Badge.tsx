import type { JobStatus, ModuleKind } from "../../types/engineering";
import {
  IconCheckCircle,
  IconClock,
  IconAlertTriangle,
  IconLoader,
  IconDisc,
  IconCylinder,
  IconLayers,
} from "./Icon";

export function StatusBadge({ status }: { status: JobStatus }) {
  switch (status) {
    case "completed":
      return (
        <span className="badge badge-status badge-completed">
          <IconCheckCircle size={14} />
          <span>Completed</span>
        </span>
      );
    case "running":
      return (
        <span className="badge badge-status badge-running">
          <IconLoader size={14} className="badge-spin" />
          <span>Running</span>
        </span>
      );
    case "queued":
      return (
        <span className="badge badge-status badge-queued">
          <IconClock size={14} />
          <span>Queued</span>
        </span>
      );
    case "failed":
      return (
        <span className="badge badge-status badge-failed">
          <IconAlertTriangle size={14} />
          <span>Failed</span>
        </span>
      );
    default:
      return <span className="badge">{status}</span>;
  }
}

export function ModuleBadge({ module }: { module: ModuleKind }) {
  switch (module) {
    case "TubeSheet":
      return (
        <span className="badge badge-module badge-tubesheet">
          <IconDisc size={14} />
          <span>Tube Sheet</span>
        </span>
      );
    case "BonnetFlange":
      return (
        <span className="badge badge-module badge-bonnetflange">
          <IconCylinder size={14} />
          <span>Bonnet Flange</span>
        </span>
      );
    case "HeatExchangerFab":
      return (
        <span className="badge badge-module badge-heatexchangerfab">
          <IconLayers size={14} />
          <span>Heat Exchanger Fab</span>
        </span>
      );
    case "ShopTank":
      return (
        <span className="badge badge-module badge-tank">
          <IconCylinder size={14} />
          <span>Shop Tank</span>
        </span>
      );
    case "SiteTank":
      return (
        <span className="badge badge-module badge-tank">
          <IconLayers size={14} />
          <span>Site Tank</span>
        </span>
      );
    default:
      return <span className="badge">{module}</span>;
  }
}
