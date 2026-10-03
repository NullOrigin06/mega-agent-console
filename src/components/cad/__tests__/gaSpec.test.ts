import { describe, expect, it } from "vitest";
import type { JobDetail, NozzleItem } from "../../../types/engineering";
import { sampleEngineeringData } from "../../../mocks/fixtures";
import { getDefaultGaNozzleSchedule } from "../../../constants/nozzleDefaults";
import {
  REFERENCE_GA_SPEC,
  buildGaSpec,
  flangeFor,
  gaSpecFromJob,
  headCurve,
  headProfile,
  headRadiusAtApexDistance,
  parseNumber,
  resolveNozzles,
  resolvePlacements,
  tieRodLayout,
  tubeLayout,
} from "../gaSpec";

const noz = (nozzleNo: string, size: string, orientation: string, position = "", extra: Partial<NozzleItem> = {}): NozzleItem => ({
  nozzleNo,
  size,
  unit: "NB",
  schedule: "Sch 10S",
  type: "LJFF",
  rating: "150#",
  projection: "",
  service: "",
  orientation,
  remark: "-",
  position,
  ...extra,
});

describe("parseNumber", () => {
  it("keeps digits and dots like GadParameters.ParseNumber", () => {
    expect(parseNumber("250")).toBe(250);
    expect(parseNumber("NB 65")).toBe(65);
    expect(parseNumber("1.2.3")).toBe(0);
    expect(parseNumber("SEE DRG")).toBe(0);
    expect(parseNumber("")).toBe(0);
    expect(parseNumber(undefined)).toBe(0);
  });
});

describe("nozzle placement (GadParameters.ResolvePlacements)", () => {
  it("uses the reference position for N1-N7 when Position is blank", () => {
    const { placements, skipped } = resolvePlacements(getDefaultGaNozzleSchedule());
    expect(skipped).toEqual([]);
    const by = Object.fromEntries(placements.map((p) => [p.nozzleNo, p]));
    expect(by.N1).toMatchObject({ axisX: -307, side: "BOTTOM" });
    expect(by.N2).toMatchObject({ axisX: -307, side: "TOP" });
    expect(by.N3).toMatchObject({ axisX: 2521.48, side: "TOP" });
    expect(by.N4).toMatchObject({ axisX: 250, side: "TOP" });
    expect(by.N5).toMatchObject({ axisX: 175, side: "BOTTOM" });
    expect(by.N6).toMatchObject({ axisX: 3128, side: "TOP" });
    expect(by.N7).toMatchObject({ axisX: 3128, side: "BOTTOM" });
  });

  it("an explicit position wins over the reference one", () => {
    const [p] = resolvePlacements([noz("N3", "500", "TOP", "1800")]).placements;
    expect(p.axisX).toBe(1800);
    expect(resolveNozzles([noz("N3", "500", "TOP", "1800")])[0].source).toBe("explicit");
    // not a number -> falls back to the reference position
    expect(resolvePlacements([noz("N3", "500", "TOP", "abc")]).placements[0].axisX).toBe(2521.48);
  });

  it("spaces other nozzles automatically from 250 with step max(350, NB*1.4+150)", () => {
    const list = [noz("A", "100", "TOP"), noz("B", "300", "TOP"), noz("C", "50", "BOTTOM"), noz("D", "500", "TOP")];
    const xs = resolvePlacements(list).placements.map((p) => p.axisX);
    // steps: 100 -> 350, 300 -> 570, 50 -> 350
    expect(xs).toEqual([250, 600, 1170, 1520]);
  });

  it("parses the side: TOP / BOTTOM / 90 / 270, else reference side, else top", () => {
    const sides = (o: string, no = "X1") => resolvePlacements([noz(no, "100", o)]).placements[0].side;
    expect(sides("TOP")).toBe("TOP");
    expect(sides("Bottom")).toBe("BOTTOM");
    expect(sides("90°")).toBe("TOP");
    expect(sides("270 deg")).toBe("BOTTOM");
    expect(sides("", "N5")).toBe("BOTTOM"); // reference side
    expect(sides("sideways")).toBe("TOP");
  });

  it("leaves 0 / 180 deg nozzles off the drawing but models them sideways, without moving the drawn ones", () => {
    const list = [noz("A", "100", "0°"), noz("B", "100", "TOP"), noz("C", "100", "180"), noz("D", "100", "TOP")];
    const { placements, skipped } = resolvePlacements(list);
    expect(skipped).toEqual(["A", "C"]);
    expect(placements.map((p) => p.axisX)).toEqual([250, 600]);
    const all = resolveNozzles(list);
    expect(all.map((r) => r.nozzle.nozzleNo)).toEqual(["A", "B", "C", "D"]);
    expect(all[0].side).toBe("FRONT");
    expect(all[2].side).toBe("BACK");
    expect(all[0].axisX).toBeGreaterThan(600); // after the drawn ones
  });
});

