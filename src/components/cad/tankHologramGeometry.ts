import type { TankModuleKind } from "../../types/engineering";

/**
 * Wireframe geometry for the tank holograms (TankHologram), in model units
 * with +Y up and the tank axis vertical. Each polyline carries an emphasis
 * class: 0 = structure, 1 = silhouette/outline (brighter), 2 = detail (dimmer).
 * Proportions come from the workspace inputs so the hologram reshapes live.
 */
export type Vec3 = [number, number, number];
export interface Polyline {
  pts: Vec3[];
  cls: 0 | 1 | 2;
}

const TAU = Math.PI * 2;

function ring(r: number, y: number, n = 64, cls: Polyline["cls"] = 0): Polyline {
  const pts: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  return { pts, cls };
}

function line(a: Vec3, b: Vec3, cls: Polyline["cls"] = 0): Polyline {
  return { pts: [a, b], cls };
}

/** Vertical profile curve revolved at `count` meridian angles. */
function meridians(profile: Array<[number, number]>, count: number, cls: Polyline["cls"] = 0): Polyline[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * TAU;
    return { pts: profile.map(([r, y]) => [Math.cos(a) * r, y, Math.sin(a) * r] as Vec3), cls };
  });
}

function nozzle(at: Vec3, dir: Vec3, r: number, len: number): Polyline[] {
  // Neck (two rings + 4 lines) and flange ring, built in a local frame around `dir`.
  const [dx, dy, dz] = dir;
  const up: Vec3 = Math.abs(dy) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u: Vec3 = [dy * up[2] - dz * up[1], dz * up[0] - dx * up[2], dx * up[1] - dy * up[0]];
  const ul = Math.hypot(...u);
  const uu: Vec3 = [u[0] / ul, u[1] / ul, u[2] / ul];
  const v: Vec3 = [dy * uu[2] - dz * uu[1], dz * uu[0] - dx * uu[2], dx * uu[1] - dy * uu[0]];
  const circle = (c: Vec3, rr: number): Polyline => ({
    pts: Array.from({ length: 25 }, (_, i) => {
      const a = (i / 24) * TAU;
      return [c[0] + (uu[0] * Math.cos(a) + v[0] * Math.sin(a)) * rr, c[1] + (uu[1] * Math.cos(a) + v[1] * Math.sin(a)) * rr, c[2] + (uu[2] * Math.cos(a) + v[2] * Math.sin(a)) * rr] as Vec3;
    }),
    cls: 0,
  });
  const end: Vec3 = [at[0] + dx * len, at[1] + dy * len, at[2] + dz * len];
  const out = [circle(at, r), circle(end, r), circle(end, r * 1.8)];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    const o: Vec3 = [(uu[0] * Math.cos(a) + v[0] * Math.sin(a)) * r, (uu[1] * Math.cos(a) + v[1] * Math.sin(a)) * r, (uu[2] * Math.cos(a) + v[2] * Math.sin(a)) * r];
    out.push(line([at[0] + o[0], at[1] + o[1], at[2] + o[2]], [end[0] + o[0], end[1] + o[1], end[2] + o[2]]));
  }
  return out;
}

/** Shop tank: vertical shell, 2:1 dished heads, course seams, legs, nozzles. */
export function shopTankWire(shellId: number, shellHeight: number, courseHeight: number): Polyline[] {
  const R = 0.5;
  const H = Math.min(4, Math.max(0.6, shellHeight / shellId));
  const head = R * 0.5;
  const out: Polyline[] = [];
  const headProfile = (sign: 1 | -1) =>
    Array.from({ length: 13 }, (_, i) => {
      const t = (i / 12) * (Math.PI / 2);
      return [R * Math.cos(t), sign * (H / 2 + head * Math.sin(t))] as [number, number];
    });
  out.push(ring(R, H / 2, 72, 1), ring(R, -H / 2, 72, 1));
  out.push(...meridians([[R, -H / 2], [R, H / 2]], 16));
  out.push(...meridians(headProfile(1), 16), ...meridians(headProfile(-1), 16));
  for (const f of [0.35, 0.7]) out.push(ring(R * Math.cos(Math.asin(f)), H / 2 + head * f, 48, 2), ring(R * Math.cos(Math.asin(f)), -H / 2 - head * f, 48, 2));
  const courses = Math.max(1, Math.ceil(shellHeight / Math.max(1, courseHeight)));
  for (let i = 1; i < courses; i++) out.push(ring(R, -H / 2 + (H * i) / courses, 72, 2));
  const legs = shellId >= 1100 ? 4 : 3;
  const legLen = 0.55 + head;
  for (let i = 0; i < legs; i++) {
    const a = (legs === 4 ? Math.PI / 4 : 0) + (i / legs) * TAU;
    const x = Math.cos(a) * R * 0.92;
    const z = Math.sin(a) * R * 0.92;
    const top = -H / 2 + 0.15;
    const bot = -H / 2 - legLen;
    for (const s of [-1, 1]) out.push(line([x + s * 0.035 * Math.sin(a), top, z - s * 0.035 * Math.cos(a)], [x + s * 0.035 * Math.sin(a), bot, z - s * 0.035 * Math.cos(a)], 1));
    out.push({ pts: [[x - 0.09, bot, z - 0.09], [x + 0.09, bot, z - 0.09], [x + 0.09, bot, z + 0.09], [x - 0.09, bot, z + 0.09], [x - 0.09, bot, z - 0.09]], cls: 0 });
  }
  out.push(...nozzle([0, H / 2 + head, 0], [0, 1, 0], 0.07, 0.16));
  out.push(...nozzle([R, H * 0.2, 0], [1, 0, 0], 0.05, 0.14));
  out.push(...nozzle([0, H * 0.05, R], [0, 0, 1], 0.12, 0.08));
  out.push(...nozzle([0, -H / 2 - head, 0], [0, -1, 0], 0.045, 0.12));
  return out;
}

