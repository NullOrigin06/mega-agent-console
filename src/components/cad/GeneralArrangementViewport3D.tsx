import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { MODULE_COLORS } from "../../constants/moduleColors";
import {
  baffleGeometry,
  boltInstances,
  cylX,
  flangeStackGeometry,
  headInnerGeometry,
  headShellGeometry,
  lugGeometry,
  lugPlacements,
  mainShellGeometry,
  namePlateGeometry,
  nozzleParts,
  partitionPlateGeometry,
  saddleGeometry,
  tieRodGeometry,
  trunnionGeometry,
  tubeGeometry,
} from "./gaGeometry";
import { webglAvailable } from "./gaWebgl";
import { gaExtents, tieRodLayout, tubeLayout, type GaNozzle, type GaSpec } from "./gaSpec";

/** Overall length the model is scaled to, in scene units. */
const SCENE_LENGTH = 6;

const ACCENT = MODULE_COLORS.GeneralArrangement;

// Stainless steel for shell / heads / tube sheets / nozzle necks, dark painted carbon steel for saddles / flanges.
const STAINLESS = { color: "#d3dae4", metalness: 0.72, roughness: 0.36 } as const;
const PAINT = { color: "#3a424e", metalness: 0.4, roughness: 0.55 } as const;
const BRASS = { color: "#c9a24b", metalness: 0.85, roughness: 0.35 } as const;
const BOLT = { color: "#d7dde6", metalness: 0.9, roughness: 0.3 } as const;

type Group = "shell" | "carbon" | "nozzles" | "internals";

const GROUPS: Array<{ id: Group; label: string; swatch: string }> = [
  { id: "shell", label: "Shell, heads & tube sheets", swatch: STAINLESS.color },
  { id: "carbon", label: "Saddles, flanges & lugs", swatch: "#4a5565" },
  { id: "nozzles", label: "Nozzles", swatch: ACCENT },
  { id: "internals", label: "Tube bundle & baffles", swatch: "#8fa3bd" },
];

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface PartInfo {
  id: string;
  title: string;
  detail: string;
  anchor: [number, number, number];
}

const mm = (v: number) => `${Math.round(v * 100) / 100}`;

function nozzleInfo(n: GaNozzle): PartInfo {
  const sideText = n.side === "TOP" ? "top" : n.side === "BOTTOM" ? "bottom" : n.side === "FRONT" ? "side (0°)" : "side (180°)";
  const spec = [`${mm(n.nb)} NB`, n.rating, n.type, n.schedule].filter(Boolean).join(" · ");
  return {
    id: `noz:${n.id}`,
    title: `${n.id} · ${n.service || "Nozzle"}`,
    detail: `${spec} · ${sideText} · x ${mm(n.axisX)} mm · face ${mm(n.faceR)} mm from CL${n.drawnOnGad ? "" : " · not on the GA drawing"}`,
    anchor: [n.drawX, n.dir[1] * (n.reachR + 150), n.dir[2] * (n.reachR + 150)],
  };
}

function dispose(obj: unknown) {
  if (obj instanceof THREE.BufferGeometry) obj.dispose();
  else if (Array.isArray(obj)) obj.forEach(dispose);
  else if (obj && typeof obj === "object") Object.values(obj as Record<string, unknown>).forEach(dispose);
}

interface PartProps {
  info: PartInfo;
  setHovered: (id: string | null) => void;
  hovered: string | null;
  children: ReactNode;
}

function Part({ info, hovered, setHovered, children }: PartProps) {
  return (
    <group
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(info.id);
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        if (hovered === info.id) setHovered(null);
      }}
    >
      {children}
    </group>
  );
}

function Instanced({
  geometry,
  points,
  material,
}: {
  geometry: THREE.BufferGeometry;
  points: Array<[number, number, number]>;
  material: ReactNode;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    points.forEach(([x, y, z], i) => mesh.setMatrixAt(i, m.makeTranslation(x, y, z)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [points]);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, points.length]} frustumCulled={false}>
      {material}
    </instancedMesh>
  );
}

