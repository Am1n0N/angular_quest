import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, useAnimations, useGLTF } from "@react-three/drei";

const TRUCK_MODEL_URL = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumMilkTruck/glTF/CesiumMilkTruck.gltf";
const TRACK_LENGTH = 120;

function Road({ scrollSpeed = 1 }) {
  const laneRef = useRef(null);

  useFrame((state) => {
    if (!laneRef.current) return;
    const t = state.clock.getElapsedTime();
    laneRef.current.position.z = ((t * 22 * scrollSpeed) % 6) - 3;
  });

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, TRACK_LENGTH * 0.5 - 6]} receiveShadow>
        <planeGeometry args={[12, TRACK_LENGTH]} />
        <meshStandardMaterial color="#1d2533" roughness={0.85} metalness={0.08} />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position={[0, -0.015, TRACK_LENGTH * 0.5 - 6]} ref={laneRef}>
        <planeGeometry args={[0.35, TRACK_LENGTH + 12]} />
        <meshStandardMaterial color="#f1f3f6" emissive="#7ea1d6" emissiveIntensity={0.15} />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position={[-6.1, -0.01, TRACK_LENGTH * 0.5 - 6]}>
        <planeGeometry args={[0.2, TRACK_LENGTH]} />
        <meshStandardMaterial color="#f7a85a" emissive="#f7a85a" emissiveIntensity={0.18} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[6.1, -0.01, TRACK_LENGTH * 0.5 - 6]}>
        <planeGeometry args={[0.2, TRACK_LENGTH]} />
        <meshStandardMaterial color="#f7a85a" emissive="#f7a85a" emissiveIntensity={0.18} />
      </mesh>

      <mesh position={[0, 2.4, TRACK_LENGTH - 7]} castShadow>
        <boxGeometry args={[12.5, 0.25, 0.7]} />
        <meshStandardMaterial color="#f6f7fb" emissive="#9bc4ff" emissiveIntensity={0.2} />
      </mesh>
      {Array.from({ length: 16 }).map((_, i) => (
        <mesh key={i} position={[-5.8 + i * 0.78, 2.1, TRACK_LENGTH - 7]}>
          <sphereGeometry args={[0.08, 10, 10]} />
          <meshStandardMaterial color={i % 2 ? "#ff6b5a" : "#ffd266"} emissive={i % 2 ? "#ff6b5a" : "#ffd266"} emissiveIntensity={0.6} />
        </mesh>
      ))}
    </group>
  );
}

function TrailDots({ laneX, progress, color = "#70f5d1" }) {
  const dotsRef = useRef([]);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    dotsRef.current.forEach((dot, index) => {
      if (!dot) return;
      const zBase = (progress / 100) * (TRACK_LENGTH - 10);
      const offset = ((time * 10 + index * 1.7) % 9) - 9;
      dot.position.set(laneX + Math.sin(time * 3 + index) * 0.08, 0.42, zBase + offset);
      dot.scale.setScalar(1 - (index / 18) * 0.55);
      dot.material.opacity = 0.9 - index * 0.04;
    });
  });

  return (
    <group>
      {Array.from({ length: 16 }).map((_, i) => (
        <mesh key={i} ref={(node) => { dotsRef.current[i] = node; }}>
          <sphereGeometry args={[0.07, 8, 8]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.65} transparent opacity={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function CarModel({ laneX, progress, tint = "#4ad6b7", glow = "#4ad6b7", speed = 40, boost = false }) {
  const group = useRef(null);
  const { scene, animations } = useGLTF(TRUCK_MODEL_URL);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    const wheelAction = actions?.Wheels;
    if (!wheelAction) return;
    wheelAction.reset().play();
    return () => wheelAction.stop();
  }, [actions]);

  useEffect(() => {
    cloned.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((material) => {
        if (material.name?.toLowerCase().includes("truck")) {
          material.color.set(tint);
          material.emissive.set(glow);
          material.emissiveIntensity = boost ? 0.42 : 0.16;
        }
      });
    });
  }, [cloned, tint, glow, boost]);

  useFrame(() => {
    if (!group.current) return;
    const z = (progress / 100) * (TRACK_LENGTH - 10);
    group.current.position.set(laneX, 0.28, z);
    group.current.rotation.set(0, Math.PI, 0);
    const wheelAction = actions?.Wheels;
    if (wheelAction) wheelAction.timeScale = Math.max(0.6, speed / 34);
  });

  return (
    <group ref={group} scale={0.2} castShadow>
      <primitive object={cloned} />
    </group>
  );
}

function Scene({ playerProgress, cpuProgress, playerSpeed, cpuSpeed, boostPulse, slowPulse }) {
  const avgSpeed = ((playerSpeed + cpuSpeed) * 0.5) / 52;

  useFrame((state) => {
    const playerZ = (playerProgress / 100) * (TRACK_LENGTH - 10);
    const desiredX = 0;
    const desiredY = 8.8;
    const desiredZ = playerZ - 12;

    state.camera.position.x += (desiredX - state.camera.position.x) * 0.08;
    state.camera.position.y += (desiredY - state.camera.position.y) * 0.08;
    state.camera.position.z += (desiredZ - state.camera.position.z) * 0.12;
    state.camera.lookAt(0, 0.8, playerZ + 10);
  });

  return (
    <>
      <color attach="background" args={["#8ed0ff"]} />
      <fog attach="fog" args={["#8ed0ff", 18, 120]} />
      <ambientLight intensity={0.58} />
      <directionalLight position={[6, 14, 10]} intensity={1.25} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <Environment preset="sunset" />

      <Road scrollSpeed={avgSpeed} />

      <CarModel
        laneX={-2.2}
        progress={playerProgress}
        tint="#4ce2c1"
        glow="#52ffe0"
        speed={playerSpeed}
        boost={boostPulse > slowPulse}
      />
      <TrailDots laneX={-2.2} progress={playerProgress} color="#4ce2c1" />

      <CarModel
        laneX={2.2}
        progress={cpuProgress}
        tint="#ffa35b"
        glow="#ff7a45"
        speed={cpuSpeed}
      />
      <TrailDots laneX={2.2} progress={cpuProgress} color="#ff9d64" />

      <mesh rotation-x={-Math.PI / 2} position={[0, -0.04, TRACK_LENGTH * 0.5 - 6]} receiveShadow>
        <planeGeometry args={[54, TRACK_LENGTH * 1.4]} />
        <meshStandardMaterial color="#5b8d4a" roughness={1} metalness={0} />
      </mesh>
    </>
  );
}

export default function RaceThreeScene({ playerProgress, cpuProgress, playerSpeed, cpuSpeed, boostPulse, slowPulse }) {
  return (
    <div style={{ width: "100%", height: 360, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.35)", boxShadow: "inset 0 0 24px rgba(10,20,45,0.2)" }}>
      <Canvas shadows camera={{ position: [0, 17, -2], fov: 45 }} dpr={[1, 1.5]}>
        <Suspense fallback={null}>
          <Scene
            playerProgress={playerProgress}
            cpuProgress={cpuProgress}
            playerSpeed={playerSpeed}
            cpuSpeed={cpuSpeed}
            boostPulse={boostPulse}
            slowPulse={slowPulse}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload(TRUCK_MODEL_URL);
