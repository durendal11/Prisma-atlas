/**
 * PRISMA ATLAS — 3D Spatial Pig Pen Visualizer Component
 * Crisp Light Mode styling with 3px micro AI Bounding Box detection tags,
 * bright studio daylighting, full 360° scroll camera orbit, GLB support for CCTV,
 * and realistic security camera monitoring facing the sow with dedicated studio lighting.
 */
import { useRef, useMemo, useEffect, Suspense, Component, ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations, Html } from '@react-three/drei';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

interface PigPen3DProps {
  scrollProgress: number;
  activeNode: number | null;
  showBoundingBoxes?: boolean;
  onSelectNode?: (nodeId: number) => void;
}

/* Parallel Teat-Seeking Nursing Formation along Sow's left and right flanks */
const PIGLET_POSITIONS: { id: string; pos: [number, number, number]; rot: [number, number, number]; scale: number; delay: number; conf: number }[] = [
  // Left flank (facing inward toward sow at rot Y = PI/2)
  { id: 'PGL-01', pos: [-1.1, 0.02, -1.2], rot: [0, Math.PI / 2, 0], scale: 1.0, delay: 0.0, conf: 98.2 },
  { id: 'PGL-02', pos: [-1.1, 0.02, -0.6], rot: [0, Math.PI / 2 + 0.1, 0], scale: 1.05, delay: 0.1, conf: 97.6 },
  { id: 'PGL-03', pos: [-1.1, 0.02, 0.0], rot: [0, Math.PI / 2 - 0.05, 0], scale: 1.1, delay: 0.2, conf: 99.1 },
  { id: 'PGL-04', pos: [-1.1, 0.02, 0.6], rot: [0, Math.PI / 2, 0], scale: 1.05, delay: 0.3, conf: 96.8 },
  { id: 'PGL-05', pos: [-1.1, 0.02, 1.2], rot: [0, Math.PI / 2 - 0.1, 0], scale: 1.0, delay: 0.4, conf: 98.5 },

  // Right flank (facing inward toward sow at rot Y = -PI/2)
  { id: 'PGL-06', pos: [1.1, 0.02, -1.2], rot: [0, -Math.PI / 2, 0], scale: 1.0, delay: 0.15, conf: 97.9 },
  { id: 'PGL-07', pos: [1.1, 0.02, -0.6], rot: [0, -Math.PI / 2 - 0.1, 0], scale: 1.05, delay: 0.25, conf: 98.7 },
  { id: 'PGL-08', pos: [1.1, 0.02, 0.0], rot: [0, -Math.PI / 2 + 0.05, 0], scale: 1.1, delay: 0.35, conf: 99.4 },
  { id: 'PGL-09', pos: [1.1, 0.02, 0.6], rot: [0, -Math.PI / 2, 0], scale: 1.05, delay: 0.45, conf: 96.5 },
  { id: 'PGL-10', pos: [1.1, 0.02, 1.2], rot: [0, -Math.PI / 2 + 0.1, 0], scale: 1.0, delay: 0.55, conf: 98.1 },
];

const GALVANIZED_MAT = new THREE.MeshStandardMaterial({
  color: '#94a3b8',
  metalness: 0.85,
  roughness: 0.2,
});

/* ─── 3D Model Error Boundary Component ─────────────────────────────────── */
class GLTFErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.warn('[GLTF Error Boundary Catch]', error.message);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/* ─── AI Scanning Laser Beam (Activates with Bounding Boxes) ─────────────── */
function AIScanningBeam({ opacity }: { opacity: number }) {
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.position.z = Math.sin(clock.getElapsedTime() * 2.5) * 1.8;
    }
  });

  if (opacity <= 0.01) return null;

  return (
    <mesh ref={meshRef} position={[0, 0.06, 0]}>
      <boxGeometry args={[4.2, 0.015, 0.06]} />
      <meshBasicMaterial color="#059669" transparent opacity={opacity * 0.7} />
    </mesh>
  );
}