function NozzleModel({
  n,
  shellRo,
  active,
  hovered,
  setHovered,
}: {
  n: GaNozzle;
  shellRo: number;
  active: boolean;
  hovered: string | null;
  setHovered: (id: string | null) => void;
}) {
  const parts = useMemo(() => nozzleParts(n, shellRo), [n, shellRo]);
  useEffect(() => () => dispose(parts), [parts]);
  const rotation: [number, number, number] = n.side === "BOTTOM" ? [0, 0, Math.PI] : n.side === "FRONT" ? [Math.PI / 2, 0, 0] : n.side === "BACK" ? [-Math.PI / 2, 0, 0] : [0, 0, 0];
  const emissive = active ? 0.35 : 0;
  return (
    <Part info={nozzleInfo(n)} hovered={hovered} setHovered={setHovered}>
      <group position={[n.drawX, 0, 0]} rotation={rotation}>
        <mesh geometry={parts.steel}>
          <meshStandardMaterial {...STAINLESS} side={THREE.DoubleSide} emissive={ACCENT} emissiveIntensity={emissive} />
        </mesh>
        {parts.paint && (
          <mesh geometry={parts.paint}>
            <meshStandardMaterial {...PAINT} emissive={ACCENT} emissiveIntensity={emissive} />
          </mesh>
        )}
        {parts.bolts && (
          <mesh geometry={parts.bolts}>
            <meshStandardMaterial {...BOLT} />
          </mesh>
        )}
      </group>
    </Part>
  );
}

/** Base of the dashed leader (just past the nozzle end) and the point where the tag floats, in mm. */
function nozzleTagLine(n: GaNozzle): [[number, number, number], [number, number, number]] {
  const at = (r: number): [number, number, number] => [n.drawX, n.dir[1] * r, n.dir[2] * r];
  return [at(n.reachR + 8), at(n.reachR + 130)];
}

interface Anchor {
  id: string;
  /** Position in the model's frame (mm). */
  pos: [number, number, number];
}

/**
 * Keeps DOM overlays (nozzle tags, hover tooltip) glued to points of the model. Plain DOM instead of
 * drei's Html, which re-roots React per label and logs unmount-during-render errors under StrictMode.
 */
function AnchorProjector({
  anchors,
  model,
  nodes,
}: {
  anchors: Anchor[];
  model: React.RefObject<THREE.Group | null>;
  nodes: React.RefObject<Map<string, HTMLElement>>;
}) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    const group = model.current;
    if (!group) return;
    group.updateWorldMatrix(true, false);
    for (const a of anchors) {
      const el = nodes.current.get(a.id);
      if (!el) continue;
      v.set(a.pos[0], a.pos[1], a.pos[2]).applyMatrix4(group.matrixWorld).project(camera);
      el.style.visibility = v.z > 1 ? "hidden" : "visible";
      let x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      if (a.id === "tip") {
        // Hangs below its anchor, kept inside the viewport.
        x = Math.min(Math.max(x, 130), size.width - 130);
        el.style.transform = `translate(${x.toFixed(1)}px, ${(y + 26).toFixed(1)}px) translate(-50%, 0)`;
      } else {
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      }
    }
  });
  return null;
}

