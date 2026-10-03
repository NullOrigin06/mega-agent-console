import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { REFERENCE_GA_SPEC as spec } from "../gaSpec";
import {
  baffleGeometry,
  boltInstances,
  flangeStackGeometry,
  headShellGeometry,
  lugPlacements,
  mainShellGeometry,
  nozzleParts,
  saddleGeometry,
  trunnionGeometry,
} from "../gaGeometry";

const box = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  return g.boundingBox!;
};

describe("GA geometry builders (no WebGL needed)", () => {
  it("heads reach the outer apex and the shell spans the tube sheets", () => {
    const front = box(headShellGeometry(spec, "front"));
    expect(front.min.x).toBeCloseTo(spec.layout.apexFrontOuter, 1);
    expect(front.max.y).toBeCloseTo(spec.ro, 1);
    const rear = box(headShellGeometry(spec, "rear"));
    expect(rear.max.x).toBeCloseTo(spec.layout.apexRearOuter, 1);
    const main = box(mainShellGeometry(spec));
    expect(main.min.x).toBeCloseTo(22, 3);
    expect(main.max.x).toBeCloseTo(2996 - 25, 3);
  });

  it("body flanges and tube sheets are OD ID+160 and 40 / 30 thick", () => {
    const f = flangeStackGeometry(spec, "front");
    const fb = box(f.flange);
    expect(fb.max.y).toBeCloseTo(540, 3);
    expect(fb.min.x).toBeCloseTo(-47, 3);
    expect(fb.max.x).toBeCloseTo(-7, 3);
    const tb = box(f.tubeSheet);
    expect(tb.min.x).toBeCloseTo(0, 3);
    expect(tb.max.x).toBeCloseTo(30, 3);
    const b = boltInstances(spec);
    expect(b.studs).toHaveLength(spec.boltCount * 2);
    expect(b.nuts).toHaveLength(spec.boltCount * 4);
  });

  it("saddle base sits at the specified depth below the axis", () => {
    const g = box(saddleGeometry(spec, spec.saddles[0]));
    expect(g.min.y).toBeCloseTo(-spec.saddles[0].baseDepth, 3);
    expect(g.max.z).toBeCloseTo(435, 1);
    const g2 = box(saddleGeometry(spec, spec.saddles[1]));
    expect(g2.min.y).toBeCloseTo(-spec.saddles[1].baseDepth, 3);
  });

  it("trunnion flange face is 157.58 mm outside the shell, on the requested side", () => {
    const pos = box(trunnionGeometry(spec, 1));
    expect(pos.max.z).toBeGreaterThan(spec.ro + 150);
    expect(pos.min.z).toBeGreaterThan(0);
    const neg = box(trunnionGeometry(spec, -1));
    expect(neg.min.z).toBeLessThan(-(spec.ro + 150));
  });

  it("nozzles reach their flange face; N3 carries the capped spool", () => {
    const n3 = spec.nozzles.find((n) => n.id === "N3")!;
    const parts = nozzleParts(n3, spec.ro);
    expect(parts.bolts).not.toBeNull();
    expect(box(parts.steel).max.y).toBeCloseTo(n3.reachR, 3);
    const n4 = spec.nozzles.find((n) => n.id === "N4")!;
    expect(box(nozzleParts(n4, spec.ro).steel).max.y).toBeCloseTo(n4.faceR, 3);
    const n6 = spec.nozzles.find((n) => n.id === "N6")!;
    const coupling = nozzleParts(n6, spec.ro);
    expect(coupling.paint).toBeNull();
    expect(box(coupling.steel).max.y).toBeCloseTo(n6.reachR, 3);
  });

  it("baffles keep the top or the bottom segment; lugs stand on the dome", () => {
    const top = box(baffleGeometry(spec, true));
    expect(top.max.y).toBeGreaterThan(400);
    expect(top.min.y).toBeCloseTo(spec.ri - spec.baffleHeight, 0);
    const bottom = box(baffleGeometry(spec, false));
    expect(bottom.min.y).toBeLessThan(-400);
    expect(bottom.max.y).toBeCloseTo(spec.baffleHeight - spec.ri, 0);
    const lugs = lugPlacements(spec);
    expect(lugs).toHaveLength(3);
    expect(lugs.filter((l) => l.x < 0)).toHaveLength(1);
  });
});
