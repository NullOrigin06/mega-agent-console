import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { ModuleKind } from "../../types/engineering";
import { MODULE_COLORS, MODULE_SHORT_NAMES } from "../../constants/moduleColors";
import { MODULE_OPTIONS } from "../../constants/modules";
import type { VesselSpec } from "./vesselSpec";

const STEEL = new THREE.Color("#9aabc2");
/** Every part is steel, tinted toward the colour of the module that produces it. */
const tint = (module: ModuleKind, amount = 0.45) =>
  STEEL.clone().lerp(new THREE.Color(MODULE_COLORS[module]), amount);

/** Overall length the model is scaled to, in scene units. */
const SCENE_LENGTH = 6;

interface PartInfo {
  id: string;
  module: ModuleKind;
  title: string;
  detail: string;
  /** Where the hover label anchors, in mm. */
  anchor: [number, number, number];
}

interface PartProps {
  info: PartInfo;
  hovered: string | null;
  setHovered: (id: string | null) => void;
  onSelect?: (module: ModuleKind) => void;
  children: React.ReactNode;
}

/** A hoverable/clickable group; children render the actual meshes. */
function Part({ info, hovered, setHovered, onSelect, children }: PartProps) {
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
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(info.module);
      }}
    >
      {children}
    </group>
  );
}

function metal(module: ModuleKind, active: boolean, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const color = MODULE_COLORS[module];
  return {
    color: tint(module),
    metalness: 0.55,
    roughness: 0.38,
    emissive: new THREE.Color(color),
    emissiveIntensity: active ? 0.55 : 0.04,
    ...opts,
  };
}

/** Triangular 30° tube layout at 1.25 × OD pitch (the production rule), filled centre-out. */
function tubePositions(spec: VesselSpec): Array<[number, number]> {
  const pitch = 1.25 * spec.tubeOD;
  const limit = Math.min(spec.baffleOD, spec.shellId) / 2 - spec.tubeOD;
  const rowStep = pitch * Math.sin(Math.PI / 3);
  const points: Array<[number, number]> = [];
  const rows = Math.ceil(limit / rowStep);
  for (let r = -rows; r <= rows; r++) {
    const y = r * rowStep;
    const offset = Math.abs(r) % 2 === 1 ? pitch / 2 : 0;
    const cols = Math.ceil(limit / pitch) + 1;
    for (let c = -cols; c <= cols; c++) {
      const z = c * pitch + offset;
      if (y * y + z * z <= limit * limit) points.push([y, z]);
    }
  }
  points.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));
  return points.slice(0, Math.min(spec.tubeQty, 1200));
}

/** Segmental baffle: a disc with a 25%-of-diameter chord cut off the top. */
function baffleGeometry(spec: VesselSpec, thickness: number): THREE.ExtrudeGeometry {
  const r = spec.baffleOD / 2;
  const cutY = r - 0.25 * spec.shellId;
  const theta = Math.asin(Math.max(-1, Math.min(1, cutY / r)));
  const shape = new THREE.Shape();
  shape.moveTo(r * Math.cos(theta), cutY);
  shape.absarc(0, 0, r, theta, Math.PI - theta, true);
  shape.lineTo(r * Math.cos(theta), cutY);
  return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 40 });
}

function TubeBundle({ spec, length, active }: { spec: VesselSpec; length: number; active: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const positions = useMemo(() => tubePositions(spec), [spec]);
  const geometry = useMemo(() => new THREE.CylinderGeometry(spec.tubeOD / 2, spec.tubeOD / 2, length, 8, 1, true), [spec, length]);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    positions.forEach(([y, z], i) => {
      m.compose(new THREE.Vector3(0, y, z), q, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [positions]);

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, positions.length]}>
      <meshStandardMaterial {...metal("HeatExchangerFab", active, { color: STEEL.clone().lerp(new THREE.Color("#ffffff"), 0.15), metalness: 0.8, roughness: 0.3 })} />
    </instancedMesh>
  );
}

function Bolts({ spec, x, length, active }: { spec: VesselSpec; x: number; length: number; active: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = Math.max(4, Math.min(spec.boltQty, 96));
  const boltDia = Math.max(12, (spec.tubeSheetOD - spec.boltPCD) * 0.45);
  const geometry = useMemo(() => new THREE.CylinderGeometry(boltDia / 2, boltDia / 2, length, 6), [boltDia, length]);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      m.compose(new THREE.Vector3(x, (Math.cos(a) * spec.boltPCD) / 2, (Math.sin(a) * spec.boltPCD) / 2), q, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [count, spec.boltPCD, x]);

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, count]}>
      <meshStandardMaterial {...metal("BonnetFlange", active, { color: "#c7d2e0", metalness: 0.9, roughness: 0.25 })} />
    </instancedMesh>
  );
}