/* ─── 3D AI Bounding Box Wireframe & 3px Micro Tag Component ─────────────── */
function AIBoundingBoxOverlay({
  position,
  args,
  label,
  sublabel,
  confidence,
  opacity = 1,
  color = '#059669',
  badgePosition = [0, 0, 0]
}: {
  position: [number, number, number];
  args: [number, number, number];
  label: string;
  sublabel: string;
  confidence: number;
  opacity?: number;
  color?: string;
  badgePosition?: [number, number, number];
}) {
  if (opacity <= 0.01) return null;

  return (
    <group position={position}>
      {/* Translucent Glowing 3D Bounding Box Mesh */}
      <mesh>
        <boxGeometry args={args} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.5 * opacity} />
      </mesh>

      {/* Solid Corner Anchor Accents */}
      <mesh>
        <boxGeometry args={[args[0] * 1.01, args[1] * 1.01, args[2] * 1.01]} />
        <meshBasicMaterial color={color} transparent opacity={0.15 * opacity} />
      </mesh>

      {/* Floating Light Mode AI HUD Bounding Box Badge (Exact 3px Micro Tag) */}
      <Html center position={badgePosition} distanceFactor={45} zIndexRange={[100, 0]}>
        <div
          className="pointer-events-none select-none flex flex-col items-center origin-center transition-all duration-300 ease-out"
          style={{
            opacity: opacity,
            transform: `scale(${0.35 + opacity * 0.1})`,
          }}
        >
          <div
            className="flex items-center gap-[1px] px-[2px] py-[0.5px] rounded bg-white/95 border border-emerald-600/60 shadow-sm text-slate-900 font-mono font-bold leading-none whitespace-nowrap"
            style={{ fontSize: '3px', lineHeight: '3px' }}
          >
            <span className="w-[1.5px] h-[1.5px] rounded-full bg-emerald-600 inline-block" />
            <span className="text-emerald-700 font-black">{label}</span>
            {sublabel && sublabel !== 'NURSING' && (
              <>
                <span className="text-slate-400">•</span>
                <span className="text-slate-700">{sublabel}</span>
              </>
            )}
            <span className="text-slate-400">•</span>
            <span className="text-emerald-700 font-bold">{confidence.toFixed(1)}%</span>
          </div>
        </div>
      </Html>
    </group>
  );
}

/* ─── Procedural 3D Sow Mesh Fallback ─────────────────────────────────────── */
function ProceduralSowModel({ aiBoxOpacity = 0 }: { aiBoxOpacity?: number }) {
  return (
    <group position={[0, 0, 0]}>
      {/* Sow Body */}
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <capsuleGeometry args={[0.42, 1.6, 16, 32]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.5} metalness={0.1} />
      </mesh>

      {/* Sow Head */}
      <mesh position={[0, 0.65, 1.1]} castShadow receiveShadow>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.5} metalness={0.1} />
      </mesh>

      {/* Sow Snout */}
      <mesh position={[0, 0.55, 1.4]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.18, 0.2, 16]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.6} />
      </mesh>

      {/* Sow Ears */}
      <mesh position={[-0.28, 0.88, 1.1]} rotation={[0.3, -0.3, -0.4]} castShadow>
        <boxGeometry args={[0.18, 0.28, 0.05]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
      <mesh position={[0.28, 0.88, 1.1]} rotation={[0.3, 0.3, 0.4]} castShadow>
        <boxGeometry args={[0.18, 0.28, 0.05]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>

      {/* Sow 3px Bounding Box Overlay */}
      <AIBoundingBoxOverlay
        position={[0, 0.75, 0]}
        args={[0.95, 1.45, 2.8]}
        label="SOW-01"
        sublabel="STANDING / UPRIGHT"
        confidence={99.2}
        opacity={aiBoxOpacity}
        color="#059669"
        badgePosition={[0, 0.85, 0]}
      />
    </group>
  );
}

/* ─── Procedural 3D Piglet Mesh Fallback ─────────────────────────────────── */
function ProceduralPigletModel({ id, position, rotation = [0, 0, 0], conf = 98.0, aiBoxOpacity = 0 }: {
  id: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  conf?: number;
  aiBoxOpacity?: number;
}) {
  return (
    <group position={position} rotation={rotation}>
      {/* Piglet Body */}
      <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.4} />
      </mesh>

      {/* Piglet Head */}
      <mesh position={[0, 0.15, 0.14]} castShadow>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.4} />
      </mesh>

      {/* Piglet 3px Bounding Box Overlay */}
      <AIBoundingBoxOverlay
        position={[0, 0.18, 0]}
        args={[0.32, 0.32, 0.38]}
        label={id}
        sublabel="NURSING"
        confidence={conf}
        opacity={aiBoxOpacity}
        color="#059669"
        badgePosition={[0, 0.25, 0]}
      />
    </group>
  );
}