describe("head profile (GadHeadProfile)", () => {
  it("ID 920: outer apex is 183.27 mm beyond the knuckle start", () => {
    const outer = headProfile(465, 925, 97);
    expect(outer.depth).toBeCloseTo(183.27, 2);
    expect(REFERENCE_GA_SPEC.headOuter.depth).toBeCloseTo(183.27, 2);
  });

  it("the dome curve runs from the shell radius to the axis and is continuous", () => {
    const p = REFERENCE_GA_SPEC.headOuter;
    const pts = headCurve(p);
    expect(pts[0][0]).toBeCloseTo(0, 6);
    expect(pts[0][1]).toBeCloseTo(465, 6);
    const last = pts[pts.length - 1];
    expect(last[0]).toBeCloseTo(p.depth, 6);
    expect(last[1]).toBeCloseTo(0, 6);
    for (let i = 1; i < pts.length; i++) {
      expect(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])).toBeLessThan(60);
    }
    const r = headRadiusAtApexDistance(p, 100);
    expect(r).toBeGreaterThan(300);
    expect(r).toBeLessThan(465);
  });
});

describe("reference vessel layout", () => {
  const s = REFERENCE_GA_SPEC;
  it("matches the reference drawing numbers", () => {
    expect(s.shellId).toBe(920);
    expect(s.ro).toBe(465);
    expect(s.faceToFace).toBe(2996); // tubeLength 3000 - 4
    expect(s.flangeOD).toBe(1080);
    expect(s.boltPCD).toBe(1020);
    expect(s.flangeThk).toBe(40);
    expect(s.crown).toBe(920);
    expect(s.knuckle).toBeCloseTo(92, 6);
    expect(s.layout.xtFront).toBe(-528);
    expect(s.layout.xtRear).toBeCloseTo(2996 + 252.83, 6);
    expect(s.layout.xsFront).toBe(-553);
    expect(s.layout.xsRear).toBeCloseTo(2996 + 252.83 + 25, 6);
  });

  it("places the saddles 448 mm from each tube-sheet face with 725.64 / 750.64 below the shell OD", () => {
    const [ss, fs] = s.saddles;
    expect(ss.cl).toBe(448);
    expect(fs.cl).toBe(2996 - 448);
    expect(ss.heightBelowShell).toBeCloseTo(725.64, 6);
    expect(fs.heightBelowShell).toBeCloseTo(750.64, 6);
    expect(ss.baseDepth).toBeCloseTo(465 + 725.64, 6);
    expect(fs.baseDepth).toBeCloseTo(465 + 750.64, 6);
    expect(ss.baseElevWidth).toBe(150);
    expect(ss.baseWidth).toBe(870); // ID - 50
    expect(ss.webWidth).toBe(810); // ~0.88 x ID
    expect(ss.anchorCC).toBe(750);
    expect(ss.ribOuterSpacing).toBe(550);
  });

  it("has 5 baffles at pitch 425 (first at 440) and the trunnion / lug data", () => {
    expect(s.baffleX).toEqual([440, 865, 1290, 1715, 2140]);
    expect(s.trunnion.nb).toBe(100);
    expect(s.trunnion.faceR).toBeCloseTo(465 + 157.58, 6);
    expect(s.lugsFront).toBe(1);
    expect(s.lugsRear).toBe(2);
  });

  it("models the seven reference nozzles with the generator rules", () => {
    const by = Object.fromEntries(s.nozzles.map((n) => [n.id, n]));
    expect(Object.keys(by)).toHaveLength(7);
    expect(by.N3.counterFlange).toBe(true);
    expect(by.N3.faceR).toBe(635);
    expect(by.N3.outerR).toBe(635 + 3 + 150 + 26);
    expect(by.N1.counterFlange).toBe(false);
    expect(by.N1.kind).toBe("flanged");
    expect(by.N1.dir).toEqual([0, -1, 0]);
    expect(by.N6.kind).toBe("coupling");
    expect(by.N7.kind).toBe("coupling");
    expect(by.N6.reachR).toBeCloseTo(465 + 56.8, 6);
    expect(by.N4.faceR).toBe(615);
    // projection <= shell outer radius -> outer radius + 150
    expect(buildGaSpec({ nozzles: [noz("X", "100", "TOP", "", { projection: "150" })] }).nozzles[0].faceR).toBe(465 + 150);
  });

  it("clamps absurd positions to the vessel and skips nozzles without a size", () => {
    const spec = buildGaSpec({ nozzles: [noz("A", "100", "TOP", "99999"), noz("B", "", "TOP")] });
    expect(spec.nozzles[0].axisX).toBe(99999);
    expect(spec.nozzles[0].clamped).toBe(true);
    expect(spec.nozzles[0].drawX).toBeCloseTo(spec.layout.xtRear, 6);
    expect(spec.skipped).toEqual(["B"]);
  });
});