function partInfos(spec: GaSpec): Record<string, PartInfo> {
  const l = spec.layout;
  const ro = spec.ro;
  const lug = lugPlacements(spec)[0];
  const info: Record<string, PartInfo> = {
    shell: {
      id: "shell",
      title: "Shell",
      detail: `I.D. ${spec.shellId} × ${spec.shellThk} thk · tube sheets ${mm(spec.faceToFace)} mm face to face`,
      anchor: [spec.faceToFace / 2, ro * 1.25, 0],
    },
    heads: {
      id: "heads",
      title: "Channels & torispherical heads",
      detail: `CR ${mm(spec.crown)} / KR ${mm(spec.knuckle)} · S.F. ${spec.straightFace} · tangent ${mm(-l.xtFront)} mm front, ${mm(l.xtRear - l.L)} mm rear of the tube-sheet faces`,
      anchor: [l.xsRear + 40, ro * 1.1, 0],
    },
    flanges: {
      id: "flanges",
      title: "Body flanges",
      detail: `O.D. ${mm(spec.flangeOD)} × ${spec.flangeThk} thk · ${spec.boltCount} × Ø${spec.boltHoleDia} holes on PCD ${mm(spec.boltPCD)}`,
      anchor: [-30, spec.flangeOD / 2 + 60, 0],
    },
    tubesheets: {
      id: "tubesheets",
      title: "Tube sheets",
      detail: `O.D. ${mm(spec.flangeOD)} × ${spec.tubeSheetThk} thk · ${mm(spec.faceToFace)} mm face to face`,
      anchor: [spec.faceToFace + 30, spec.flangeOD / 2 + 60, 0],
    },
    bundle: {
      id: "bundle",
      title: "Tube bundle",
      detail: `Ø${spec.tubeOD} tubes on 1.25 × OD pitch${spec.tubeQty > 0 ? ` · ${spec.tubeQty} tubes` : ""} · ${spec.tieRodQty} tie rods Ø${spec.tieRodDia}`,
      anchor: [spec.faceToFace / 2, 0, 0],
    },
    baffles: {
      id: "baffles",
      title: "Baffles",
      detail: `${spec.baffleX.length} × ${spec.baffleThk} thk · first at ${spec.baffleX[0] ?? 440} mm · pitch 425 · alternating cut`,
      anchor: [spec.baffleX[0] ?? 440, -ro * 0.6, 0],
    },
    saddles: {
      id: "saddles",
      title: "Saddles",
      detail: `${spec.saddles[0].label} at ${mm(spec.saddles[0].cl)} / ${spec.saddles[1].label} at ${mm(spec.saddles[1].cl)} mm · ${mm(spec.saddles[0].heightBelowShell)} / ${mm(spec.saddles[1].heightBelowShell)} mm below shell O.D.`,
      anchor: [spec.saddles[0].cl, -(spec.saddles[0].baseDepth + 80), 0],
    },
    trunnions: {
      id: "trunnions",
      title: "Trunnions",
      detail: `4 × ${spec.trunnion.nb} NB, two at each saddle`,
      anchor: [spec.saddles[0].cl, 130, ro + 200],
    },
    lugs: {
      id: "lugs",
      title: "Lifting lugs",
      detail: `${spec.lugsFront} on the front dished end, ${spec.lugsRear} on the rear`,
      anchor: [lug.x, lug.y + 230, 0],
    },
    nameplate: {
      id: "nameplate",
      title: "Name plate",
      detail: "On the rear dished end",
      anchor: [l.apexRearOuter + 120, 150, 0],
    },
  };
  for (const n of spec.nozzles) info[`noz:${n.id}`] = nozzleInfo(n);
  return info;
}

/** Dashed leader from the nozzle end up to where its tag floats. */
function NozzleLeader({ n }: { n: GaNozzle }) {
  const [base, tag] = nozzleTagLine(n);
  return <Line points={[base, tag]} color={ACCENT} lineWidth={1} dashed dashSize={14} gapSize={10} transparent opacity={0.7} />;
}

