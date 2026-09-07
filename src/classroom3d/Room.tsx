// src/classroom3d/Room.tsx
//
// The classroom shell: floor, walls, ceiling, a wall of winter windows, desks,
// classmates and the winter light. Everything here is procedural geometry —
// no downloaded models — so the whole room streams with the app bundle and
// runs on a mid-range phone under Capacitor.
//
// Winter is the mood the owner asked for: cold blue daylight through frosted
// glass, snow falling outside, warm amber ceiling lamps fighting it, a
// radiator under the windows and steam rising off a mug on the desk.
//
// ── Part 13: what changed for performance ─────────────────────────────────
//   · Repeated static props (desks, window frames, lamps, books) are merged
//     into ~11 meshes (see mergedStatics.ts) instead of ~110 draw calls.
//   · The window glass is plain transparency now (the old glass forced a
//     second scene render per surface) — it still reads as frosted glass
//     and costs one blended quad.
//   · Lights are consolidated: 1 window light (was 3), 2 ceiling lights on
//     high/medium or 1 on low (was 6). Emissive meshes still READ as lit.
//   · Shadows are baked once (<BakeShadows> in Classroom3D): the room is
//     static, so the shadow map never recomputes per frame. `castShadow`
//     survives only where a shadow is actually visible.
//   · Snowfall count follows the quality tier; the loop allocates nothing.

import { memo, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BOOK_BIN_COLORS, getMergedRoomStatics } from "./mergedStatics";

const ROOM = { width: 12, depth: 13, height: 3.5 };

/* ── Materials ─────────────────────────────────────────────────────────── */

const wallMat = (
  <meshStandardMaterial color="#cfd6e4" roughness={0.94} metalness={0.02} side={THREE.BackSide} />
);

/* ── Snow falling outside the windows ──────────────────────────────────── */

function Snowfall({ count = 420 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = ROOM.width / 2 + 1.6 + Math.random() * 5;
      positions[i * 3 + 1] = Math.random() * 9 - 1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 22;
      speeds[i] = 0.28 + Math.random() * 0.55;
    }
    return { positions, speeds };
  }, [count]);

  // Allocation-free: the attribute array is reused in place every frame.
  useFrame((_, delta) => {
    const geometry = ref.current?.geometry;
    if (!geometry) return;
    const array = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i += 1) {
      const y = i * 3 + 1;
      array[y] -= speeds[i] * delta;
      array[i * 3 + 2] += Math.sin(array[y] * 0.6 + i) * delta * 0.18;
      if (array[y] < -1.2) array[y] = 8.5;
    }
    geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#ffffff" size={0.075} sizeAttenuation transparent opacity={0.9} depthWrite={false} />
    </points>
  );
}

/* ── A classmate: low-poly seated student with a breathing idle ─────────── */