/* ─── GLTF Sow Loader Component (`/models/sow.glb`) ──────────────────────── */
function ExternalSowModel({ aiBoxOpacity = 0 }: { aiBoxOpacity?: number }) {
  const { scene, animations } = useGLTF('/models/sow.glb');
  const groupRef = useRef<THREE.Group>(null!);
  const { actions } = useAnimations(animations, groupRef);

  useEffect(() => {
    if (actions && Object.keys(actions).length > 0) {
      Object.values(actions).forEach((a) => a?.play());
    }
  }, [actions]);

  const clonedScene = useMemo(() => {
    if (!scene) return null;

    const rawBox = new THREE.Box3().setFromObject(scene);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    const rawCenter = rawBox.getCenter(new THREE.Vector3());
    const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1.44;

    const scaleFactor = 2.7 / maxDim;

    const cloned = SkeletonUtils.clone(scene) as THREE.Group;
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => {
            m.side = THREE.DoubleSide;
          });
        }
      }
    });

    cloned.scale.set(scaleFactor, scaleFactor, scaleFactor);
    cloned.position.set(
      -rawCenter.x * scaleFactor,
      -rawBox.min.y * scaleFactor + 0.05,
      -rawCenter.z * scaleFactor
    );

    return cloned;
  }, [scene]);

  if (!clonedScene) return null;

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <primitive object={clonedScene} />

      {/* Sow 3px Bounding Box Overlay */}
      <AIBoundingBoxOverlay
        position={[0, 0.75, 0]}
        args={[0.95, 1.45, 2.8]}
        label="SOW-01"
        sublabel="STANDING / UPRIGHT"
        confidence={99.2}
        opacity={aiBoxOpacity}
        color="#059669"
        badgePosition={[0, 0.85, 0]}
      />
    </group>
  );
}

/* ─── GLTF Piglet Loader Component (`/models/piglet.glb`) ─────────────────── */
function ExternalPigletModel({ id, position, rotation = [0, 0, 0], scale = 1, delay = 0, conf = 98.0, aiBoxOpacity = 0 }: {
  id: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  delay?: number;
  conf?: number;
  aiBoxOpacity?: number;
}) {
  const { scene } = useGLTF('/models/piglet.glb');
  const groupRef = useRef<THREE.Group>(null!);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime() * 2 + delay;
    groupRef.current.position.y = position[1] + Math.sin(t) * 0.012;
  });

  const clonedScene = useMemo(() => {
    if (!scene) return null;

    const rawBox = new THREE.Box3().setFromObject(scene);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    const rawCenter = rawBox.getCenter(new THREE.Vector3());
    const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z) || 0.45;

    const scaleFactor = (0.45 / maxDim) * scale;

    const cloned = SkeletonUtils.clone(scene) as THREE.Group;
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => {
            m.side = THREE.DoubleSide;
          });
        }
      }
    });

    cloned.scale.set(scaleFactor, scaleFactor, scaleFactor);
    cloned.position.set(
      -rawCenter.x * scaleFactor,
      -rawBox.min.y * scaleFactor,
      -rawCenter.z * scaleFactor
    );

    return cloned;
  }, [scene, scale]);

  if (!clonedScene) return null;

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      <primitive object={clonedScene} />

      {/* Piglet 3px Bounding Box Overlay */}
      <AIBoundingBoxOverlay
        position={[0, 0.18, 0]}
        args={[0.32, 0.32, 0.38]}
        label={id}
        sublabel="NURSING"
        confidence={conf}
        opacity={aiBoxOpacity}
        color="#059669"
        badgePosition={[0, 0.25, 0]}
      />
    </group>
  );
}