describe("flange table", () => {
  it("looks up B16.5 class 150 envelopes", () => {
    const f = flangeFor(250);
    expect(f).toMatchObject({ pipeOD: 273.05, flangeOD: 406.4, thk: 32, raisedFaceOD: 323.9, pcd: 361.9, holeCount: 12, approximate: false });
    expect(flangeFor(500).holeCount).toBe(20);
    expect(flangeFor(100).holeCount).toBe(8);
    expect(flangeFor(65).holeCount).toBe(4);
    expect(flangeFor(150).raisedFaceH).toBe(3.4);
  });
  it("scales sizes off the table from the nearest row", () => {
    const f = flangeFor(90);
    expect(f.approximate).toBe(true);
    expect(f.flangeOD).toBeGreaterThan(flangeFor(80).flangeOD);
  });
});

describe("gaSpecFromJob", () => {
  const job = (over: Partial<JobDetail> = {}): JobDetail => ({
    id: "job-ga-1",
    module: "GeneralArrangement",
    shellId: 1000,
    status: "completed",
    createdAt: "2026-10-01T00:00:00Z",
    drawingStatus: "not_generated",
    engineeringData: {
      ...sampleEngineeringData,
      shellID: 1000,
      tubeLength: 4000,
      actual: { ...sampleEngineeringData.actual, shellID: 1000 },
      estimated: { ...sampleEngineeringData.estimated, shellID: 1000 },
      nozzles: [noz("N1", "250", "TOP")],
    },
    ...over,
  });

  it("builds from the job's engineering data and nozzles", () => {
    const spec = gaSpecFromJob(job())!;
    expect(spec.jobId).toBe("job-ga-1");
    expect(spec.shellId).toBe(1000);
    expect(spec.faceToFace).toBe(3996);
    expect(spec.nozzles).toHaveLength(1);
    expect(spec.saddles[1].cl).toBe(3996 - 448);
  });

  it("returns null without engineering data and falls back to the reference values", () => {
    expect(gaSpecFromJob(job({ engineeringData: undefined }))).toBeNull();
    const spec = buildGaSpec({});
    expect(spec.shellId).toBe(920);
    expect(spec.faceToFace).toBe(2996);
    expect(spec.shellThk).toBe(5);
  });
});

describe("internals layout", () => {
  it("fits the tube field inside the shell and caps the instance count", () => {
    const tubes = tubeLayout(REFERENCE_GA_SPEC);
    expect(tubes.length).toBeGreaterThan(300);
    expect(tubes.length).toBeLessThanOrEqual(900);
    for (const [y, z] of tubes) expect(Math.hypot(y, z)).toBeLessThan(REFERENCE_GA_SPEC.ri);
    expect(tubeLayout(buildGaSpec({ tubeQty: 100 }))).toHaveLength(100);
    expect(tieRodLayout(REFERENCE_GA_SPEC)).toHaveLength(4);
  });
});