function Label({ info }: { info: PartInfo }) {
  return (
    <Html position={info.anchor} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <div className="vessel-tip">
        <div className="vessel-tip-head">
          <span className="vessel-tip-swatch" style={{ background: MODULE_COLORS[info.module] }} />
          {info.title}
        </div>
        <div className="vessel-tip-detail">{info.detail}</div>
        <div className="vessel-tip-hint">Click to open {MODULE_SHORT_NAMES[info.module]}</div>
      </div>
    </Html>
  );
}

function Vessel({
  spec,
  hovered,
  setHovered,
  onSelectModule,
}: {
  spec: VesselSpec;
  hovered: string | null;
  setHovered: (id: string | null) => void;
  onSelectModule?: (module: ModuleKind) => void;
}) {
  const R = spec.shellId / 2;
  const L = spec.tubeLength;
  const ts = spec.tubeSheetThk;
  const fl = spec.flangeThk;
  const tsR = spec.tubeSheetOD / 2;
  const dishDepth = R / 2; // 2:1 ellipsoidal head
  const bonnet = { front: spec.bonnetFrontLength, rear: spec.bonnetRearLength };
  const stack = fl + ts + fl; // shell flange + tube sheet + channel flange
  const saddleDrop = R * 0.42;

  const g = useMemo(() => {
    const along = (geo: THREE.BufferGeometry) => geo.rotateZ(Math.PI / 2); // cylinder axis -> X
    return {
      shell: along(new THREE.CylinderGeometry(R, R, L, 64, 1, true)),
      tubeSheet: along(new THREE.CylinderGeometry(tsR, tsR, ts, 64)),
      flange: along(new THREE.CylinderGeometry(tsR, tsR, fl, 64)),
      bonnetFront: along(new THREE.CylinderGeometry(R, R, bonnet.front, 64, 1, true)),
      bonnetRear: along(new THREE.CylinderGeometry(R, R, bonnet.rear, 64, 1, true)),
      head: new THREE.SphereGeometry(R, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2),
      baffle: baffleGeometry(spec, Math.max(6, spec.shellId * 0.008)),
    };
  }, [R, L, ts, fl, tsR, bonnet.front, bonnet.rear, spec]);

  const shellEdges = useMemo(() => new THREE.EdgesGeometry(g.shell, 30), [g.shell]);
  const frontEdges = useMemo(() => new THREE.EdgesGeometry(g.bonnetFront, 30), [g.bonnetFront]);
  const rearEdges = useMemo(() => new THREE.EdgesGeometry(g.bonnetRear, 30), [g.bonnetRear]);

  const xShellEnd = L / 2;
  const xFront = -(xShellEnd + stack + bonnet.front / 2);
  const xRear = xShellEnd + stack + bonnet.rear / 2;

  const info: Record<string, PartInfo> = {
    shell: { id: "shell", module: "HeatExchangerFab", title: "Shell", detail: `ID ${spec.shellId} mm × ${spec.tubeLength} mm`, anchor: [0, R * 1.15, 0] },
    bundle: { id: "bundle", module: "HeatExchangerFab", title: "Tube bundle", detail: `${spec.tubeQty} tubes · Ø${spec.tubeOD} mm · 1.25×OD pitch`, anchor: [0, 0, R * 0.2] },
    baffles: { id: "baffles", module: "HeatExchangerFab", title: "Baffles", detail: `${spec.baffleQty} × segmental · OD ${spec.baffleOD} mm`, anchor: [0, -R * 0.55, 0] },
    tubesheet: { id: "tubesheet", module: "TubeSheet", title: "Tube sheets", detail: `Ø${spec.tubeSheetOD} × ${spec.tubeSheetThk} mm (×2)`, anchor: [xShellEnd + stack / 2, tsR * 1.08, 0] },
    flanges: { id: "flanges", module: "BonnetFlange", title: "Body flanges", detail: `${spec.boltQty} bolts on PCD ${spec.boltPCD} mm`, anchor: [-(xShellEnd + stack / 2), tsR * 1.08, 0] },
    bonnets: { id: "bonnets", module: "BonnetFlange", title: "Bonnets & dish ends", detail: `${spec.bonnetFrontLength} / ${spec.bonnetRearLength} mm · 2:1 heads`, anchor: [xRear, R * 1.12, 0] },
    nozzles: { id: "nozzles", module: "HeatExchangerFab", title: "Nozzles", detail: spec.nozzles.map((n) => `${n.id} ${n.sizeMm}`).join(" · ") + " (NB)", anchor: [0, R * 1.9, 0] },
    saddles: { id: "saddles", module: "HeatExchangerFab", title: "Saddle supports", detail: "2 saddles, fixed + sliding", anchor: [L * 0.3, -R - saddleDrop * 0.6, R * 0.6] },
  };

  const active = (id: string) => hovered === id;
  const glass = (module: ModuleKind, id: string, opacity: number) =>
    metal(module, active(id), { transparent: true, opacity: active(id) ? opacity + 0.15 : opacity, depthWrite: false, side: THREE.DoubleSide });

  const partProps = { hovered, setHovered, onSelect: onSelectModule };

  return (
    <group>
      {/* Shell: see-through so the bundle and baffles read inside it. */}
      <Part info={info.shell} {...partProps}>
        <mesh geometry={g.shell} renderOrder={2}>
          <meshStandardMaterial {...glass("HeatExchangerFab", "shell", 0.16)} />
        </mesh>
        <lineSegments geometry={shellEdges}>
          <lineBasicMaterial color={MODULE_COLORS.HeatExchangerFab} transparent opacity={0.7} />
        </lineSegments>
      </Part>

      <Part info={info.bundle} {...partProps}>
        <TubeBundle spec={spec} length={L + 2 * (fl + ts)} active={active("bundle")} />
      </Part>

      <Part info={info.baffles} {...partProps}>
        {Array.from({ length: spec.baffleQty }, (_, i) => {
          const x = -L / 2 + (L * (i + 1)) / (spec.baffleQty + 1);
          return (
            <mesh key={i} geometry={g.baffle} position={[x, 0, 0]} rotation={[i % 2 === 0 ? 0 : Math.PI, Math.PI / 2, 0]}>
              <meshStandardMaterial {...metal("HeatExchangerFab", active("baffles"), { transparent: true, opacity: 0.85 })} />
            </mesh>
          );
        })}
      </Part>

      {/* Tube sheets, sandwiched between the shell and channel flanges. */}
      <Part info={info.tubesheet} {...partProps}>
        {[-1, 1].map((side) => (
          <mesh key={side} geometry={g.tubeSheet} position={[side * (xShellEnd + fl + ts / 2), 0, 0]}>
            <meshStandardMaterial {...metal("TubeSheet", active("tubesheet"))} />
          </mesh>
        ))}
      </Part>

      <Part info={info.flanges} {...partProps}>
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh geometry={g.flange} position={[side * (xShellEnd + fl / 2), 0, 0]}>
              <meshStandardMaterial {...metal("BonnetFlange", active("flanges"))} />
            </mesh>
            <mesh geometry={g.flange} position={[side * (xShellEnd + fl + ts + fl / 2), 0, 0]}>
              <meshStandardMaterial {...metal("BonnetFlange", active("flanges"))} />
            </mesh>
            <Bolts spec={spec} x={side * (xShellEnd + stack / 2)} length={stack + fl * 0.9} active={active("flanges")} />
          </group>
        ))}
      </Part>

      {/* Bonnets (channels) with 2:1 ellipsoidal dish ends. */}
      <Part info={info.bonnets} {...partProps}>
        <mesh geometry={g.bonnetFront} position={[xFront, 0, 0]} renderOrder={2}>
          <meshStandardMaterial {...glass("BonnetFlange", "bonnets", 0.22)} />
        </mesh>
        <lineSegments geometry={frontEdges} position={[xFront, 0, 0]}>
          <lineBasicMaterial color={MODULE_COLORS.BonnetFlange} transparent opacity={0.7} />
        </lineSegments>
        <mesh geometry={g.bonnetRear} position={[xRear, 0, 0]} renderOrder={2}>
          <meshStandardMaterial {...glass("BonnetFlange", "bonnets", 0.22)} />
        </mesh>
        <lineSegments geometry={rearEdges} position={[xRear, 0, 0]}>
          <lineBasicMaterial color={MODULE_COLORS.BonnetFlange} transparent opacity={0.7} />
        </lineSegments>
        <mesh geometry={g.head} position={[xFront - bonnet.front / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, dishDepth / R, 1]} renderOrder={2}>
          <meshStandardMaterial {...glass("BonnetFlange", "bonnets", 0.3)} />
        </mesh>
        <mesh geometry={g.head} position={[xRear + bonnet.rear / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]} scale={[1, dishDepth / R, 1]} renderOrder={2}>
          <meshStandardMaterial {...glass("BonnetFlange", "bonnets", 0.3)} />
        </mesh>
      </Part>

      <Part info={info.nozzles} {...partProps}>
        {spec.nozzles.map((n, i) => {
          const count = spec.nozzles.length;
          const x = count === 1 ? 0 : -L / 2 + L * (0.12 + (0.76 * i) / (count - 1));
          const projection = R * 0.45 + n.sizeMm;
          const a = (n.angleDeg * Math.PI) / 180;
          const dir = new THREE.Vector3(0, Math.cos(a), Math.sin(a));
          const neckCenter = dir.clone().multiplyScalar(R + projection / 2 - R * 0.05);
          const flangeCenter = dir.clone().multiplyScalar(R + projection);
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
          return (
            <group key={n.id + i}>
              <mesh position={[x, neckCenter.y, neckCenter.z]} quaternion={q}>
                <cylinderGeometry args={[n.sizeMm / 2, n.sizeMm / 2, projection, 24]} />
                <meshStandardMaterial {...metal("HeatExchangerFab", active("nozzles"))} />
              </mesh>
              <mesh position={[x, flangeCenter.y, flangeCenter.z]} quaternion={q}>
                <cylinderGeometry args={[n.sizeMm, n.sizeMm, Math.max(12, n.sizeMm * 0.22), 32]} />
                <meshStandardMaterial {...metal("HeatExchangerFab", active("nozzles"))} />
              </mesh>
            </group>
          );
        })}
      </Part>

      <Part info={info.saddles} {...partProps}>
        {[-0.3, 0.3].map((f) => (
          <group key={f} position={[L * f, -R - saddleDrop / 2, 0]}>
            <mesh>
              <boxGeometry args={[R * 0.22, saddleDrop, R * 1.6]} />
              <meshStandardMaterial {...metal("HeatExchangerFab", active("saddles"), { roughness: 0.6, metalness: 0.3 })} />
            </mesh>
            <mesh position={[0, -saddleDrop / 2 - R * 0.03, 0]}>
              <boxGeometry args={[R * 0.4, R * 0.06, R * 1.75]} />
              <meshStandardMaterial {...metal("HeatExchangerFab", active("saddles"), { roughness: 0.6, metalness: 0.3 })} />
            </mesh>
          </group>
        ))}
      </Part>

      {hovered && info[hovered] && <Label info={info[hovered]} />}
    </group>
  );
}

