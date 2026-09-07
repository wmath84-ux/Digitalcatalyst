import { useState, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Sky, Stars, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';

// Simple terrain component
function Terrain() {
  const meshRef = useRef<THREE.Mesh>(null);
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
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -5, 0]} castShadow receiveShadow>
      <planeGeometry ref={terrainGeometry} args={[200, 200, 100, 100]} />
      <meshStandardMaterial color="#3a5f0b" side={THREE.DoubleSide} />
    </mesh>
  );
}

// Simple tree component
function Tree({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.3, 3, 8]} />
        <meshStandardMaterial color="#5d4037" />
      </mesh>
      <mesh position={[0, 3.5, 0]} castShadow>
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
      <mesh castShadow>
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
    <mesh ref={meshRef} position={position} castShadow>
      <dodecahedronGeometry args={[0.8]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} metalness={0.3} roughness={0.2} />
    </mesh>
  );
}

// Scene content
function GameScene() {
  const { camera, gl, scene } = useThree();
  
  // Set up camera position
  useEffect(() => {
    camera.position.set(0, 10, 20);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  // Set up scene background and fog
  useEffect(() => {
    gl.setClearColor('#87CEEB');
    scene.background = new THREE.Color('#87CEEB');
    scene.fog = new THREE.Fog('#87CEEB', 50, 200);
  }, [gl, scene]);

  return (
    <>
      {/* Camera with proper settings */}
      <PerspectiveCamera makeDefault position={[0, 10, 20]} fov={50} near={0.1} far={1000} />
      
      {/* Lighting - Improved for better visibility */}
      <ambientLight intensity={0.6} color="#ffffff" />
      <directionalLight 
        position={[10, 10, 5]} 
        intensity={1.5} 
        castShadow 
        shadow-mapSize={[2048, 2048]}
      />
      <pointLight position={[0, 20, 0]} intensity={0.8} color="#ffeb3b" />
      <pointLight position={[-10, 10, -10]} intensity={0.5} color="#ff9800" />
      
      {/* Sky */}
      <Sky
        distance={450000}
        sunPosition={[100, 50, 100]}
        inclination={0}
        azimuth={0.25}
        turbulence={0.1}
      />
      
      {/* Environment for reflections */}
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
      <FloatingCrystal position={[-15, 6, -8]} color="#ffd700" />
      <FloatingCrystal position={[12, 10, -10]} color="#9370db" />
      
      {/* Simple water plane */}
      <mesh position={[0, -5, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
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
      
      {/* Orbit controls for camera movement - Mobile friendly */}
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        enableDamping={true}
        dampingFactor={0.05}
        minDistance={5}
        maxDistance={100}
        maxPolarAngle={Math.PI / 2.1}
        // Mobile touch improvements
        touchAction={{ pan: true, rotate: true, dolly: true }}
        minZoom={0.5}
        maxZoom={2}
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
    const originalOverflow = document.body.style.overflow;
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = originalOverflow;
    }
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95"
      onClick={(e) => {
        if (e.target === containerRef.current) {
          onClose();
        }
      }}
      style={{ touchAction: 'none' }}
    >
      {/* Close button - Larger for mobile touch */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 z-[101] rounded-full bg-white/20 p-3 text-white hover:bg-white/30 transition-colors"
        aria-label="Close game"
        style={{ minWidth: '48px', minHeight: '48px', touchAction: 'manipulation' }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Game container - Full viewport for mobile */}
      <div 
        className="h-full w-full max-w-[1200px] max-h-[80vh] rounded-lg overflow-hidden shadow-2xl"
        style={{ touchAction: 'none' }}
      >
        <Canvas
          camera={{ position: [0, 10, 20], fov: 50, near: 0.1, far: 1000 }}
          style={{ 
            background: 'linear-gradient(180deg, #87CEEB 0%, #1E90FF 100%)',
            width: '100%',
            height: '100%'
          }}
          gl={{ 
            antialias: true, 
            alpha: false,
            powerPreference: 'high-performance'
          }}
          onCreated={({ gl }) => {
            gl.setClearColor('#87CEEB');
          }}
        >
          <GameScene />
        </Canvas>
      </div>

      {/* Instructions overlay - Only for desktop */}
      <div className="hidden md:block absolute bottom-4 left-1/2 -translate-x-1/2 z-[101] rounded-full bg-white/20 backdrop-blur-md px-4 py-2">
        <p className="text-sm text-white">
          Drag to rotate | Scroll to zoom | Right-click to pan
        </p>
      </div>

      {/* Mobile instructions */}
      <div className="md:hidden absolute bottom-4 left-1/2 -translate-x-1/2 z-[101] rounded-full bg-white/20 backdrop-blur-md px-4 py-2">
        <p className="text-sm text-white">
          Swipe to rotate | Pinch to zoom
        </p>
      </div>
    </div>
  );
}
