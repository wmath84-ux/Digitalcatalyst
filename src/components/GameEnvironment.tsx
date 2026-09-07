import { useState, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Sky, Stars } from '@react-three/drei';
import * as THREE from 'three';

// Simple terrain component
function Terrain() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Generate terrain geometry with some hills
  const terrainGeometry = useRef<THREE.PlaneGeometry>(null);
  
  useEffect(() => {
    if (!terrainGeometry.current) return;
    
    const geometry = terrainGeometry.current;
    const position = geometry.attributes.position;
    const size = 200;
    const segments = 100;
    
    for (let i = 0; i < position.count; i++) {
      const x = (i % (segments + 1)) / segments * size - size / 2;
      const z = Math.floor(i / (segments + 1)) / segments * size - size / 2;
      const y = Math.sin(x * 0.1) * Math.cos(z * 0.1) * 2;
      position.setY(i, y);
    }
    
    geometry.computeVertexNormals();
  }, []);

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -5, 0]}>
      <planeGeometry ref={terrainGeometry} args={[200, 200, 100, 100]} />
      <meshStandardMaterial color="#3a5f0b" side={THREE.DoubleSide} />
    </mesh>
  );
}

// Simple tree component
function Tree({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Trunk */}
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[0.5, 0.3, 3, 8]} />
        <meshStandardMaterial color="#5d4037" />
      </mesh>
      {/* Leaves */}
      <mesh position={[0, 3.5, 0]}>
        <coneGeometry args={[2, 4, 8]} />
        <meshStandardMaterial color="#2d5a27" />
      </mesh>
    </group>
  );
}

// Mountain component
function Mountain({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <coneGeometry args={[8, 15, 6]} />
        <meshStandardMaterial color="#5a4d3a" />
      </mesh>
    </group>
  );
}

// Animated floating crystals
function FloatingCrystal({ position, color }: { position: [number, number, number]; color: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.2;
      meshRef.current.position.y += Math.sin(state.clock.elapsedTime * 2) * 0.01;
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <dodecahedronGeometry args={[0.8]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
    </mesh>
  );
}

// Scene content
function GameScene() {
  const { camera, gl } = useThree();
  
  // Set up camera position
  useEffect(() => {
    camera.position.set(0, 10, 20);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  // Set up scene background and fog
  useEffect(() => {
    gl.setClearColor('#87CEEB');
    // scene.fog = new THREE.Fog('#87CEEB', 50, 200);
  }, [gl]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      <pointLight position={[0, 20, 0]} intensity={0.5} />
      
      {/* Sky */}
      <Sky
        distance={450000}
        sunPosition={[100, 50, 100]}
        inclination={0}
        azimuth={0.25}
      />
      
      {/* Environment */}
      <Environment preset="city" />
      
      {/* Terrain */}
      <Terrain />
      
      {/* Trees */}
      {Array.from({ length: 20 }).map((_, i) => (
        <Tree
          key={i}
          position={[
            (Math.random() - 0.5) * 180,
            0,
            (Math.random() - 0.5) * 180
          ]}
        />
      ))}
      
      {/* Mountains in the distance */}
      <Mountain position={[-80, 0, -80]} />
      <Mountain position={[80, 0, -80]} />
      <Mountain position={[0, 0, -120]} />
      
      {/* Floating crystals */}
      <FloatingCrystal position={[10, 5, 0]} color="#00bfff" />
      <FloatingCrystal position={[-10, 8, 5]} color="#ff69b4" />
      <FloatingCrystal position={[5, 12, -5]} color="#32cd32" />
      
      {/* Simple water plane */}
      <mesh position={[0, -5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial
          color="#1E90FF"
          transparent
          opacity={0.7}
          roughness={0.1}
          metalness={0.1}
        />
      </mesh>
      
      {/* Stars in the sky */}
      <Stars
        radius={100}
        depth={50}
        count={1000}
        factor={4}
        saturation={0}
        fade
      />
      
      {/* Orbit controls for camera movement */}
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={5}
        maxDistance={100}
        maxPolarAngle={Math.PI / 2.1}
      />
    </>
  );
}

type GameEnvironmentProps = {
  onClose: () => void;
};

export default function GameEnvironment({ onClose }: GameEnvironmentProps) {
  const [isOpen, setIsOpen] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Prevent body scroll when game is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === containerRef.current) {
          onClose();
        }
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 rounded-full bg-white/20 p-2 text-white hover:bg-white/30 transition-colors"
        aria-label="Close game"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Game container */}
      <div className="h-[90vh] w-[90vw] max-w-4xl max-h-4xl rounded-lg overflow-hidden shadow-2xl">
        <Canvas
          camera={{ position: [0, 10, 20], fov: 50 }}
        >
          <GameScene />
        </Canvas>
      </div>

      {/* Instructions overlay */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 rounded-full bg-white/20 backdrop-blur-md px-4 py-2">
        <p className="text-sm text-white">
          Drag to rotate | Scroll to zoom | Right-click to pan
        </p>
      </div>
    </div>
  );
}