/** Site tank: wide coursed shell, cone roof with rafters and drum, sloped bottom, anchor chairs, stair. */
export function siteTankWire(diameterM: number, heightM: number, courses: number, coneDeg: number, slopeRatio: number): Polyline[] {
  const R = 1;
  const H = Math.min(2.5, Math.max(0.35, (heightM / diameterM) * 2));
  const cone = (Math.max(5, Math.min(30, coneDeg)) * Math.PI) / 180;
  const coneH = R * Math.tan(cone);
  const drop = Math.min(0.12, (2 * R) / Math.max(5, slopeRatio));
  const out: Polyline[] = [];
  out.push(ring(R, 0, 96, 1), ring(R, H, 96, 1), ring(R * 1.03, H, 96, 0));
  out.push(...meridians([[R, 0], [R, H]], 24));
  for (let i = 1; i < courses; i++) out.push(ring(R, (H * i) / courses, 96, 2));
  out.push(...meridians([[R * 1.03, H], [0.14, H + coneH * (1 - 0.14)]], 16, 0));
  out.push(ring(0.14, H + coneH * 0.86, 32, 1), ring(0.14, H + coneH * 0.86 + 0.06, 32, 1));
  out.push(ring(R * 0.55, H + coneH * 0.45, 64, 2));
  out.push(...meridians([[R, 0], [0, -drop]], 12, 2));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    const x = Math.cos(a) * (R + 0.03);
    const z = Math.sin(a) * (R + 0.03);
    out.push(line([x, 0, z], [x, 0.09, z], 2));
  }
  out.push(ring(R + 0.06, -0.01, 96, 0));
  const stair: Vec3[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const a = -0.4 + t * 1.6;
    stair.push([Math.cos(a) * (R + 0.08), t * H, Math.sin(a) * (R + 0.08)]);
  }
  out.push({ pts: stair, cls: 0 });
  out.push(...nozzle([Math.cos(2.4) * R, 0.18, Math.sin(2.4) * R], [Math.cos(2.4), 0, Math.sin(2.4)], 0.06, 0.12));
  out.push(...nozzle([Math.cos(3.4) * R, 0.2, Math.sin(3.4) * R], [Math.cos(3.4), 0, Math.sin(3.4)], 0.13, 0.05));
  return out;
}

/** Hologram geometry from live workspace values (falls back to desktop defaults). */
export function tankWireFromValues(module: TankModuleKind, values: Record<string, string>): Polyline[] {
  const num = (k: string, d: number) => {
    const n = Number(values[k]);
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  if (module === "ShopTank") return shopTankWire(num("shellId", 1200), num("shellHeight", 1500), num("courseHeight", 1250));
  // Same sizing idea as SiteTankCalculationService: H/D picks the course count, height = courses x course height.
  const vol = num("requiredVolume", 675);
  const hd = num("hdRatio", 1.15);
  const ch = num("courseHeight", 1500);
  const dia = Math.cbrt((4 * (vol / 0.988)) / (Math.PI * hd));
  const courses = Math.max(1, Math.round((dia * hd * 1000) / ch));
  const height = (courses * ch) / 1000;
  const d = Math.sqrt((4 * vol) / (Math.PI * height * 0.988));
  return siteTankWire(d, height, Math.min(courses, 14), num("topConeAngle", 15), num("bottomSlopeRatio", 25));
}