interface VesselViewport3DProps {
  spec: VesselSpec;
  onSelectModule?: (module: ModuleKind) => void;
  onClose?: () => void;
}

/**
 * Digital twin of a shell-and-tube heat exchanger, built to scale from a
 * real job's dimensions (shell ID, tube count/OD/length, baffles, tube
 * sheets, flange bolting, bonnet lengths, nozzles). Parts are tinted by the
 * module that produces them; hover for dimensions, click to open the module.
 */
export function VesselViewport3D({ spec, onSelectModule, onClose }: VesselViewport3DProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);

  const overall =
    spec.tubeLength + 2 * (2 * spec.flangeThk + spec.tubeSheetThk) + spec.bonnetFrontLength + spec.bonnetRearLength + spec.shellId / 2;
  const scale = SCENE_LENGTH / overall;
  const floorY = -(spec.shellId / 2) * 1.48 * scale; // saddle base

  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  return (
    <div className="vessel-viewport">
      <Canvas camera={{ position: [4.3, 2.1, 4.8], fov: 38 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={["#0b1220"]} />
        <hemisphereLight args={["#cfe0ff", "#0b1220", 0.55]} />
        <directionalLight position={[6, 8, 5]} intensity={1.6} />
        <directionalLight position={[-6, 3, -4]} intensity={0.5} color="#9cc0ff" />
        <group scale={scale}>
          <Vessel spec={spec} hovered={hovered} setHovered={setHovered} onSelectModule={onSelectModule} />
        </group>
        <ContactShadows position={[0, floorY, 0]} opacity={0.55} scale={SCENE_LENGTH * 1.6} blur={2.4} far={3} />
        <gridHelper args={[SCENE_LENGTH * 2, 24, "#1d2a44", "#141f33"]} position={[0, floorY - 0.001, 0]} />
        <OrbitControls
          ref={controls}
          enablePan={false}
          minDistance={3.5}
          maxDistance={12}
          maxPolarAngle={Math.PI / 2.05}
          autoRotate={autoRotate && hovered === null}
          autoRotateSpeed={0.6}
        />
      </Canvas>

      <div className="vessel-overlay vessel-overlay-top">
        <div className="vessel-caption">
          <span className="vessel-caption-title">Digital twin</span>
          <span className="vessel-caption-source">
            {spec.jobId
              ? `Built from ${spec.jobId} · Shell Ø${spec.shellId} mm · ${spec.tubeQty} tubes · ${spec.baffleQty} baffles`
              : "Typical proportions · run a Heat Exchanger Fab job to model your own"}
          </span>
        </div>
        <div className="vessel-legend" aria-label="Open a module">
          {MODULE_OPTIONS.map((m) => (
            <button key={m.kind} type="button" onClick={() => onSelectModule?.(m.kind)}>
              <span className="vessel-tip-swatch" style={{ background: MODULE_COLORS[m.kind] }} />
              {MODULE_SHORT_NAMES[m.kind]}
            </button>
          ))}
        </div>
      </div>

      <div className="vessel-overlay vessel-overlay-bottom">
        <span className="vessel-hint">Drag to orbit · scroll to zoom · hover a part · click to open its module</span>
        <div className="vessel-actions">
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
