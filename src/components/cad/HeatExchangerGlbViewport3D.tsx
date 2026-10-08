import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Environment, Html, Lightformer, OrbitControls, useGLTF } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";

/**
 * Detailed digital twin of a BEM 2-pass shell-and-tube heat exchanger, loaded
 * from a modelled glTF (106 named parts, instanced tubes and bolting, each part
 * carrying its own title / size / material). The file is saved in an exploded
 * pose with see-through materials, so on load every material is made opaque
 * (and restored per view for X-ray), and "Assembled" slides the shell and the
 * two end assemblies back to the tube sheets using offsets measured from the
 * model itself.
 */
const MODEL_URL = "/models/hx-bem-2pass.glb";
const ACCENT = "#38bdf8";
/** Scene y of the ground; the model's supports stand on y = 0 in model space. */
const GROUND_Y = -1.3;

interface PartInfo {
  title: string;
  size?: string;
  mat?: string;
}

/** Nearest ancestor (or the mesh itself) that carries part info from the glTF extras. */
function partOf(obj: THREE.Object3D | null): { name: string; info: PartInfo } | null {
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) {
    const info = (o.userData as { info?: PartInfo }).info;
    if (info?.title) return { name: o.name, info };
  }
  return null;
}

function findNode(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
  return root.getObjectByName(name);
}

function worldBox(obj: THREE.Object3D | undefined) {
  return obj ? new THREE.Box3().setFromObject(obj) : new THREE.Box3();
}

interface Hover {
  id: string;
  info: PartInfo;
  point: THREE.Vector3;
}

function Exchanger({ xray, assembled, hovered, setHovered }: {
  xray: boolean;
  assembled: boolean;
  hovered: Hover | null;
  setHovered: (h: Hover | null) => void;
}) {
  const { scene } = useGLTF(MODEL_URL);
  const root = useMemo(() => scene.clone(true), [scene]);
  const mats = useRef<THREE.MeshStandardMaterial[]>([]);
  const groups = useRef<{ shell?: THREE.Object3D; front?: THREE.Object3D; rear?: THREE.Object3D }>({});
  const target = useRef({ shellDy: 0, frontDx: 0, rearDx: 0 });
  const base = useRef({ shellY: 0, frontX: 0, rearX: 0 });
  const t = useRef(0);

  // One-time prep: collect materials and measure the assembled offsets. No real-time shadow map:
  // it would draw the 174k-triangle model twice per frame; ContactShadows grounds it instead.
  useEffect(() => {
    const seen = new Set<THREE.MeshStandardMaterial>();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of ([] as THREE.Material[]).concat(mesh.material)) seen.add(m as THREE.MeshStandardMaterial);
    });
    mats.current = [...seen];

    root.updateWorldMatrix(true, true);
    const shell = findNode(root, "shell_assembly");
    const front = findNode(root, "front_end");
    const rear = findNode(root, "rear_end");
    groups.current = { shell, front, rear };
    base.current = { shellY: shell?.position.y ?? 0, frontX: front?.position.x ?? 0, rearX: rear?.position.x ?? 0 };

    const tsFront = worldBox(findNode(root, "tubesheet_front"));
    const tsRear = worldBox(findNode(root, "tubesheet_rear"));
    const shellBody = worldBox(findNode(root, "shell"));
    const frontBox = worldBox(front);
    const rearBox = worldBox(rear);
    const axisY = (tsFront.min.y + tsFront.max.y) / 2;
    target.current = {
      // Move the shell back down onto the tube axis, the end heads onto the tube-sheet faces.
      shellDy: axisY - (shellBody.min.y + shellBody.max.y) / 2,
      frontDx: tsFront.min.x - frontBox.max.x,
      rearDx: tsRear.max.x - rearBox.min.x,
    };
  }, [root]);

  // Opaque by default (the file ships at ~9-22% opacity); see-through for X-ray. Explicit values
  // for every property so toggling back fully restores the solid look.
  useEffect(() => {
    for (const m of mats.current) {
      m.transparent = xray;
      m.opacity = xray ? 0.2 : 1;
      m.depthWrite = !xray;
      m.side = xray ? THREE.DoubleSide : THREE.FrontSide;
      m.alphaTest = 0;
      m.needsUpdate = true;
    }
  }, [xray, root]);

  // Smoothly slide between the exploded (as modelled) and assembled poses.
  useFrame((_, dt) => {
    const goal = assembled ? 1 : 0;
    t.current += (goal - t.current) * Math.min(1, dt * 4);
    if (Math.abs(goal - t.current) < 0.0005) t.current = goal;
    const k = t.current;
    const { shell, front, rear } = groups.current;
    if (shell) shell.position.y = base.current.shellY + target.current.shellDy * k;
    if (front) front.position.x = base.current.frontX + target.current.frontDx * k;
    if (rear) rear.position.x = base.current.rearX + target.current.rearDx * k;
  });

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    const part = partOf(e.object);
    if (!part) return;
    e.stopPropagation();
    setHovered({ id: part.name, info: part.info, point: e.point.clone() });
  };

  return (
    <group position={[0, GROUND_Y, 0]}>
      <primitive
        object={root}
        onPointerOver={onOver}
        onPointerMove={onOver}
        onPointerOut={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHovered(null);
        }}
      />
      {hovered && (
        <Html position={hovered.point.clone().sub(new THREE.Vector3(0, GROUND_Y, 0))} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <div className="vessel-tip">
            <div className="vessel-tip-head">
              <span className="vessel-tip-swatch" style={{ background: ACCENT }} />
              {hovered.info.title}
            </div>
            {hovered.info.size && <div className="vessel-tip-detail">{hovered.info.size}</div>}
            {hovered.info.mat && <div className="vessel-tip-detail">{hovered.info.mat}</div>}
          </div>
        </Html>
      )}
    </group>
  );
}

