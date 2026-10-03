import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, Html, Lightformer, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { TankModuleKind } from "../../types/engineering";

/**
 * Interactive digital twin of a storage tank - the tank counterpart of
 * VesselViewport3D. Built to scale from the workspace inputs (or a finished
 * run's parameters): Shop Tank = vertical shell, 2:1 dished heads, course
 * seams, stiffener rings, leg supports with base plates, nozzles and a
 * manway; Site Tank = coursed shell with per-course thicknesses, self-
 * supported cone roof with rafters, centre drum and curb, sloped bottom,
 * anchor chairs, spiral stair with handrail, nozzles and a shell manway.
 * Hover a part for its dimensions; Solid / X-ray reveals the internals.
 */
export interface TankTwinSpec {
  module: TankModuleKind;
  /** mm */
  shellId: number;
  /** mm (shell height for Shop Tank, tank height for Site Tank) */
  height: number;
  courseHeight: number;
  /** Shop Tank */
  straightFlange?: number;
  legs?: number;
  legNb?: number;
  basePlate?: number;
  stiffeners?: number;
  /** Site Tank */
  coneDeg?: number;
  slopeRatio?: number;
  rafters?: number;
  anchorChairs?: number;
  drumDia?: number;
  /** Optional result values (thicknesses etc.) keyed by contract parameter key. */
  params?: Record<string, string>;
  /** Job the dimensions came from, or null when previewing the form. */
  jobId?: string | null;
}

const TANK_TINT = new THREE.Color("#9aabc2").lerp(new THREE.Color("#8b97ab"), 0.3);
const ACCENT = "#06b6d4";
const SCENE = 5;
/** Scene y of the model origin (base plates / bottom plate rim). */
const BASE_Y = -2.2;

interface PartInfo {
  id: string;
  title: string;
  detail: string;
  anchor: [number, number, number];
}

function steel(active: boolean, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return {
    color: TANK_TINT,
    metalness: 0.65,
    roughness: 0.32,
    emissive: new THREE.Color(ACCENT),
    emissiveIntensity: active ? 0.35 : 0.02,
    ...opts,
  };
}

function Part({ info, hovered, setHovered, children }: { info: PartInfo; hovered: string | null; setHovered: (id: string | null) => void; children: React.ReactNode }) {
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
      {hovered === info.id && (
        <Html position={info.anchor} center distanceFactor={undefined} zIndexRange={[20, 0]}>
          <div className="vessel-tip">
            <div className="vessel-tip-head">
              <span className="vessel-tip-swatch" style={{ background: ACCENT }} />
              {info.title}
            </div>
            <div className="vessel-tip-detail">{info.detail}</div>
          </div>
        </Html>
      )}
    </group>
  );
}

const p = (params: Record<string, string> | undefined, key: string, unit = "mm") => (params?.[key] ? `${params[key]} ${unit}`.trim() : null);

/** Opaque or see-through material for the outer skin, depending on the view. */
function skin(xray: boolean, active: boolean) {
  return xray
    ? steel(active, { transparent: true, opacity: active ? 0.38 : 0.2, depthWrite: false, side: THREE.DoubleSide })
    : // Explicit values: R3F keeps a material prop's last value when it stops being passed.
      steel(active, { transparent: false, opacity: 1, depthWrite: true, side: THREE.DoubleSide });
}

