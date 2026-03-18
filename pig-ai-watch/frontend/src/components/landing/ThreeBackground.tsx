/**
 * PRISMA ATLAS — Three.js Animated Background
 * Floating wireframe geometric shapes + glowing spheres
 */
import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function FloatingShape({ geometry, position, color, speed, amplitude }: {
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  color: string;
  speed: number;
  amplitude: number;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  const rotSpeed = useMemo(() => ({
    x: (Math.random() - 0.5) * 0.008,
    y: (Math.random() - 0.5) * 0.008,
    z: (Math.random() - 0.5) * 0.008,
  }), []);

  useFrame(({ clock, pointer }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.rotation.x += rotSpeed.x;
    ref.current.rotation.y += rotSpeed.y;
    ref.current.rotation.z += rotSpeed.z;
    ref.current.position.y = position[1] + Math.sin(t * speed) * amplitude;
    ref.current.position.x = position[0] + pointer.x * 3;
  });

  return (
    <mesh ref={ref} position={position}>
      <primitive object={geometry} attach="geometry" />
      <meshBasicMaterial color={color} wireframe transparent opacity={0.25} />
    </mesh>
  );
}

function GlowingSphere({ position, color, size }: {
  position: [number, number, number];
  color: string;
  size: number;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  const pulseSpeed = useMemo(() => Math.random() * 0.5 + 0.5, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const s = 1 + Math.sin(clock.getElapsedTime() * pulseSpeed) * 0.1;
    ref.current.scale.set(s, s, s);
  });

  return (
    <group>
      <mesh ref={ref} position={position}>
        <sphereGeometry args={[size, 32, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} />
      </mesh>
      <mesh position={position}>
        <sphereGeometry args={[size * 1.5, 32, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.08} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

function Scene() {
  const shapes = useMemo(() => [
    { geo: new THREE.IcosahedronGeometry(2, 0), pos: [-20, 10, -10] as [number, number, number], color: '#6366f1' },
    { geo: new THREE.OctahedronGeometry(1.5, 0), pos: [25, -5, -15] as [number, number, number], color: '#f472b6' },
    { geo: new THREE.TetrahedronGeometry(1.8, 0), pos: [-15, -12, -8] as [number, number, number], color: '#6366f1' },
    { geo: new THREE.DodecahedronGeometry(1.2, 0), pos: [18, 15, -12] as [number, number, number], color: '#f472b6' },
    { geo: new THREE.TorusGeometry(2, 0.5, 16, 100), pos: [-25, -8, -20] as [number, number, number], color: '#6366f1' },
    { geo: new THREE.TorusKnotGeometry(1.5, 0.4, 100, 16), pos: [30, 8, -25] as [number, number, number], color: '#f472b6' },
  ], []);

  const spheres = useMemo(() => [
    { pos: [-30, 20, -30] as [number, number, number], color: '#6366f1', size: 3 },
    { pos: [35, -15, -25] as [number, number, number], color: '#f472b6', size: 2.5 },
    { pos: [0, 25, -35] as [number, number, number], color: '#22d3ee', size: 2 },
  ], []);

  return (
    <>
      {shapes.map((s, i) => (
        <FloatingShape
          key={i}
          geometry={s.geo}
          position={s.pos}
          color={s.color}
          speed={Math.random() * 0.5 + 0.5}
          amplitude={Math.random() * 2 + 1}
        />
      ))}
      {spheres.map((s, i) => (
        <GlowingSphere key={`sphere-${i}`} position={s.pos} color={s.color} size={s.size} />
      ))}
    </>
  );
}

export default function ThreeBackground() {
  return (
    <div className="fixed inset-0 -z-10">
      <Canvas
        camera={{ position: [0, 0, 30], fov: 75 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'linear-gradient(135deg, #0f172a, #1e1b4b, #0f172a)' }}
        dpr={[1, 2]}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