export function HeatExchangerGlbViewport3D({ onClose }: { onClose?: () => void }) {
  const [xray, setXray] = useState(false);
  const [assembled, setAssembled] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [hovered, setHovered] = useState<Hover | null>(null);
  const controls = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  return (
    <div className="vessel-viewport">
      <Canvas camera={{ position: [4.8, 2.1, 5.9], fov: 32 }} dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: "high-performance" }}>
        <color attach="background" args={["#0b1220"]} />
        <hemisphereLight args={["#cfe0ff", "#0b1220", 0.5]} />
        <directionalLight position={[5, 8, 4]} intensity={1.4} />
        {/* Bright studio panels: the stainless is fully metallic, so it can only be as bright as what it reflects. */}
        <Environment resolution={256} frames={1}>
          <Lightformer form="rect" intensity={7} position={[0, 6, 2]} scale={[14, 4, 1]} rotation-x={Math.PI / 2} />
          <Lightformer form="rect" intensity={4.5} position={[7, 1.5, 3]} scale={[4, 8, 1]} rotation-y={-Math.PI / 2.5} />
          <Lightformer form="rect" intensity={5} position={[-7, 1.5, -3]} scale={[5, 8, 1]} rotation-y={Math.PI / 2.5} color="#bcd4ff" />
          <Lightformer form="rect" intensity={3.5} position={[0, 2, -8]} scale={[16, 5, 1]} />
          <Lightformer form="ring" intensity={3} position={[0, 3, 7]} scale={4} color="#dff1ff" />
        </Environment>
        <Exchanger xray={xray} assembled={assembled} hovered={hovered} setHovered={setHovered} />
        <ContactShadows position={[0, GROUND_Y, 0]} opacity={0.55} scale={14} blur={2.6} far={4} />
        <gridHelper args={[16, 32, "#1d2a44", "#141f33"]} position={[0, GROUND_Y - 0.002, 0]} />
        <OrbitControls ref={controls} enablePan={false} minDistance={2.5} maxDistance={12} maxPolarAngle={Math.PI / 2.05} autoRotate={autoRotate && hovered === null} autoRotateSpeed={0.6} target={[0, -0.35, 0]} />
      </Canvas>

      <div className="vessel-overlay vessel-overlay-top">
        <div className="vessel-caption">
          <span className="vessel-caption-title">Heat exchanger digital twin · detailed</span>
          <span className="vessel-caption-source">BEM, 2-pass · Shell Ø800 · 420 tubes Ø25.4 · 5 baffles (25% cut) · reference model, not job-driven</span>
        </div>
      </div>

      <div className="vessel-overlay vessel-overlay-bottom">
        <span className="vessel-hint">Drag to orbit · scroll to zoom · hover a part for its size and material</span>
        <div className="vessel-actions">
          <button type="button" onClick={() => setAssembled((v) => !v)} aria-pressed={assembled}>
            {assembled ? "Exploded view" : "Assemble"}
          </button>
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