function ShopTank({ s, xray, hovered, setHovered }: { s: TankTwinSpec; xray: boolean; hovered: string | null; setHovered: (id: string | null) => void }) {
  const R = s.shellId / 2;
  const H = s.height;
  const head = R * 0.5;
  const sf = s.straightFlange ?? 25;
  const legs = s.legs ?? (s.shellId >= 1100 ? 4 : 3);
  const legR = Math.max(30, ((s.legNb ?? (s.shellId >= 1300 ? 100 : s.shellId >= 1100 ? 80 : 65)) * 1.15) / 2);
  const bp = s.basePlate ?? (s.shellId >= 1300 ? 200 : s.shellId >= 1100 ? 150 : 125);
  const legLen = Math.max(450, R * 0.9);
  const courses = Math.max(1, Math.ceil(H / Math.max(1, s.courseHeight)));
  const stiff = s.stiffeners ?? 0;
  const a = (id: string) => hovered === id;
  const parts: Record<string, PartInfo> = {
    shell: { id: "shell", title: "Shell", detail: [`ID ${s.shellId} × ${H} mm`, p(s.params, "SHELL_THK") && `t ${p(s.params, "SHELL_THK")}`, `${courses} course${courses > 1 ? "s" : ""}`].filter(Boolean).join(" · "), anchor: [R * 1.05, 0, 0] },
    heads: { id: "heads", title: "Dished heads (2:1)", detail: [p(s.params, "TOP_DISH_THK") && `top ${p(s.params, "TOP_DISH_THK")}`, p(s.params, "BOTTOM_DISH_THK") && `bottom ${p(s.params, "BOTTOM_DISH_THK")}`, `SF ${sf} mm`].filter(Boolean).join(" · "), anchor: [0, H / 2 + head * 1.1, 0] },
    legs: { id: "legs", title: "Leg supports", detail: `${legs} × ${s.legNb ?? (s.shellId >= 1300 ? 100 : s.shellId >= 1100 ? 80 : 65)} NB pipe · base plate ${bp} × ${bp}`, anchor: [R, -H / 2 - legLen * 0.6, 0] },
    nozzles: { id: "nozzles", title: "Nozzles & manway", detail: "Top N1 · side inlet · manway · bottom drain", anchor: [0, H / 2 + head + 220, 0] },
    stiff: { id: "stiff", title: "Stiffener rings", detail: `${stiff} ring${stiff === 1 ? "" : "s"}${p(s.params, "STIFFENER_SIZE") ? ` · ${p(s.params, "STIFFENER_SIZE")} × ${p(s.params, "STIFFENER_THK")}` : ""}`, anchor: [R * 1.1, H / 4, 0] },
  };
  const nozzle = (pos: [number, number, number], rot: [number, number, number], r: number, len: number, key: string) => (
    <group key={key} position={pos} rotation={rot}>
      <mesh position={[0, len / 2, 0]}>
        <cylinderGeometry args={[r, r, len, 32]} />
        <meshStandardMaterial {...steel(a("nozzles"))} />
      </mesh>
      <mesh position={[0, len, 0]}>
        <cylinderGeometry args={[r * 1.9, r * 1.9, 22, 40]} />
        <meshStandardMaterial {...steel(a("nozzles"))} />
      </mesh>
    </group>
  );
  return (
    // Base plates sit on y = 0.
    <group position={[0, H / 2 + legLen, 0]}>
      <Part info={parts.shell} hovered={hovered} setHovered={setHovered}>
        <mesh>
          <cylinderGeometry args={[R, R, H, 96, 1, true]} />
          <meshStandardMaterial {...skin(xray, a("shell"))} />
        </mesh>
        {Array.from({ length: courses - 1 }, (_, i) => -H / 2 + (H * (i + 1)) / courses).map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[R + 2, 3, 6, 96]} />
            <meshStandardMaterial color="#6b7a94" metalness={0.6} roughness={0.4} />
          </mesh>
        ))}
      </Part>
      <Part info={parts.heads} hovered={hovered} setHovered={setHovered}>
        {[1, -1].map((sg) => (
          <group key={sg}>
            <mesh position={[0, sg * (H / 2 + sf / 2), 0]}>
              <cylinderGeometry args={[R, R, sf, 96, 1, true]} />
              <meshStandardMaterial {...skin(xray, a("heads"))} />
            </mesh>
            <mesh position={[0, sg * (H / 2 + sf), 0]} rotation={[sg > 0 ? 0 : Math.PI, 0, 0]} scale={[1, 0.5, 1]}>
              <sphereGeometry args={[R, 72, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial {...skin(xray, a("heads"))} />
            </mesh>
          </group>
        ))}
      </Part>
      {stiff > 0 && (
        <Part info={parts.stiff} hovered={hovered} setHovered={setHovered}>
          {Array.from({ length: stiff }, (_, i) => -H / 2 + (H * (i + 1)) / (stiff + 1)).map((y) => (
            <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[R + 18, 14, 8, 96]} />
              <meshStandardMaterial {...steel(a("stiff"))} />
            </mesh>
          ))}
        </Part>
      )}
      <Part info={parts.legs} hovered={hovered} setHovered={setHovered}>
        {Array.from({ length: legs }, (_, i) => (legs === 4 ? Math.PI / 4 : 0) + (i / legs) * Math.PI * 2).map((ang) => {
          const x = Math.cos(ang) * R;
          const z = Math.sin(ang) * R;
          return (
            <group key={ang} position={[x, 0, z]}>
              <mesh position={[0, -H / 2 - legLen / 2 + 120, 0]}>
                <cylinderGeometry args={[legR, legR, legLen + 240, 24]} />
                <meshStandardMaterial {...steel(a("legs"), { color: "#7f8a9b" })} />
              </mesh>
              <mesh position={[0, -H / 2 - legLen, 0]}>
                <boxGeometry args={[bp, 14, bp]} />
                <meshStandardMaterial {...steel(a("legs"), { color: "#7f8a9b" })} />
              </mesh>
              <mesh position={[0, -H / 2 + 180, 0]} rotation={[0, -ang, 0]}>
                <boxGeometry args={[12, 260, legR * 2.4]} />
                <meshStandardMaterial {...steel(a("legs"))} />
              </mesh>
            </group>
          );
        })}
      </Part>
      <Part info={parts.nozzles} hovered={hovered} setHovered={setHovered}>
        {nozzle([0, H / 2 + sf + head - 10, 0], [0, 0, 0], 55, 180, "n1")}
        {nozzle([R - 5, H * 0.25, 0], [0, 0, -Math.PI / 2], 45, 160, "n2")}
        {nozzle([0, -H * 0.05, R - 5], [Math.PI / 2, 0, 0], R * 0.22, 90, "mw")}
        {nozzle([0, -H / 2 - sf - head + 10, 0], [Math.PI, 0, 0], 32, 140, "n3")}
      </Part>
    </group>
  );
}