function GaModel({
  spec,
  cutaway,
  labels,
  hovered,
  setHovered,
  focus,
  info,
}: {
  spec: GaSpec;
  info: Record<string, PartInfo>;
  cutaway: boolean;
  labels: boolean;
  hovered: string | null;
  setHovered: (id: string | null) => void;
  focus: Group | null;
}) {
  const g = useMemo(() => {
    const tubes = tubeLayout(spec);
    const rods = tieRodLayout(spec);
    const bolts = boltInstances(spec);
    const front = flangeStackGeometry(spec, "front");
    const rear = flangeStackGeometry(spec, "rear");
    const np = namePlateGeometry(spec);
    return {
      mainShell: mainShellGeometry(spec),
      headFront: headShellGeometry(spec, "front"),
      headRear: headShellGeometry(spec, "rear"),
      innerFront: headInnerGeometry(spec, "front"),
      innerRear: headInnerGeometry(spec, "rear"),
      front,
      rear,
      bolts,
      studGeo: cylX(bolts.studRadius, bolts.studLength, false, 8),
      nutGeo: cylX(bolts.nutRadius, bolts.nutThk, false, 6),
      tubes,
      tubeGeo: tubeGeometry(spec),
      baffleTop: baffleGeometry(spec, true),
      baffleBottom: baffleGeometry(spec, false),
      rods: tieRodGeometry(spec, rods),
      partition: partitionPlateGeometry(spec),
      saddles: spec.saddles.map((s) => saddleGeometry(spec, s)),
      trunnionPos: trunnionGeometry(spec, 1),
      trunnionNeg: trunnionGeometry(spec, -1),
      lug: lugGeometry(),
      lugs: lugPlacements(spec),
      namePlate: np,
    };
  }, [spec]);
  useEffect(() => () => dispose(g), [g]);

  const shellEdges = useMemo(() => new THREE.EdgesGeometry(g.mainShell, 30), [g.mainShell]);
  useEffect(() => () => shellEdges.dispose(), [shellEdges]);

  const boltPoints = g.bolts;
  const act = (id: string, group: Group) => hovered === id || focus === group;
  const glow = (on: boolean) => ({ emissive: ACCENT, emissiveIntensity: on ? 0.3 : 0 });
  // Explicit values on both branches: R3F keeps a material prop's last value when it stops being passed.
  const shellSurface = (on: boolean) =>
    cutaway
      ? { ...STAINLESS, ...glow(on), transparent: true, opacity: on ? 0.3 : 0.16, depthWrite: false, side: THREE.DoubleSide }
      : { ...STAINLESS, ...glow(on), transparent: false, opacity: 1, depthWrite: true, side: THREE.DoubleSide };

  const hoverProps = { hovered, setHovered };
  const ro = spec.ro;


  const body = (on: boolean) => ({ ...PAINT, ...glow(on) });

  return (
    <group>
      {/* main shell */}
      <Part info={info.shell} {...hoverProps}>
        <mesh geometry={g.mainShell} renderOrder={2}>
          <meshStandardMaterial {...shellSurface(act("shell", "shell"))} />
        </mesh>
        {cutaway && (
          <lineSegments geometry={shellEdges}>
            <lineBasicMaterial color={ACCENT} transparent opacity={0.6} />
          </lineSegments>
        )}
      </Part>

      {/* channels + torispherical heads */}
      <Part info={info.heads} {...hoverProps}>
        {[g.headFront, g.headRear].map((geo, i) => (
          <mesh key={i} geometry={geo} renderOrder={2}>
            <meshStandardMaterial {...shellSurface(act("heads", "shell"))} />
          </mesh>
        ))}
        {cutaway &&
          [g.innerFront, g.innerRear].map((geo, i) => (
            <mesh key={i} geometry={geo}>
              <meshStandardMaterial color="#6f7d90" metalness={0.5} roughness={0.5} side={THREE.BackSide} transparent opacity={0.35} depthWrite={false} />
            </mesh>
          ))}
      </Part>

      {/* tube sheets */}
      <Part info={info.tubesheets} {...hoverProps}>
        {[g.front.tubeSheet, g.rear.tubeSheet].map((geo, i) => (
          <mesh key={i} geometry={geo}>
            <meshStandardMaterial {...STAINLESS} {...glow(act("tubesheets", "shell"))} />
          </mesh>
        ))}
      </Part>

      {/* body flanges, gaskets, studs and nuts */}
      <Part info={info.flanges} {...hoverProps}>
        {[g.front, g.rear].map((stack, i) => (
          <group key={i}>
            <mesh geometry={stack.flange}>
              <meshStandardMaterial {...body(act("flanges", "carbon"))} />
            </mesh>
            <mesh geometry={stack.gasket}>
              <meshStandardMaterial color="#14181f" roughness={0.9} metalness={0.1} />
            </mesh>
          </group>
        ))}
        <Instanced geometry={g.studGeo} points={boltPoints.studs} material={<meshStandardMaterial {...BOLT} />} />
        <Instanced geometry={g.nutGeo} points={boltPoints.nuts} material={<meshStandardMaterial {...BOLT} />} />
      </Part>

      {/* tube bundle, baffles, tie rods, pass partition (visible through the ghost shell) */}
      {cutaway && (
        <>
          <Part info={info.bundle} {...hoverProps}>
            <Instanced
              geometry={g.tubeGeo}
              points={g.tubes.map(([y, z]) => [0, y, z] as [number, number, number])}
              material={<meshStandardMaterial color="#9fb0c6" metalness={0.8} roughness={0.35} emissive={ACCENT} emissiveIntensity={act("bundle", "internals") ? 0.35 : 0} />}
            />
            <mesh geometry={g.rods}>
              <meshStandardMaterial {...BOLT} />
            </mesh>
            <mesh geometry={g.partition}>
              <meshStandardMaterial color="#5d6b80" metalness={0.5} roughness={0.5} side={THREE.DoubleSide} />
            </mesh>
          </Part>
          <Part info={info.baffles} {...hoverProps}>
            {spec.baffleX.map((x, i) => (
              <mesh key={i} geometry={i % 2 === 0 ? g.baffleTop : g.baffleBottom} position={[x, 0, 0]}>
                <meshStandardMaterial color="#7f90a8" metalness={0.7} roughness={0.4} side={THREE.DoubleSide} transparent opacity={0.9} emissive={ACCENT} emissiveIntensity={act("baffles", "internals") ? 0.35 : 0} />
              </mesh>
            ))}
          </Part>
        </>
      )}

      {/* saddles */}
      <Part info={info.saddles} {...hoverProps}>
        {spec.saddles.map((s, i) => (
          <mesh key={s.label} geometry={g.saddles[i]} position={[s.cl, 0, 0]} scale={[s.m, 1, 1]}>
            <meshStandardMaterial {...body(act("saddles", "carbon"))} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </Part>

      {/* trunnions: two at each saddle, one each side */}
      <Part info={info.trunnions} {...hoverProps}>
        {spec.saddles.flatMap((s) => [
          <mesh key={`${s.label}p`} geometry={g.trunnionPos} position={[s.cl, 0, 0]}>
            <meshStandardMaterial {...body(act("trunnions", "carbon"))} side={THREE.DoubleSide} />
          </mesh>,
          <mesh key={`${s.label}n`} geometry={g.trunnionNeg} position={[s.cl, 0, 0]}>
            <meshStandardMaterial {...body(act("trunnions", "carbon"))} side={THREE.DoubleSide} />
          </mesh>,
        ])}
      </Part>

      {/* lifting lugs on top of the dished ends */}
      <Part info={info.lugs} {...hoverProps}>
        {g.lugs.map((p, i) => (
          <mesh key={i} geometry={g.lug} position={[p.x, p.y, p.z]}>
            <meshStandardMaterial {...body(act("lugs", "carbon"))} />
          </mesh>
        ))}
      </Part>

      {/* name plate on the rear head */}
      <Part info={info.nameplate} {...hoverProps}>
        <mesh geometry={g.namePlate.bracket}>
          <meshStandardMaterial {...body(act("nameplate", "carbon"))} />
        </mesh>
        <mesh geometry={g.namePlate.plate}>
          <meshStandardMaterial {...BRASS} emissive={ACCENT} emissiveIntensity={act("nameplate", "carbon") ? 0.25 : 0} />
        </mesh>
      </Part>

      {/* nozzles + their tags */}
      {spec.nozzles.map((n) => (
        <NozzleModel key={n.id} n={n} shellRo={ro} active={hovered === `noz:${n.id}` || focus === "nozzles"} {...hoverProps} />
      ))}
      {labels && spec.nozzles.map((n) => <NozzleLeader key={n.id} n={n} />)}
    </group>
  );
}

interface GeneralArrangementViewport3DProps {
  spec: GaSpec;
  onClose?: () => void;
}

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Shown when WebGL is missing or the scene failed: the same facts as text. */
function GaFallback({ spec, onClose, reason }: { spec: GaSpec; onClose?: () => void; reason: string }) {
  return (
    <div className="vessel-viewport ga-fallback" role="group" aria-label="General arrangement summary">
      <div className="ga-fallback-body">
        <div className="vessel-caption-title">General Arrangement 3D unavailable</div>
        <p className="vessel-hint">{reason}</p>
        <p className="vessel-caption-source">
          Shell I.D. {spec.shellId} × {spec.shellThk} thk · tube sheets {mm(spec.faceToFace)} mm face to face · saddles at {mm(spec.saddles[0].cl)} and{" "}
          {mm(spec.saddles[1].cl)} mm · torispherical heads CR {mm(spec.crown)} / KR {mm(spec.knuckle)}
        </p>
        {spec.nozzles.length > 0 && (
          <table className="ga-fallback-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>NB</th>
                <th>Side</th>
                <th>x (mm)</th>
                <th>Service</th>
              </tr>
            </thead>
            <tbody>
              {spec.nozzles.map((n) => (
                <tr key={n.id}>
                  <td>{n.id}</td>
                  <td>{mm(n.nb)}</td>
                  <td>{n.side.toLowerCase()}</td>
                  <td>{mm(n.axisX)}</td>
                  <td>{n.service}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {onClose && (
          <div className="vessel-actions">
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Digital twin of the General Arrangement vessel: a horizontal shell-and-tube condenser built to
 * scale from the job (shell I.D., tube length, nozzle list), with torispherical heads, body flanges,
 * saddles, trunnions, lifting lugs, name plate and the flanged nozzles with their tags. Cutaway
 * ghosts the shell to show the tube sheets, tube bundle, baffles and tie rods.
 */
export function GeneralArrangementViewport3D({ spec, onClose }: GeneralArrangementViewport3DProps) {
  const [webgl] = useState(webglAvailable);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focus, setFocus] = useState<Group | null>(null);
  const [autoRotate, setAutoRotate] = useState(() => !prefersReducedMotion());
  const [cutaway, setCutaway] = useState(false);
  const [labels, setLabels] = useState(true);
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const modelRef = useRef<THREE.Group>(null);
  const nodes = useRef<Map<string, HTMLElement>>(new Map());

  // Polling re-creates the job object; only a real change of the spec should rebuild the model.
  const key = JSON.stringify(spec);
  const [held, setHeld] = useState({ key, spec });
  if (held.key !== key) setHeld({ key, spec });
  const stable = held.spec;

  const ext = useMemo(() => gaExtents(stable), [stable]);
  const infos = useMemo(() => partInfos(stable), [stable]);
  const scale = SCENE_LENGTH / ext.length;
  const cx = (ext.minX + ext.maxX) / 2;
  const floorY = ext.minY * scale - 0.01;
  const targetY = ((ext.minY + ext.maxY + 160) / 2) * scale;

  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  if (!webgl) {
    return <GaFallback spec={stable} onClose={onClose} reason="WebGL is not available in this browser, so the 3D view cannot be drawn." />;
  }

  const hoveredInfo = hovered ? infos[hovered] : undefined;
  const anchors: Anchor[] = [
    ...(labels ? stable.nozzles.map((n) => ({ id: `tag:${n.id}`, pos: nozzleTagLine(n)[1] })) : []),
    ...(hoveredInfo ? [{ id: "tip", pos: hoveredInfo.anchor }] : []),
  ];
  const setNode = (id: string) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(id, el);
    else nodes.current.delete(id);
  };

  const sideways = stable.nozzles.filter((n) => !n.drawnOnGad).map((n) => n.id);

  return (
    <div className="vessel-viewport ga-viewport" data-testid="ga-viewport">
      <SceneBoundary fallback={<GaFallback spec={stable} onClose={onClose} reason="The 3D scene could not be started." />}>
        <Canvas
          camera={{ position: [4.4, 2.1, 5.1], fov: 38 }}
          dpr={[1, 2]}
          gl={{ antialias: true }}
          frameloop={autoRotate && hovered === null ? "always" : "demand"}
          aria-label={`3D model of the general arrangement: shell I.D. ${stable.shellId} mm, ${stable.nozzles.length} nozzles`}
        >
          <color attach="background" args={["#0b1220"]} />
          <hemisphereLight args={["#cfe0ff", "#1a2540", 0.9]} />
          <directionalLight position={[6, 8, 5]} intensity={1.3} />
          <directionalLight position={[-6, 3, -4]} intensity={0.4} color="#9cc0ff" />
          {/* Studio reflections (local light cards, no network fetch) so the steel reads as metal. */}
          <Environment resolution={256} frames={1}>
            <Lightformer form="rect" intensity={2.4} position={[0, 6, 2]} scale={[14, 3, 1]} rotation-x={Math.PI / 2} />
            <Lightformer form="rect" intensity={1.4} position={[7, 1, 3]} scale={[3, 7, 1]} rotation-y={-Math.PI / 2.5} />
            <Lightformer form="rect" intensity={1.8} position={[-7, 1, -3]} scale={[4, 7, 1]} rotation-y={Math.PI / 2.5} color="#bcd4ff" />
          </Environment>
          <group scale={scale}>
            <group position={[-cx, 0, 0]} ref={modelRef}>
              <GaModel spec={stable} info={infos} cutaway={cutaway} labels={labels} hovered={hovered} setHovered={setHovered} focus={focus} />
            </group>
          </group>
          <ContactShadows position={[0, floorY, 0]} opacity={0.6} scale={SCENE_LENGTH * 2} blur={2.6} far={3.5} />
          <gridHelper args={[SCENE_LENGTH * 2, 24, "#1d2a44", "#141f33"]} position={[0, floorY - 0.001, 0]} />
          <OrbitControls
            ref={controls}
            enablePan={false}
            minDistance={3}
            maxDistance={14}
            maxPolarAngle={Math.PI / 2.05}
            autoRotate={autoRotate && hovered === null}
            autoRotateSpeed={0.6}
            target={[0, targetY, 0]}
          />
          <AnchorProjector anchors={anchors} model={modelRef} nodes={nodes} />
        </Canvas>
      </SceneBoundary>

      <div className="ga-anchors" aria-hidden={!labels}>
        {labels &&
          stable.nozzles.map((n) => {
            const id = `noz:${n.id}`;
            return (
              <div key={n.id} ref={setNode(`tag:${n.id}`)} className="ga-anchor">
                <div
                  className={`ga-tag${hovered === id ? " ga-tag-active" : ""}`}
                  role="img"
                  aria-label={`Nozzle ${n.id}, ${mm(n.nb)} NB${n.service ? `, ${n.service}` : ""}`}
                  onPointerEnter={() => setHovered(id)}
                  onPointerLeave={() => setHovered(null)}
                >
                  {n.id}
                </div>
              </div>
            );
          })}
        {hoveredInfo && (
          <div ref={setNode("tip")} className="ga-anchor ga-anchor-tip">
            <div className="vessel-tip">
              <div className="vessel-tip-head">
                <span className="vessel-tip-swatch" style={{ background: ACCENT }} />
                {hoveredInfo.title}
              </div>
              <div className="vessel-tip-detail">{hoveredInfo.detail}</div>
            </div>
          </div>
        )}
      </div>

      <div className="vessel-overlay vessel-overlay-top">
        <div className="vessel-caption">
          <span className="vessel-caption-title">General Arrangement 3D</span>
          <span className="vessel-caption-source">
            {stable.jobId
              ? `Built from ${stable.jobId} · Shell Ø${stable.shellId} mm · tube sheets ${mm(stable.faceToFace)} mm apart · ${stable.nozzles.length} nozzles`
              : `Reference condenser (Ø${stable.shellId}) · run a General Arrangement job to model your own`}
          </span>
          {sideways.length > 0 && <span className="vessel-caption-source">Drawn sideways here, not on the GA drawing: {sideways.join(", ")}</span>}
        </div>
        <div className="vessel-legend" aria-label="Material and part legend">
          {GROUPS.filter((gr) => gr.id !== "internals" || cutaway).map((gr) => (
            <button key={gr.id} type="button" aria-pressed={focus === gr.id} onClick={() => setFocus((f) => (f === gr.id ? null : gr.id))}>
              <span className="vessel-tip-swatch" style={{ background: gr.swatch }} />
              {gr.label}
            </button>
          ))}
        </div>
      </div>

      <div className="vessel-overlay vessel-overlay-bottom">
        <span className="vessel-hint">Drag to orbit · scroll to zoom · hover a part or nozzle tag for details</span>
        <div className="vessel-actions">
          <button
            type="button"
            onClick={() => {
              setCutaway((v) => !v);
              setFocus((f) => (f === "internals" ? null : f));
            }}
            aria-pressed={cutaway}
          >
            {cutaway ? "Solid shell" : "Cutaway view"}
          </button>
          <button type="button" onClick={() => setLabels((v) => !v)} aria-pressed={labels}>
            {labels ? "Hide labels" : "Show labels"}
          </button>
          <button type="button" onClick={() => setAutoRotate((v) => !v)} aria-pressed={autoRotate}>
            {autoRotate ? "Pause rotation" : "Auto-rotate"}
          </button>
          <button type="button" onClick={() => controls.current?.reset()}>
            Reset view
          </button>
          {onClose && (
            <button type="button" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