/* ─── GLTF CCTV Loader Component (`/models/cctv.glb`) ─────────────────────── */
function ExternalCCTVModel() {
  const { scene } = useGLTF('/models/cctv.glb');
  const groupRef = useRef<THREE.Group>(null!);

  const clonedScene = useMemo(() => {
    if (!scene) return null;

    const rawBox = new THREE.Box3().setFromObject(scene);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    const rawCenter = rawBox.getCenter(new THREE.Vector3());
    const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z) || 0.6;

    // Scale to standard security camera dimensions (~0.45m)
    const scaleFactor = 0.45 / maxDim;

    const cloned = SkeletonUtils.clone(scene) as THREE.Group;
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => {
            m.side = THREE.DoubleSide;
            // Enhance surface reflections and eliminate dull muddy shadows
            if ('roughness' in m) {
              (m as THREE.MeshStandardMaterial).roughness = Math.min((m as THREE.MeshStandardMaterial).roughness, 0.3);
            }
            if ('metalness' in m) {
              (m as THREE.MeshStandardMaterial).metalness = Math.max((m as THREE.MeshStandardMaterial).metalness, 0.35);
            }
          });
        }
      }
    });

    cloned.scale.set(scaleFactor, scaleFactor, scaleFactor);
    // Center bounding box
    cloned.position.set(
      -rawCenter.x * scaleFactor,
      -rawCenter.y * scaleFactor,
      -rawCenter.z * scaleFactor
    );

    return cloned;
  }, [scene]);

  if (!clonedScene) return null;

  return (
    // Clean level alignment (Roll = 0)
    <group ref={groupRef} rotation={[0, 0, 0]}>
      <primitive object={clonedScene} />
    </group>
  );
}

// Preload GLTF assets to trigger background prefetching
useGLTF.preload('/models/sow.glb');
useGLTF.preload('/models/piglet.glb');
useGLTF.preload('/models/cctv.glb');

/* ─── Procedural CCTV Body Fallback ──────────────────────────────────────── */
function ProceduralCCTVBody({ ledRef }: { ledRef: React.RefObject<THREE.PointLight> }) {
  return (
    <group rotation={[0.62, 0, 0]}>
      {/* Main Camera Cylinder Body */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.12, 0.14, 0.35, 24]} />
        <meshStandardMaterial color="#ffffff" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Outer Lens Housing Ring */}
      <mesh position={[0, 0, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.125, 0.125, 0.04, 24]} />
        <meshStandardMaterial color="#0284c7" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Optical Glass Lens */}
      <mesh position={[0, 0, 0.19]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.02, 24]} />
        <meshStandardMaterial color="#0369a1" metalness={0.95} roughness={0.05} />
      </mesh>

      {/* Green AI Pulsing LED Indicator */}
      <mesh position={[0.08, 0.08, 0.19]}>
        <sphereGeometry args={[0.018, 12, 12]} />
        <meshBasicMaterial color="#10b981" />
      </mesh>

      <pointLight
        ref={ledRef}
        position={[0, 0, 0.22]}
        color="#10b981"
        intensity={2.2}
        distance={4}
      />
    </group>
  );
}

/* ─── Overhead AI CCTV Surveillance Camera Component ───────────────────── */
function OverheadAICCTVCamera({ aiBoxOpacity = 0 }: { aiBoxOpacity?: number }) {
  const ledRef = useRef<THREE.PointLight>(null!);

  useFrame(({ clock }) => {
    if (ledRef.current) {
      ledRef.current.intensity = 1.8 + Math.sin(clock.getElapsedTime() * 4) * 0.8;
    }
  });

  return (
    // Positioned BEHIND the sow at Z = -2.15, elevated at Y = 2.30m
    <group position={[0, 2.30, -2.15]}>
      {/* ── DEDICATED STUDIO SPOT & FILL LIGHTING FOR CRISP CCTV ILLUMINATION ── */}
      {/* Front Daylight Key Light illuminating the face, lens, and housing */}
      <pointLight position={[0, 0.6, 1.2]} intensity={5.0} color="#ffffff" distance={4.5} decay={1.2} />
      {/* Front-Right Ambient Fill */}
      <pointLight position={[0.8, 0.3, 0.8]} intensity={3.5} color="#f8fafc" distance={3.5} decay={1.2} />
      {/* Top Specular Highlight */}
      <directionalLight position={[0, 4, 1]} intensity={2.2} color="#ffffff" />
      {/* Blue Rim Accent Light */}
      <pointLight position={[-0.7, 0.5, -0.6]} intensity={2.8} color="#38bdf8" distance={3.0} decay={1.2} />

      {/* Ceiling Mounting Rod */}
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.9, 12]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.15} />
      </mesh>

      {/* Swivel Base Mount */}
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 0.08, 16]} />
        <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* Camera Body Chassis - Pitched down by +0.62 rad (~36°) facing forward along +Z straight over the sow */}
      <group position={[0, -0.08, 0]} rotation={[0.62, 0, 0]}>
        <GLTFErrorBoundary fallback={<ProceduralCCTVBody ledRef={ledRef} />}>
          <Suspense fallback={<ProceduralCCTVBody ledRef={ledRef} />}>
            <ExternalCCTVModel />
          </Suspense>
        </GLTFErrorBoundary>
      </group>

      {/* AI Active Monitoring Detection Frustum Cone Beam facing forward and down over the sow */}
      {aiBoxOpacity > 0.01 && (
        <group position={[0, -0.2, 0.2]} rotation={[0.62, 0, 0]}>
          <mesh position={[0, 0, 1.0]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.8, 2.0, 16, 1, true]} />
            <meshBasicMaterial color="#10b981" transparent opacity={0.06 * aiBoxOpacity} wireframe />
          </mesh>
        </group>
      )}

      {/* AI CCTV System Status Badge */}
      {aiBoxOpacity > 0.01 && (
        <Html center position={[0, -0.5, 0]} distanceFactor={45}>
          <div
            className="pointer-events-none select-none px-[3px] py-[1px] rounded bg-white/95 border border-emerald-600/60 font-mono font-bold text-emerald-700 whitespace-nowrap shadow-sm transition-opacity duration-500"
            style={{ opacity: aiBoxOpacity, fontSize: '3px', lineHeight: '3px' }}
          >
            AI CAM #1 • 50ms
          </div>
        </Html>
      )}
    </group>
  );
}

