import type { NozzleItem } from "../types/engineering";

/**
 * Mirrors MegaEngineeringSuite.ApprovedNozzleData (NozzleItem.cs) exactly —
 * the same dropdown vocabularies and default schedule Form3 itself uses
 * (PopulateNozzleGrid on load). Keep in sync if the desktop source changes.
 */
export const NOZZLE_NUMBERS = [
  "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9", "N10",
];

export const NOZZLE_SIZES = [
  "15", "20", "25", "40", "50", "65", "80", "100", "125", "150", "200", "250", "300",
];

/** General Arrangement drawings also carry the large vapour nozzles (flange table of the generator goes to 500 NB). */
export const NOZZLE_SIZES_GA = [...NOZZLE_SIZES, "350", "400", "450", "500"];

export const NOZZLE_UNITS = ["NB", "OD", "mm"];

export const NOZZLE_SCHEDULES = ["Sch 10S", "Sch 40S", "Sch 40", "Sch 80S", "Sch 80"];

export const NOZZLE_TYPES = ["WNRF", "SORF", "BLRF", "LJFF", "LJFF M", "LJFF B", "LJFF X"];

export const NOZZLE_RATINGS = ["150#", "300#", "600#"];

export function getDefaultNozzleSchedule(): NozzleItem[] {
  return [
    { nozzleNo: "N1", size: "100", unit: "NB", schedule: "Sch 40", type: "LJFF", rating: "150#", projection: "250", service: "Process In", orientation: "0°", remark: "-" },
    { nozzleNo: "N2", size: "100", unit: "NB", schedule: "Sch 40", type: "LJFF", rating: "150#", projection: "250", service: "Process Out", orientation: "180°", remark: "-" },
    { nozzleNo: "N3", size: "80", unit: "NB", schedule: "Sch 40", type: "LJFF", rating: "150#", projection: "200", service: "Utility In", orientation: "90°", remark: "-" },
    { nozzleNo: "N4", size: "80", unit: "NB", schedule: "Sch 40", type: "LJFF", rating: "150#", projection: "200", service: "Utility Out", orientation: "270°", remark: "-" },
    { nozzleNo: "N5", size: "25", unit: "NB", schedule: "Sch 40S", type: "LJFF", rating: "150#", projection: "150", service: "Vent", orientation: "TOP", remark: "-" },
    { nozzleNo: "N6", size: "25", unit: "NB", schedule: "Sch 40S", type: "LJFF", rating: "150#", projection: "150", service: "Vapour Out", orientation: "BOTTOM", remark: "-" },
    { nozzleNo: "N7", size: "50", unit: "NB", schedule: "Sch 40", type: "LJFF", rating: "150#", projection: "200", service: "Pressure Relief", orientation: "TOP", remark: "-" },
    { nozzleNo: "N8", size: "40", unit: "NB", schedule: "Sch 40", type: "LJFF", rating: "150#", projection: "180", service: "Drain", orientation: "BOTTOM", remark: "-" },
    { nozzleNo: "N9", size: "25", unit: "NB", schedule: "Sch 40", type: "LJFF", rating: "150#", projection: "150", service: "Instrument", orientation: "0°", remark: "-" },
    { nozzleNo: "N10", size: "25", unit: "NB", schedule: "Sch 40S", type: "LJFF", rating: "150#", projection: "150", service: "Level Gauge", orientation: "TOP", remark: "-" },
  ];
}

/**
 * Starting schedule for a General Arrangement: the reference condenser (25-005-GAD-EX-1405), so a first run
 * reproduces the reference drawing. Position is left blank - N1-N7 then use the reference positions.
 * Projection is the distance from the shell CENTRE to the flange face (as in the nozzle schedule header).
 */
export function getDefaultGaNozzleSchedule(): NozzleItem[] {
  const n = (nozzleNo: string, size: string, schedule: string, projection: string, service: string, orientation: string): NozzleItem => ({
    nozzleNo, size, unit: "NB", schedule, type: "LJFF", rating: "150#", projection, service, orientation, remark: "-", position: "",
  });
  return [
    n("N1", "250", "Sch 10S", "615", "Cooling Water In", "BOTTOM"),
    n("N2", "250", "Sch 10S", "615", "Cooling Water Out", "TOP"),
    n("N3", "500", "Sch 10S", "635", "Vapour Inlet", "TOP"),
    n("N4", "150", "Sch 10S", "615", "Vapour Out To Cond. II", "TOP"),
    n("N5", "65", "Sch 10S", "615", "Condensate Outlet", "BOTTOM"),
    n("N6", "15", "Sch 40S", "150", "Tube Side Vent", "TOP"),
    n("N7", "15", "Sch 40S", "150", "Tube Side Drain", "BOTTOM"),
  ];
}

export function createBlankNozzle(nextNozzleNo: string): NozzleItem {
  return {
    nozzleNo: nextNozzleNo,
    size: NOZZLE_SIZES[0],
    unit: "NB",
    schedule: NOZZLE_SCHEDULES[0],
    type: NOZZLE_TYPES[0],
    rating: NOZZLE_RATINGS[0],
    projection: "",
    service: "",
    orientation: "0°",
    remark: "-",
    position: "",
  };
}