function SiteTank({ s, xray, hovered, setHovered }: { s: TankTwinSpec; xray: boolean; hovered: string | null; setHovered: (id: string | null) => void }) {
  const R = s.shellId / 2;
  const H = s.height;
  const courses = Math.max(1, Math.round(H / Math.max(1, s.courseHeight)));
  const cone = ((s.coneDeg ?? 15) * Math.PI) / 180;
  const coneH = (R + 75) * Math.tan(cone);
  const drop = s.shellId / Math.max(5, s.slopeRatio ?? 25);
  const rafters = s.rafters ?? (s.shellId > 9000 ? 20 : s.shellId > 7500 ? 12 : s.shellId > 5500 ? 10 : 8);
  const anchors = s.anchorChairs ?? (s.shellId > 7500 ? 24 : 12);
  const drum = s.drumDia ?? 750;
  const a = (id: string) => hovered === id;
  const courseThk = (i: number) => s.params?.[`COURSE_${i + 1}_THK`];
  const parts: Record<string, PartInfo> = {
    shell: { id: "shell", title: "Shell courses", detail: `ID ${s.shellId} × H ${H} mm · ${courses} × ${s.courseHeight} mm${courseThk(0) ? ` · ${courseThk(0)}→${courseThk(courses - 1) ?? courseThk(0)} mm thk` : ""}`, anchor: [R * 1.04, H * 0.55, 0] },
    roof: { id: "roof", title: "Cone roof", detail: `${s.coneDeg ?? 15}° self-supported${p(s.params, "ROOF_PLATE_THK") ? ` · ${p(s.params, "ROOF_PLATE_THK")}` : ""} · ${rafters} rafters`, anchor: [0, H + coneH + 400, 0] },
    drum: { id: "drum", title: "Centre drum", detail: `Ø${drum} mm`, anchor: [0, H + coneH + 250, 0] },
    bottom: { id: "bottom", title: "Bottom plate", detail: `Ø${s.shellId + 100} mm · slope 1:${s.slopeRatio ?? 25}${p(s.params, "BASE_PLATE_THK") ? ` · ${p(s.params, "BASE_PLATE_THK")}` : ""}`, anchor: [R * 0.6, -drop / 2, R * 0.6] },
    anchors: { id: "anchors", title: "Anchor chairs", detail: `${anchors} × M36 foundation bolts on PCD ${s.shellId + 200} mm`, anchor: [R + 150, 200, 0] },
    stair: { id: "stair", title: "Spiral stair", detail: "Roof access with handrail", anchor: [0, H * 0.5, -(R + 600)] },
    nozzles: { id: "nozzles", title: "Nozzles & manway", detail: "Inlet · outlet · shell manway", anchor: [-(R + 300), 600, 0] },
  };
  const stairSteps = Math.max(10, Math.round(H / 230));
  return (
    <group>
      <Part info={parts.shell} hovered={hovered} setHovered={setHovered}>
        {Array.from({ length: courses }, (_, i) => (
          <mesh key={i} position={[0, (H * (i + 0.5)) / courses, 0]}>
            <cylinderGeometry args={[R, R, H / courses - 4, 128, 1, true]} />
            <meshStandardMaterial {...skin(xray, a("shell"))} />
          </mesh>
        ))}
        {Array.from({ length: courses - 1 }, (_, i) => (H * (i + 1)) / courses).map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[R + 6, 9, 6, 128]} />
            <meshStandardMaterial color="#6b7a94" metalness={0.6} roughness={0.4} />
          </mesh>
        ))}
        <mesh position={[0, H, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[R + 40, 45, 8, 128]} />
          <meshStandardMaterial {...steel(a("shell"), { color: "#7f8a9b" })} />
        </mesh>
      </Part>
      <Part info={parts.roof} hovered={hovered} setHovered={setHovered}>
        <mesh position={[0, H + coneH / 2, 0]}>
          <coneGeometry args={[R + 75, coneH, 128, 1, true]} />
          <meshStandardMaterial {...skin(xray, a("roof"))} />
        </mesh>
        {Array.from({ length: rafters }, (_, i) => (i / rafters) * Math.PI * 2).map((ang) => {
          const len = (R - drum / 2) / Math.cos(cone);
          const mid = (R + drum / 2) / 2;
          return (
            <mesh key={ang} position={[Math.cos(ang) * mid, H + (R - mid) * Math.tan(cone) - 70, Math.sin(ang) * mid]} rotation={[0, -ang, -cone]}>
              <boxGeometry args={[len, 120, 60]} />
              <meshStandardMaterial {...steel(a("roof"), { color: "#7f8a9b" })} />
            </mesh>
          );
        })}
      </Part>
      <Part info={parts.drum} hovered={hovered} setHovered={setHovered}>
        <mesh position={[0, H + coneH - 60, 0]}>
          <cylinderGeometry args={[drum / 2, drum / 2, 260, 48]} />
          <meshStandardMaterial {...steel(a("drum"))} />
        </mesh>
      </Part>
      <Part info={parts.bottom} hovered={hovered} setHovered={setHovered}>
        <mesh position={[0, -drop / 2, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[R + 50, drop, 96, 1, true]} />
          <meshStandardMaterial {...steel(a("bottom"), { side: THREE.DoubleSide, color: "#7f8a9b" })} />
        </mesh>
        <mesh position={[0, -drop - 40, 0]}>
          <cylinderGeometry args={[R + 400, R + 450, 80, 96]} />
          <meshStandardMaterial color="#3a4357" roughness={0.9} metalness={0.05} />
        </mesh>
      </Part>
      <Part info={parts.anchors} hovered={hovered} setHovered={setHovered}>
        {Array.from({ length: anchors }, (_, i) => (i / anchors) * Math.PI * 2).map((ang) => (
          <mesh key={ang} position={[Math.cos(ang) * (R + 90), 220, Math.sin(ang) * (R + 90)]} rotation={[0, -ang, 0]}>
            <boxGeometry args={[180, 440, 160]} />
            <meshStandardMaterial {...steel(a("anchors"), { color: "#7f8a9b" })} />
          </mesh>
        ))}
      </Part>
      <Part info={parts.stair} hovered={hovered} setHovered={setHovered}>
        {Array.from({ length: stairSteps }, (_, i) => {
          const t = i / (stairSteps - 1);
          const ang = -Math.PI * 0.05 + t * Math.PI * 0.55; // on the side facing the default camera
          const rr = R + 420;
          return (
            <group key={i}>
              <mesh position={[Math.cos(ang) * rr, 120 + t * (H - 200), Math.sin(ang) * rr]} rotation={[0, -ang, 0]}>
                <boxGeometry args={[720, 30, 240]} />
                <meshStandardMaterial {...steel(a("stair"), { color: "#7f8a9b" })} />
              </mesh>
              <mesh position={[Math.cos(ang) * (rr + 380), 120 + t * (H - 200) + 500, Math.sin(ang) * (rr + 380)]}>
                <cylinderGeometry args={[14, 14, 1000, 8]} />
                <meshStandardMaterial {...steel(a("stair"), { color: "#9aa5b5" })} />
              </mesh>
            </group>
          );
        })}
      </Part>
      <Part info={parts.nozzles} hovered={hovered} setHovered={setHovered}>
        {[
          { ang: Math.PI * 0.85, y: 700, r: 160, len: 380 },
          { ang: Math.PI * 1.0, y: 450, r: 120, len: 320 },
          { ang: Math.PI * 0.6, y: 900, r: 330, len: 160 },
        ].map((n) => (
          <group key={n.ang} position={[Math.cos(n.ang) * R, n.y, Math.sin(n.ang) * R]} rotation={[0, -n.ang, -Math.PI / 2]}>
            <mesh position={[0, n.len / 2, 0]}>
              <cylinderGeometry args={[n.r, n.r, n.len, 32]} />
              <meshStandardMaterial {...steel(a("nozzles"))} />
            </mesh>
            <mesh position={[0, n.len, 0]}>
              <cylinderGeometry args={[n.r * 1.6, n.r * 1.6, 50, 40]} />
              <meshStandardMaterial {...steel(a("nozzles"))} />
            </mesh>
          </group>
        ))}
      </Part>
    </group>
  );
}

