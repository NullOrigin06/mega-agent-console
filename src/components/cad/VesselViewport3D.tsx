import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import type { ModuleKind } from "../../types/engineering";

const BLUE = "#4da3ff";
const CYAN = "#22d3ee";

interface HotspotProps {
  geometry: THREE.BufferGeometry;
  position?: [number, number, number];
  rotation?: [number, number, number];
  label: string;
  module: ModuleKind;
  onSelectModule?: (module: ModuleKind) => void;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
  id: string;
}

/**
 * One named vessel part: an invisible solid mesh (for pointer raycasting)
 * behind a crisp EdgesGeometry wireframe (the actual visual), so hover and
 * click work without the line render looking like a filled solid.
 */
function Hotspot({
  geometry,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  label,
  module,
  onSelectModule,
  hoveredId,
  setHoveredId,
  id,
}: HotspotProps) {
  const isHovered = hoveredId === id;
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 20), [geometry]);

  return (
    <group position={position} rotation={rotation}>
      <mesh
        geometry={geometry}
        visible={false}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHoveredId(id);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          if (isHovered) setHoveredId(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelectModule?.(module);
        }}
      />
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={isHovered ? CYAN : BLUE} linewidth={1} />
      </lineSegments>
      {isHovered && (
        <Html center distanceFactor={8} style={{ pointerEvents: "none" }}>
          <div className="vessel-hotspot-label">{label}</div>
        </Html>
      )}
    </group>
  );
}

function RotatingRig({ paused, children }: { paused: boolean; children: React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null!);
  useFrame((_state, delta) => {
    if (!paused && groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15;
    }
  });
  return <group ref={groupRef}>{children}</group>;
}

interface VesselViewport3DProps {
  onSelectModule?: (module: ModuleKind) => void;
}

/**
 * A schematic digital-twin wireframe of a horizontal shell-and-tube heat
 * exchanger — the generic shape common to all three engineering modules,
 * not a specific job's real computed geometry (that data isn't in the job
 * model). Hover a part for its name, click to jump to the matching module.
 */
export function VesselViewport3D({ onSelectModule }: VesselViewport3DProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const shellGeo = useMemo(() => new THREE.CylinderGeometry(1.4, 1.4, 4.2, 32, 1, true), []);
  const headGeo = useMemo(() => new THREE.SphereGeometry(1.4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), []);
  const tubeSheetGeo = useMemo(() => new THREE.CylinderGeometry(1.42, 1.42, 0.12, 32), []);
  const nozzleGeo = useMemo(() => new THREE.CylinderGeometry(0.28, 0.28, 0.9, 16), []);

  return (
    <div className="vessel-viewport">
      <Canvas camera={{ position: [5.5, 2.5, 5.5], fov: 40 }}>
        <RotatingRig paused={hoveredId !== null}>
          {/* Main shell, oriented horizontally along X */}
          <Hotspot
            id="shell"
            geometry={shellGeo}
            rotation={[0, 0, Math.PI / 2]}
            label="SHELL"
            module="HeatExchangerFab"
            onSelectModule={onSelectModule}
            hoveredId={hoveredId}
            setHoveredId={setHoveredId}
          />

          {/* Dished heads, one at each end */}
          <Hotspot
            id="head-left"
            geometry={headGeo}
            position={[-2.1, 0, 0]}
            rotation={[0, 0, -Math.PI / 2]}
            label="HEAD"
            module="BonnetFlange"
            onSelectModule={onSelectModule}
            hoveredId={hoveredId}
            setHoveredId={setHoveredId}
          />
          <Hotspot
            id="head-right"
            geometry={headGeo}
            position={[2.1, 0, 0]}
            rotation={[0, 0, Math.PI / 2]}
            label="HEAD"
            module="BonnetFlange"
            onSelectModule={onSelectModule}
            hoveredId={hoveredId}
            setHoveredId={setHoveredId}
          />

          {/* Tube sheets, just inside each head */}
          <Hotspot
            id="tube-sheet-left"
            geometry={tubeSheetGeo}
            position={[-1.95, 0, 0]}
            rotation={[0, 0, Math.PI / 2]}
            label="TUBE SHEET"
            module="TubeSheet"
            onSelectModule={onSelectModule}
            hoveredId={hoveredId}
            setHoveredId={setHoveredId}
          />
          <Hotspot
            id="tube-sheet-right"
            geometry={tubeSheetGeo}
            position={[1.95, 0, 0]}
            rotation={[0, 0, Math.PI / 2]}
            label="TUBE SHEET"
            module="TubeSheet"
            onSelectModule={onSelectModule}
            hoveredId={hoveredId}
            setHoveredId={setHoveredId}
          />

          {/* Inlet / outlet nozzles on top of the shell */}
          <Hotspot
            id="nozzle-a"
            geometry={nozzleGeo}
            position={[-1.1, 1.4, 0]}
            label="NOZZLE N1"
            module="HeatExchangerFab"
            onSelectModule={onSelectModule}
            hoveredId={hoveredId}
            setHoveredId={setHoveredId}
          />
          <Hotspot
            id="nozzle-b"
            geometry={nozzleGeo}
            position={[1.1, 1.4, 0]}
            label="NOZZLE N2"
            module="HeatExchangerFab"
            onSelectModule={onSelectModule}
            hoveredId={hoveredId}
            setHoveredId={setHoveredId}
          />
        </RotatingRig>

        <OrbitControls enablePan={false} minDistance={4} maxDistance={12} />
      </Canvas>
    </div>
  );
}