/* ─── Slatted Flooring Mesh Component ───────────────────────────────────── */
function SlattedFloor() {
  const slats = useMemo(() => {
    const arr = [];
    for (let z = -2.1; z <= 2.1; z += 0.14) {
      arr.push(z);
    }
    return arr;
  }, []);

  return (
    <group position={[0, 0, 0]}>
      {slats.map((z, i) => (
        <mesh key={i} position={[0, -0.05, z]} receiveShadow>
          <boxGeometry args={[4.2, 0.08, 0.10]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.4} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/* ─── Industrial Farrowing Crate ─────────────────────────────────────────── */
function IndustrialFarrowingCrate({ aiBoxOpacity = 0 }: { aiBoxOpacity?: number }) {
  const fingerPositions = useMemo(() => {
    const list: { pos: [number, number, number]; rot: [number, number, number] }[] = [];
    const zOffsets = [-1.3, -0.8, -0.3, 0.2, 0.7, 1.2];
    for (const z of zOffsets) {
      list.push({ pos: [-0.75, 0.25, z], rot: [0, 0, -Math.PI / 4] });
      list.push({ pos: [0.75, 0.25, z], rot: [0, 0, Math.PI / 4] });
    }
    return list;
  }, []);

  return (
    <group position={[0, 0, 0]}>
      {/* Front arch gate */}
      <group position={[0, 0, 1.7]}>
        <mesh position={[0, 1.4, 0]}>
          <torusGeometry args={[0.65, 0.035, 16, 32, Math.PI]} />
          <primitive object={GALVANIZED_MAT} attach="material" />
        </mesh>
        <mesh position={[-0.65, 0.7, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 1.4, 16]} />
          <primitive object={GALVANIZED_MAT} attach="material" />
        </mesh>
        <mesh position={[0.65, 0.7, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 1.4, 16]} />
          <primitive object={GALVANIZED_MAT} attach="material" />
        </mesh>
      </group>

      {/* Rear arch gate */}
      <group position={[0, 0, -1.7]}>
        <mesh position={[0, 1.4, 0]}>
          <torusGeometry args={[0.65, 0.035, 16, 32, Math.PI]} />
          <primitive object={GALVANIZED_MAT} attach="material" />
        </mesh>
        <mesh position={[-0.65, 0.7, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 1.4, 16]} />
          <primitive object={GALVANIZED_MAT} attach="material" />
        </mesh>
        <mesh position={[0.65, 0.7, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 1.4, 16]} />
          <primitive object={GALVANIZED_MAT} attach="material" />
        </mesh>
      </group>

      {/* Main Longitudinal Side Rails */}
      {[-0.65, 0.65].map((x, i) => (
        <group key={i}>
          <mesh position={[x, 0.45, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 3.4, 16]} />
            <primitive object={GALVANIZED_MAT} attach="material" />
          </mesh>
          <mesh position={[x, 0.95, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 3.4, 16]} />
            <primitive object={GALVANIZED_MAT} attach="material" />
          </mesh>
          <mesh position={[x, 1.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 3.4, 16]} />
            <primitive object={GALVANIZED_MAT} attach="material" />
          </mesh>
        </group>
      ))}

      {/* Anti-Crushing Finger Bars */}
      {fingerPositions.map((item, idx) => (
        <mesh key={idx} position={item.pos} rotation={item.rot}>
          <cylinderGeometry args={[0.025, 0.025, 0.45, 16]} />
          <primitive object={GALVANIZED_MAT} attach="material" />
        </mesh>
      ))}

      {/* Overhead Infrared Heat Lamp */}
      <group position={[1.4, 1.8, 0]}>
        <mesh position={[0, 0.6, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 1.2, 16]} />
          <primitive object={GALVANIZED_MAT} attach="material" />
        </mesh>
        <mesh position={[0, 0, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.35, 0.4, 24, 1, true]} />
          <primitive object={GALVANIZED_MAT} attach="material" />
        </mesh>
        <mesh position={[0, -0.05, 0]}>
          <sphereGeometry args={[0.12, 16, 16]} />
          <meshStandardMaterial color="#f59e0b" emissive="#d97706" emissiveIntensity={3.5} />
        </mesh>
        <pointLight color="#fbbf24" intensity={4.5} distance={3.8} decay={1.5} />
      </group>

      {/* Overhead AI CCTV Surveillance Camera Unit */}
      <OverheadAICCTVCamera aiBoxOpacity={aiBoxOpacity} />
    </group>
  );
}

/* ─── Main PigPen3D Scene Component ─────────────────────────────────────── */
export default function PigPen3D({
  scrollProgress,
  showBoundingBoxes = true
}: PigPen3DProps) {
  const penProgress = Math.min(1, Math.max(0, (scrollProgress - 0.15) / 0.40));
  const halfwayAlpha = Math.min(1, Math.max(0, (penProgress - 0.35) / 0.12));
  const aiBoxOpacity = showBoundingBoxes ? halfwayAlpha : 0;

  return (
    <group position={[0, 0, 0]}>
      {/* Bright Light Mode Studio Lighting */}
      <ambientLight intensity={1.9} color="#ffffff" />
      <directionalLight
        position={[8, 14, 6]}
        intensity={2.6}
        color="#ffffff"
        castShadow
      />
      <directionalLight
        position={[-6, 10, -8]}
        intensity={1.8}
        color="#f1f5f9"
      />
      <pointLight position={[-6, 8, -4]} intensity={1.5} color="#e2e8f0" />
      <pointLight position={[6, 4, 8]} intensity={1.5} color="#ffffff" />

      {/* AI Laser Scanning Beam Grid */}
      <AIScanningBeam opacity={aiBoxOpacity} />

      <SlattedFloor />
      <IndustrialFarrowingCrate aiBoxOpacity={aiBoxOpacity} />

      {/* 3D Model sow.glb (/models/sow.glb) with Procedural Fallback */}
      <GLTFErrorBoundary fallback={<ProceduralSowModel aiBoxOpacity={aiBoxOpacity} />}>
        <Suspense fallback={<ProceduralSowModel aiBoxOpacity={aiBoxOpacity} />}>
          <ExternalSowModel aiBoxOpacity={aiBoxOpacity} />
        </Suspense>
      </GLTFErrorBoundary>

      {/* 3D Model piglet.glb (/models/piglet.glb) duplicated 10 times with Procedural Fallback */}
      {PIGLET_POSITIONS.map((p, idx) => (
        <GLTFErrorBoundary
          key={idx}
          fallback={
            <ProceduralPigletModel
              id={p.id}
              position={p.pos}
              rotation={p.rot}
              conf={p.conf}
              aiBoxOpacity={aiBoxOpacity}
            />
          }
        >
          <Suspense
            fallback={
              <ProceduralPigletModel
                id={p.id}
                position={p.pos}
                rotation={p.rot}
                conf={p.conf}
                aiBoxOpacity={aiBoxOpacity}
              />
            }
          >
            <ExternalPigletModel
              id={p.id}
              position={p.pos}
              rotation={p.rot}
              scale={p.scale}
              delay={p.delay}
              conf={p.conf}
              aiBoxOpacity={aiBoxOpacity}
            />
          </Suspense>
        </GLTFErrorBoundary>
      ))}
    </group>
  );
}