export function TankViewport3D({ spec, onClose }: { spec: TankTwinSpec; onClose?: () => void }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [xray, setXray] = useState(false);
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);

  /** Scene scale and the model-space y of the ground (mm). Every tank stands on BASE_Y. */
  const { scale, groundMm } = useMemo(() => {
    if (spec.module === "ShopTank") {
      const R = spec.shellId / 2;
      const legLen = Math.max(450, R * 0.9);
      const total = spec.height + 2 * (spec.straightFlange ?? 25) + R + legLen + 200;
      return { scale: SCENE / Math.max(total, spec.shellId * 1.8), groundMm: 0 };
    }
    const cone = ((spec.coneDeg ?? 15) * Math.PI) / 180;
    const total = Math.max(spec.shellId * 1.3, spec.height + (spec.shellId / 2) * Math.tan(cone) + 800);
    const drop = spec.shellId / Math.max(5, spec.slopeRatio ?? 25);
    return { scale: SCENE / total, groundMm: -drop - 80 };
  }, [spec]);
  const floorY = BASE_Y + groundMm * scale;
  const target: [number, number, number] = [0, BASE_Y + SCENE * (spec.module === "ShopTank" ? 0.42 : 0.4), 0];

  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  const title = spec.module === "ShopTank" ? "Shop tank digital twin" : "Site tank digital twin";
  const source = spec.jobId
    ? `Built from ${spec.jobId} · Shell Ø${spec.shellId} mm · H ${spec.height} mm`
    : `From your inputs · Shell Ø${Math.round(spec.shellId)} mm · H ${Math.round(spec.height)} mm`;

  return (
    <div className="vessel-viewport">
      <Canvas camera={{ position: spec.module === "ShopTank" ? [5.2, 3.2, 6.2] : [7.4, 4.4, 8.8], fov: 36 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={["#0b1220"]} />
        <hemisphereLight args={["#cfe0ff", "#0b1220", 0.35]} />
        <directionalLight position={[6, 9, 5]} intensity={1.3} />
        <Environment resolution={256} frames={1}>
          <Lightformer form="rect" intensity={2.4} position={[0, 6, 2]} scale={[12, 3, 1]} rotation-x={Math.PI / 2} />
          <Lightformer form="rect" intensity={1.4} position={[6, 1, 3]} scale={[3, 7, 1]} rotation-y={-Math.PI / 2.5} />
          <Lightformer form="rect" intensity={1.8} position={[-6, 1, -3]} scale={[4, 7, 1]} rotation-y={Math.PI / 2.5} color="#bcd4ff" />
        </Environment>
        <group position={[0, BASE_Y, 0]} scale={scale}>
          {spec.module === "ShopTank" ? (
            <ShopTank s={spec} xray={xray} hovered={hovered} setHovered={setHovered} />
          ) : (
            <SiteTank s={spec} xray={xray} hovered={hovered} setHovered={setHovered} />
          )}
        </group>
        <ContactShadows position={[0, floorY, 0]} opacity={0.6} scale={SCENE * 2.2} blur={2.6} far={4} />
        <gridHelper args={[SCENE * 2.4, 24, "#1d2a44", "#141f33"]} position={[0, floorY - 0.002, 0]} />
        <OrbitControls ref={controls} enablePan={false} minDistance={4} maxDistance={14} maxPolarAngle={Math.PI / 2.05} autoRotate={autoRotate && hovered === null} autoRotateSpeed={0.6} target={target} />
      </Canvas>

      <div className="vessel-overlay vessel-overlay-top">
        <div className="vessel-caption">
          <span className="vessel-caption-title">{title}</span>
          <span className="vessel-caption-source">{source}</span>
        </div>
      </div>

      <div className="vessel-overlay vessel-overlay-bottom">
        <span className="vessel-hint">Drag to orbit · scroll to zoom · hover a part for its dimensions</span>
        <div className="vessel-actions">
          <button type="button" onClick={() => setXray((v) => !v)} aria-pressed={xray}>
            {xray ? "Solid view" : "X-ray view"}
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