function Classmate({
  position,
  rotation = 0,
  hue,
  phase,
  writing,
}: {
  position: [number, number, number];
  rotation?: number;
  hue: string;
  phase: number;
  writing: boolean;
}) {
  const torso = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime + phase;
    if (torso.current) {
      torso.current.rotation.x = Math.sin(t * 0.7) * 0.022;
      torso.current.position.y = Math.sin(t * 1.1) * 0.012;
    }
    if (arm.current) {
      arm.current.rotation.x = writing ? -0.9 + Math.sin(t * 3.1) * 0.14 : -0.55;
      arm.current.rotation.z = writing ? Math.sin(t * 2.4) * 0.09 : 0;
    }
  });

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <group ref={torso}>
        {/* torso — winter jacket */}
        <mesh position={[0, 0.62, 0]} castShadow>
          <capsuleGeometry args={[0.19, 0.34, 4, 12]} />
          <meshStandardMaterial color={hue} roughness={0.85} />
        </mesh>
        {/* scarf */}
        <mesh position={[0, 0.86, 0.01]}>
          <torusGeometry args={[0.15, 0.045, 8, 18]} />
          <meshStandardMaterial color="#e2506a" roughness={0.9} />
        </mesh>
        {/* head */}
        <mesh position={[0, 1.05, 0]} castShadow>
          <sphereGeometry args={[0.145, 20, 16]} />
          <meshStandardMaterial color="#c89272" roughness={0.75} />
        </mesh>
        {/* hair / beanie */}
        <mesh position={[0, 1.11, -0.01]}>
          <sphereGeometry args={[0.152, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
          <meshStandardMaterial color="#2a2333" roughness={0.95} />
        </mesh>
        {/* writing arm */}
        <group ref={arm} position={[0.17, 0.76, 0.06]}>
          <mesh position={[0, -0.02, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
            <capsuleGeometry args={[0.052, 0.34, 4, 8]} />
            <meshStandardMaterial color={hue} roughness={0.85} />
          </mesh>
        </group>
        <mesh position={[-0.2, 0.66, 0.12]} rotation={[1.15, 0, 0]}>
          <capsuleGeometry args={[0.052, 0.3, 4, 8]} />
          <meshStandardMaterial color={hue} roughness={0.85} />
        </mesh>
      </group>
      {/* legs under the desk */}
      <mesh position={[0, 0.24, 0.16]} rotation={[1.35, 0, 0]}>
        <capsuleGeometry args={[0.075, 0.34, 4, 8]} />
        <meshStandardMaterial color="#2f3646" roughness={0.9} />
      </mesh>
    </group>
  );
}

/* ── Steam curling off the learner's mug (winter detail) ───────────────── */

function Steam({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Points>(null);
  const count = 28;
  const positions = useMemo(() => {
    const array = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      array[i * 3] = (Math.random() - 0.5) * 0.06;
      array[i * 3 + 1] = Math.random() * 0.4;
      array[i * 3 + 2] = (Math.random() - 0.5) * 0.06;
    }
    return array;
  }, []);
  useFrame((state, delta) => {
    const geometry = ref.current?.geometry;
    if (!geometry) return;
    const array = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i += 1) {
      array[i * 3 + 1] += delta * 0.14;
      array[i * 3] += Math.sin(state.clock.elapsedTime * 1.4 + i) * delta * 0.02;
      if (array[i * 3 + 1] > 0.42) {
        array[i * 3 + 1] = 0;
        array[i * 3] = (Math.random() - 0.5) * 0.05;
      }
    }
    geometry.attributes.position.needsUpdate = true;
  });
  return (
    <points ref={ref} position={position}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#ffffff" size={0.035} transparent opacity={0.22} depthWrite={false} />
    </points>
  );
}

/* ── The room ──────────────────────────────────────────────────────────── */

function Room({ snow = 420, lampLights = 2 }: { snow?: number; lampLights?: 1 | 2 }) {
  const fan = useRef<THREE.Group>(null);
  const clock = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (fan.current) fan.current.rotation.y = state.clock.elapsedTime * 0.35;
    if (clock.current) clock.current.rotation.z = -state.clock.elapsedTime * 0.1;
  });

  // Module-singleton merged geometry: built once, reused for the app's life.
  const merged = getMergedRoomStatics();

  const classmates = useMemo(
    () =>
      [
        { pos: [-3.1, 0, 2.85], hue: "#4c6ef5", writing: true },
        { pos: [3.3, 0, 2.85], hue: "#2f9e6e", writing: false },
        { pos: [-3.1, 0, 5.35], hue: "#d97757", writing: false },
        { pos: [0.15, 0, 5.35], hue: "#7c5cd6", writing: true },
        { pos: [3.3, 0, 5.35], hue: "#b8455f", writing: true },
        { pos: [-3.1, 0, 7.65], hue: "#3f7fb5", writing: false },
        { pos: [3.3, 0, 7.65], hue: "#8a6b3d", writing: true },
      ].map((entry, index) => ({ ...entry, phase: index * 1.37 })),
    [],
  );

  return (
    <group>
      {/* Shell */}
      <mesh position={[0, ROOM.height / 2, 3]} receiveShadow>
        <boxGeometry args={[ROOM.width, ROOM.height, ROOM.depth]} />
        {wallMat}
      </mesh>
      {/* Floor */}
      <mesh position={[0, 0.001, 3]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM.width, ROOM.depth]} />
        <meshStandardMaterial color="#8a6a4b" roughness={0.85} />
      </mesh>
      {/* Front wall panelling behind the board */}
      <mesh position={[0, 1.6, -3.44]}>
        <planeGeometry args={[ROOM.width, 3.2]} />
        <meshStandardMaterial color="#20303f" roughness={0.9} />
      </mesh>
      {/* Skirting */}
      <mesh position={[0, 0.09, -3.42]}>
        <boxGeometry args={[ROOM.width, 0.18, 0.06]} />
        <meshStandardMaterial color="#5a4633" roughness={0.8} />
      </mesh>

      {/* Winter windows — merged frames + glass + ledges (was 21 meshes).
          Frosted glass from plain transparency: one blended quad, never a
          second scene render per surface. */}
      <mesh geometry={merged.windowFrames}>
        <meshStandardMaterial color="#eef3fb" roughness={0.7} />
      </mesh>
      <mesh geometry={merged.windowGlass}>
        <meshStandardMaterial color="#dceaff" transparent opacity={0.32} roughness={0.4} />
      </mesh>
      <mesh geometry={merged.windowLedges}>
        <meshStandardMaterial color="#ffffff" roughness={1} />
      </mesh>
      {/* One cold daylight shared by all three bays (was one light per bay). */}
      <pointLight position={[5.7, 1.85, 1.6]} intensity={8} distance={12} color="#bcd8ff" />
      <Snowfall count={snow} />
      {/* Radiator under the windows */}
      <mesh position={[ROOM.width / 2 - 0.2, 0.35, 1.6]} castShadow>
        <boxGeometry args={[0.16, 0.55, 6.5]} />
        <meshStandardMaterial color="#e8edf5" roughness={0.5} metalness={0.3} />
      </mesh>

      {/* Ceiling lamps — one merged emissive mesh (was 6) + consolidated lights. */}
      <mesh geometry={merged.lampBoxes}>
        <meshStandardMaterial color="#fff6e2" emissive="#ffd9a0" emissiveIntensity={1.5} />
      </mesh>
      {lampLights === 2 ? (
        <>
          <pointLight position={[0, 2.85, -0.5]} intensity={10} distance={11} color="#ffd9a8" />
          <pointLight position={[0, 2.85, 3.5]} intensity={10} distance={11} color="#ffd9a8" />
        </>
      ) : (
        <pointLight position={[0, 2.85, 1.4]} intensity={12} distance={13} color="#ffd9a8" />
      )}

      {/* Ceiling fan (slow — it's winter) */}
      <group position={[0, ROOM.height - 0.25, 4]}>
        <mesh>
          <cylinderGeometry args={[0.08, 0.08, 0.28, 10]} />
          <meshStandardMaterial color="#5c6473" metalness={0.6} roughness={0.4} />
        </mesh>
        <group ref={fan}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} rotation={[0, (i * Math.PI * 2) / 3, 0]} position={[0, -0.14, 0]}>
              <boxGeometry args={[1.5, 0.02, 0.2]} />
              <meshStandardMaterial color="#6d7688" roughness={0.6} />
            </mesh>
          ))}
        </group>
      </group>

      {/* Wall clock on the right wall */}
      <group position={[ROOM.width / 2 - 0.08, 2.55, -1.9]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh>
          <cylinderGeometry args={[0.26, 0.26, 0.05, 24]} />
          <meshStandardMaterial color="#f4f6fb" roughness={0.6} />
        </mesh>
        <mesh ref={clock} position={[0, 0.04, 0]}>
          <boxGeometry args={[0.02, 0.01, 0.18]} />
          <meshStandardMaterial color="#1b2432" />
        </mesh>
      </group>

      {/* Bookshelf body + books merged per colour (was 22 meshes). */}
      <mesh position={[-ROOM.width / 2 + 0.35, 0.9, 7.2]} castShadow>
        <boxGeometry args={[0.4, 1.8, 2.2]} />
        <meshStandardMaterial color="#7c5a3a" roughness={0.85} />
      </mesh>
      {merged.books.map((geometry, index) => (
        <mesh key={BOOK_BIN_COLORS[index]} geometry={geometry}>
          <meshStandardMaterial color={BOOK_BIN_COLORS[index]} roughness={0.85} />
        </mesh>
      ))}

      {/* Teacher's desk in front */}
      <group position={[-3.6, 0, -2.4]}>
        <mesh position={[0, 0.78, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.8, 0.06, 0.75]} />
          <meshStandardMaterial color="#6f4c2c" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.39, 0]} castShadow>
          <boxGeometry args={[1.7, 0.72, 0.68]} />
          <meshStandardMaterial color="#5c3f24" roughness={0.8} />
        </mesh>
      </group>

      {/* Student desks — 4 merged meshes (was 64). The learner's own desk is
          built by <DeskConsole>, so its slot stays empty here too. */}
      <mesh geometry={merged.deskTops} castShadow receiveShadow>
        <meshStandardMaterial color="#b07f4e" roughness={0.62} />
      </mesh>
      <mesh geometry={merged.deskBodies}>
        <meshStandardMaterial color="#8d6238" roughness={0.7} />
      </mesh>
      <mesh geometry={merged.deskLegs}>
        <meshStandardMaterial color="#4a5162" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh geometry={merged.chairParts}>
        <meshStandardMaterial color="#3d4658" roughness={0.8} />
      </mesh>

      {/* Classmates */}
      {classmates.map((mate, i) => (
        <Classmate
          key={i}
          position={mate.pos as [number, number, number]}
          hue={mate.hue}
          phase={mate.phase}
          writing={mate.writing}
        />
      ))}

      {/* Warm mug on the learner's desk */}
      <group position={[0.8, 0.79, 1.9]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.045, 0.04, 0.1, 14]} />
          <meshStandardMaterial color="#f2f5fb" roughness={0.5} />
        </mesh>
      </group>
      <Steam position={[0.8, 0.86, 1.9]} />

      {/* Winter light rig — shadows bake once (see <BakeShadows>), so the
          map below renders a single time instead of every frame. */}
      <ambientLight intensity={0.55} color="#cfe0f5" />
      <hemisphereLight args={["#dfeaff", "#4a3f34", 0.6]} />
      <directionalLight
        position={[8, 6, 1]}
        intensity={1.5}
        color="#cfe3ff"
        castShadow
        shadow-mapSize={[512, 512]}
      />
      <fog attach="fog" args={["#9fb3cc", 14, 34]} />
    </group>
  );
}

// The room is static between tier changes — memo keeps pinch-zoom and focus
// renders (which re-run the parent every gesture tick) from reconciling the
// whole scene graph for no reason. Tier props still flow through on change.
export default memo(Room);
