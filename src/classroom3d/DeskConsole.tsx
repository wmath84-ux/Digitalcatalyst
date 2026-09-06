// src/classroom3d/DeskConsole.tsx
//
// The learner's own desk — and the single control surface of the whole
// classroom. Look down and everything is here, exactly as the owner asked:
// switch module, switch lesson/file, jump the head to the board / notes /
// mind map, and see where you are in the course. Nothing in this room ever
// asks the learner to stand up or leave the seat.
//
// Physically it is a wooden desk with a slim glass tablet lying on it at a
// reading tilt; the tablet's face is live DOM.

import { Html } from "@react-three/drei";
import type { ReactNode } from "react";

export default function DeskConsole({
  children,
  pixelWidth = 1100,
  pixelHeight = 720,
}: {
  children: ReactNode;
  pixelWidth?: number;
  pixelHeight?: number;
}) {
  const width = 1.16; // metres
  const height = (width * pixelHeight) / pixelWidth;
  const scale = width / pixelWidth;

  return (
    <group position={[0.15, 0, 2.02]}>
      {/* Desk top */}
      <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.055, 0.7]} />
        <meshStandardMaterial color="#b78551" roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.53, -0.32]} castShadow>
        <boxGeometry args={[1.44, 0.4, 0.04]} />
        <meshStandardMaterial color="#8d6238" roughness={0.7} />
      </mesh>
      {[
        [-0.68, -0.3],
        [0.68, -0.3],
        [-0.68, 0.3],
        [0.68, 0.3],
      ].map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.375, z]} castShadow>
          <cylinderGeometry args={[0.028, 0.028, 0.75, 8]} />
          <meshStandardMaterial color="#49505f" metalness={0.5} roughness={0.45} />
        </mesh>
      ))}

      {/* The console tablet — tilted toward the seated learner */}
      <group position={[0, 0.795, 0.02]} rotation={[-Math.PI / 2 + 0.34, 0, 0]}>
        <mesh castShadow>
          <boxGeometry args={[width + 0.05, height + 0.05, 0.014]} />
          <meshStandardMaterial
            color="#1b1730"
            roughness={0.35}
            metalness={0.5}
            emissive="#6d5bd0"
            emissiveIntensity={0.18}
          />
        </mesh>
        <Html
          transform
          position={[0, 0, 0.009]}
          scale={scale}
          occlude={false}
          style={{
            width: pixelWidth,
            height: pixelHeight,
            overflow: "hidden",
            borderRadius: 14,
            background: "#080b16",
          }}
          wrapperClass="dc-classroom-surface"
          zIndexRange={[12, 0]}
        >
          {children}
        </Html>
        <pointLight position={[0, 0, 0.5]} intensity={1.6} distance={2.2} color="#a99cf5" />
      </group>

      {/* Notebook + pen, because a desk without them is not a desk */}
      <group position={[-0.56, 0.79, 0.13]} rotation={[0, 0.22, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.3, 0.02, 0.22]} />
          <meshStandardMaterial color="#f6f2e8" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0.4]}>
          <cylinderGeometry args={[0.006, 0.006, 0.16, 6]} />
          <meshStandardMaterial color="#2f3a4d" roughness={0.4} metalness={0.4} />
        </mesh>
      </group>
    </group>
  );
}
