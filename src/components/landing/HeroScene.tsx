"use client";

import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Float,
  MeshDistortMaterial,
  Sparkles,
  Stars,
  Torus,
  RoundedBox,
} from "@react-three/drei";
import * as THREE from "three";

function SpinningCore() {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (group.current) {
      group.current.rotation.y += delta * 0.15;
      group.current.rotation.x += delta * 0.03;
    }
  });

  return (
    <group ref={group}>
      <mesh castShadow receiveShadow>
        <icosahedronGeometry args={[1.35, 1]} />
        <MeshDistortMaterial
          color="#7c3aed"
          attach="material"
          distort={0.4}
          speed={2}
          roughness={0.15}
          metalness={0.8}
          emissive="#4c1d95"
          emissiveIntensity={0.4}
        />
      </mesh>
      <Torus args={[2.1, 0.035, 16, 100]} rotation={[Math.PI / 2.3, 0, 0]}>
        <meshStandardMaterial color="#22d3ee" emissive="#0e7490" emissiveIntensity={0.6} />
      </Torus>
      <Torus args={[2.5, 0.02, 16, 100]} rotation={[Math.PI / 1.6, 0.4, 0]}>
        <meshStandardMaterial color="#f472b6" emissive="#831843" emissiveIntensity={0.5} />
      </Torus>
    </group>
  );
}

function FloatingCard({
  position,
  color,
  shape = "box",
}: {
  position: [number, number, number];
  color: string;
  shape?: "box" | "icosahedron";
}) {
  return (
    <Float speed={2} rotationIntensity={1.1} floatIntensity={1.6}>
      <mesh position={position} castShadow>
        {shape === "box" ? (
          <boxGeometry args={[0.55, 0.75, 0.06]} />
        ) : (
          <octahedronGeometry args={[0.4, 0]} />
        )}
        <meshStandardMaterial
          color={color}
          metalness={0.6}
          roughness={0.25}
          emissive={color}
          emissiveIntensity={0.25}
        />
      </mesh>
    </Float>
  );
}

function Scene() {
  return (
    <>
      <color attach="background" args={["#05060f"]} />
      <fog attach="fog" args={["#05060f", 6, 16]} />
      <ambientLight intensity={0.5} />
      <pointLight position={[5, 5, 5]} intensity={1.4} color="#a78bfa" />
      <pointLight position={[-5, -3, -5]} intensity={1} color="#22d3ee" />
      <directionalLight position={[2, 4, 3]} intensity={0.6} />

      <Stars radius={60} depth={40} count={2200} factor={2.4} saturation={0} fade speed={0.6} />
      <Sparkles count={70} scale={[8, 6, 6]} size={2.4} speed={0.4} color="#c4b5fd" />

      <Float speed={1.4} rotationIntensity={0.5} floatIntensity={0.8}>
        <SpinningCore />
      </Float>

      <FloatingCard position={[-2.6, 1.1, 0.4]} color="#38bdf8" />
      <FloatingCard position={[2.7, -0.6, -0.6]} color="#f472b6" shape="icosahedron" />
      <FloatingCard position={[-2.2, -1.4, -0.8]} color="#facc15" shape="icosahedron" />
      <FloatingCard position={[2.4, 1.6, 0.2]} color="#4ade80" />

      <Float speed={1.8} rotationIntensity={0.6} floatIntensity={1.2}>
        <RoundedBox args={[0.9, 0.55, 0.08]} radius={0.08} position={[0, -2.2, 0.6]} castShadow>
          <meshStandardMaterial color="#0ea5e9" metalness={0.7} roughness={0.2} emissive="#0369a1" emissiveIntensity={0.3} />
        </RoundedBox>
      </Float>
    </>
  );
}

export default function HeroScene() {
  return (
    <div className="absolute inset-0 -z-0">
      <Canvas
        shadows
        dpr={[1, 1.6]}
        camera={{ position: [0, 0, 7], fov: 45 }}
        gl={{ antialias: true, alpha: false }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
}
