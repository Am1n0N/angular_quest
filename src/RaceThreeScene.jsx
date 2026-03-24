import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Sky, Stars, Text, useGLTF } from "@react-three/drei";
import * as THREE from "three";

const PLAYER_MODEL_URL = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Buggy/glTF/Buggy.gltf";
const CPU_MODEL_URL = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/ToyCar/glTF/ToyCar.gltf";
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
        <meshStandardMaterial
          color="#0f1a30"
          emissive="#1a2a4a"
          emissiveIntensity={0.15}
          roughness={0.88}
          metalness={0.05}
          envMapIntensity={0.6}
        />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position={[0, -0.015, TRACK_LENGTH * 0.5 - 6]} ref={laneRef}>
        <planeGeometry args={[0.35, TRACK_LENGTH + 12]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#4db8ff"
          emissiveIntensity={0.55}
          metalness={0.3}
          roughness={0.25}
        />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position={[-6.1, -0.01, TRACK_LENGTH * 0.5 - 6]}>
        <planeGeometry args={[0.2, TRACK_LENGTH]} />
        <meshStandardMaterial
          color="#ff9d3d"
          emissive="#ff7a1f"
          emissiveIntensity={0.35}
          metalness={0.35}
          roughness={0.35}
        />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[6.1, -0.01, TRACK_LENGTH * 0.5 - 6]}>
        <planeGeometry args={[0.2, TRACK_LENGTH]} />
        <meshStandardMaterial
          color="#ff9d3d"
          emissive="#ff7a1f"
          emissiveIntensity={0.35}
          metalness={0.35}
          roughness={0.35}
        />
      </mesh>

      <mesh position={[0, 2.4, TRACK_LENGTH - 7]} castShadow>
        <boxGeometry args={[12.5, 0.25, 0.7]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#8ba3ff"
          emissiveIntensity={0.45}
          metalness={0.5}
          roughness={0.15}
        />
      </mesh>

      {Array.from({ length: 16 }).map((_, i) => (
        <mesh key={i} position={[-5.8 + i * 0.78, 2.1, TRACK_LENGTH - 7]} castShadow>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshStandardMaterial
            color={i % 2 ? "#ff6b5a" : "#ffd266"}
            emissive={i % 2 ? "#ff6b5a" : "#ffd266"}
            emissiveIntensity={1.0}
            metalness={0.4}
            roughness={0.2}
          />
        </mesh>
      ))}

      {Array.from({ length: 40 }).map((_, i) => (
        <mesh key={`lane-${i}`} rotation-x={-Math.PI / 2} position={[0, 0.01, i * 3 - 6]} castShadow>
          <boxGeometry args={[0.1, 0.3, 0.2]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#7ea1ff"
            emissiveIntensity={0.4}
            metalness={0.25}
            roughness={0.15}
          />
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
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.75}
            transparent
            opacity={0.8}
            metalness={0.1}
          />
        </mesh>
      ))}
    </group>
  );
}

function DustParticles({ laneX, progress, speed }) {
  const particlesRef = useRef([]);
  const particleCount = 12;

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    const zBase = (progress / 100) * (TRACK_LENGTH - 10);

    particlesRef.current.forEach((particle, index) => {
      if (!particle) return;
      const phase = (time * 5 + index) % 1;
      particle.position.set(
        laneX + (Math.random() - 0.5) * 0.6 + Math.sin(time * 2 + index) * 0.15,
        0.15 + Math.sin(time * 3 + index) * 0.1,
        zBase + (phase * -2)
      );
      particle.scale.setScalar(0.3 + Math.sin(time * 4 + index) * 0.1);
      particle.material.opacity = Math.max(0, 1 - phase * 1.2);
    });
  });

  return (
    <group>
      {Array.from({ length: particleCount }).map((_, i) => (
        <mesh key={i} ref={(node) => { particlesRef.current[i] = node; }}>
          <sphereGeometry args={[0.06, 6, 6]} />
          <meshStandardMaterial
            color="#d4a574"
            emissive="#8b6f47"
            emissiveIntensity={0.4}
            transparent
            opacity={0.5}
          />
        </mesh>
      ))}
    </group>
  );
}

function CarAura({ laneX, progress, color = "#4ad6b7", intensity = 0.45 }) {
  const auraRef = useRef(null);

  useFrame((state) => {
    if (!auraRef.current) return;
    const t = state.clock.getElapsedTime();
    const z = (progress / 100) * (TRACK_LENGTH - 10);
    auraRef.current.position.set(laneX, 0.03, z - 0.15);
    const pulse = 1 + Math.sin(t * 6) * 0.12;
    auraRef.current.scale.set(pulse, pulse, pulse);
    auraRef.current.material.opacity = intensity + Math.sin(t * 8) * 0.12;
  });

  return (
    <mesh ref={auraRef} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[0.42, 1.2, 48]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.7}
        transparent
        opacity={intensity}
        metalness={0.2}
      />
    </mesh>
  );
}

function RacerLabel({ laneX, progress, label, color = "#ffffff" }) {
  const labelRef = useRef(null);

  useFrame((state) => {
    if (!labelRef.current) return;
    const z = (progress / 100) * (TRACK_LENGTH - 10);
    labelRef.current.position.set(laneX, 1.42, z - 0.1);
    labelRef.current.quaternion.copy(state.camera.quaternion);
  });

  return (
    <Text
      ref={labelRef}
      fontSize={0.48}
      color={color}
      anchorX="center"
      anchorY="middle"
      outlineWidth={0.035}
      outlineColor="#0a0f1a"
      letterSpacing={0.08}
    >
      {label}
    </Text>
  );
}

function CarModel({ modelUrl, laneX, progress, tint = "#4ad6b7", glow = "#4ad6b7", speed = 40, boost = false, sizeFactor = 1 }) {
  const group = useRef(null);
  const { scene } = useGLTF(modelUrl);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const scale = useMemo(() => {
    const bounds = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    bounds.getSize(size);
    const longestSide = Math.max(size.x, size.y, size.z) || 1;
    return (2.1 / longestSide) * sizeFactor;
  }, [cloned, sizeFactor]);

  useEffect(() => {
    cloned.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((material, idx) => {
        const nextMaterial = material.clone();
        if (nextMaterial.color) nextMaterial.color.lerp(new THREE.Color(tint), 0.5);
        if (nextMaterial.emissive) {
          nextMaterial.emissive.set(glow);
          nextMaterial.emissiveIntensity = boost ? 0.35 : 0.15;
        }
        // Enhanced Bruno Simon style material properties
        nextMaterial.roughness = Math.max(0.08, (nextMaterial.roughness || 0.8) * 0.5);
        nextMaterial.metalness = Math.min(0.85, (nextMaterial.metalness || 0) + 0.5);
        nextMaterial.envMapIntensity = 1.2;

        // Add realistic reflection
        if (!nextMaterial.map) {
          nextMaterial.side = THREE.DoubleSide;
        }

        mats[idx] = nextMaterial;
      });
      child.material = Array.isArray(child.material) ? mats : mats[0];
      child.castShadow = true;
      child.receiveShadow = true;
    });
  }, [cloned, tint, glow, boost]);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.getElapsedTime();
    const z = (progress / 100) * (TRACK_LENGTH - 10);
    const bob = 0.26 + Math.sin(t * (boost ? 8 : 5)) * (boost ? 0.02 : 0.01);
    group.current.position.set(laneX, bob, z);
    group.current.rotation.set(0, Math.PI, Math.sin(t * 4) * (boost ? 0.03 : 0.015));
  });

  return (
    <group ref={group} scale={scale} castShadow receiveShadow>
      <primitive object={cloned} />
    </group>
  );
}

function PreRaceCountdown({ isActive, elapsedTime }) {
  const textRef = useRef(null);
  const torusRef = useRef(null);

  useFrame((state) => {
    if (!isActive) return;
    const t = state.clock.getElapsedTime();

    if (textRef.current) {
      const scale = 1 + Math.sin(t * 6) * 0.08;
      textRef.current.scale.set(scale, scale, scale);
      textRef.current.rotation.z = Math.sin(t * 2) * 0.02;
    }

    if (torusRef.current) {
      torusRef.current.rotation.z += 0.015;
      torusRef.current.material.opacity = Math.max(0, 1 - t / 3);
    }
  });

  if (isActive) {
    const t = elapsedTime;
    const count = Math.ceil(Math.max(0, 3 - t));

    return (
      <>
        <Text
          ref={textRef}
          position={[0, 2.5, 0]}
          fontSize={2.8}
          color={count === 3 ? "#ff6b6b" : count === 2 ? "#ffd77a" : "#52ffe0"}
          anchorX="center"
          anchorY="middle"
          font="https://fonts.googleapis.com/css2?family=Inter:wght@900&display=swap"
          outlineWidth={0.15}
          outlineColor="#0a0f1a"
          letterSpacing={0.2}
        >
          {count > 0 ? count : "GO!"}
        </Text>

        <mesh ref={torusRef} position={[0, 1.5, 0]}>
          <torusGeometry args={[2, 0.15, 32, 100]} />
          <meshStandardMaterial
            color="#52ffe0"
            emissive="#52ffe0"
            emissiveIntensity={0.6}
            transparent
            opacity={Math.max(0, 1 - t / 3)}
          />
        </mesh>
      </>
    );
  }

  return null;
}

function AdvancedLighting() {
  const spotLightRef = useRef(null);

  useFrame((state) => {
    if (spotLightRef.current) {
      spotLightRef.current.position.x = Math.sin(state.clock.getElapsedTime() * 0.3) * 8;
    }
  });

  return (
    <>
      {/* Key light - main directional */}
      <directionalLight
        position={[8, 16, 12]}
        intensity={1.4}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
        shadow-camera-near={0.5}
        shadow-camera-far={200}
      />

      {/* Fill light */}
      <directionalLight position={[-8, 12, -10]} intensity={0.6} />

      {/* Rim light */}
      <directionalLight position={[0, 4, -20]} intensity={0.8} color="#5a9aff" />

      {/* Ambient light - soft global illumination */}
      <ambientLight intensity={0.65} color="#ffffff" />

      {/* Point lights for track illumination */}
      <pointLight position={[-6.5, 2.2, 30]} intensity={0.4} color="#ffaa44" />
      <pointLight position={[6.5, 2.2, 30]} intensity={0.4} color="#ffaa44" />

      {/* Dynamic spotlight */}
      <spotLight
        ref={spotLightRef}
        position={[0, 12, 20]}
        intensity={0.5}
        angle={Math.PI / 6}
        penumbra={0.5}
        color="#ffffff"
        castShadow
      />
    </>
  );
}

function Scene({ playerProgress, cpuProgress, playerSpeed, cpuSpeed, boostPulse, slowPulse }) {
  const avgSpeed = ((playerSpeed + cpuSpeed) * 0.5) / 52;
  const isRaceActive = playerProgress > 0;
  const elapsedTimeRef = useRef(0);

  useFrame((state) => {
    elapsedTimeRef.current = state.clock.getElapsedTime();
    const playerZ = (playerProgress / 100) * (TRACK_LENGTH - 10);
    const desiredX = 0;

    if (!isRaceActive) {
      const desiredY = 6.5;
      const desiredZ = -8;
      state.camera.position.x += (desiredX - state.camera.position.x) * 0.06;
      state.camera.position.y += (desiredY - state.camera.position.y) * 0.06;
      state.camera.position.z += (desiredZ - state.camera.position.z) * 0.06;
      state.camera.lookAt(0, 0.5, 5);
    } else {
      const desiredY = 8.8;
      const desiredZ = playerZ - 12;
      state.camera.position.x += (desiredX - state.camera.position.x) * 0.08;
      state.camera.position.y += (desiredY - state.camera.position.y) * 0.08;
      state.camera.position.z += (desiredZ - state.camera.position.z) * 0.12;
      state.camera.lookAt(0, 0.8, playerZ + 10);
    }
  });

  return (
    <>
      <Road scrollSpeed={avgSpeed} />

      <CarModel
        modelUrl={PLAYER_MODEL_URL}
        laneX={-2.2}
        progress={playerProgress}
        tint="#4ce2c1"
        glow="#52ffe0"
        speed={playerSpeed}
        boost={boostPulse > slowPulse}
        sizeFactor={1.06}
      />
      <CarAura laneX={-2.2} progress={playerProgress} color="#4ce2c1" intensity={0.52} />
      <RacerLabel laneX={-2.2} progress={playerProgress} label="PLAYER" color="#4ce2c1" />
      <TrailDots laneX={-2.2} progress={playerProgress} color="#4ce2c1" />
      {isRaceActive && <DustParticles laneX={-2.2} progress={playerProgress} speed={playerSpeed} />}

      <CarModel
        modelUrl={CPU_MODEL_URL}
        laneX={2.2}
        progress={cpuProgress}
        tint="#ffa35b"
        glow="#ff7a45"
        speed={cpuSpeed}
        sizeFactor={1}
      />
      <CarAura laneX={2.2} progress={cpuProgress} color="#ff9d64" intensity={0.44} />
      <RacerLabel laneX={2.2} progress={cpuProgress} label="CPU" color="#ff9d64" />
      <TrailDots laneX={2.2} progress={cpuProgress} color="#ff9d64" />
      {isRaceActive && <DustParticles laneX={2.2} progress={cpuProgress} speed={cpuSpeed} />}

      {Array.from({ length: 18 }).map((_, i) => (
        <group key={i} position={[-6.05, 0.28, i * 6.4 - 6]}>
          <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.12, 1.4, 0.12]} />
            <meshStandardMaterial
              color="#6b7aa5"
              metalness={0.65}
              roughness={0.3}
            />
          </mesh>
          <mesh position={[0.05, 1.35, 0]} castShadow>
            <sphereGeometry args={[0.16, 16, 16]} />
            <meshStandardMaterial
              color="#ffbb33"
              emissive="#ffbb33"
              emissiveIntensity={0.65}
              metalness={0.3}
              roughness={0.25}
            />
          </mesh>
        </group>
      ))}

      {Array.from({ length: 18 }).map((_, i) => (
        <group key={`r-${i}`} position={[6.05, 0.28, i * 6.4 - 6]}>
          <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.12, 1.4, 0.12]} />
            <meshStandardMaterial
              color="#6b7aa5"
              metalness={0.65}
              roughness={0.3}
            />
          </mesh>
          <mesh position={[-0.05, 1.35, 0]} castShadow>
            <sphereGeometry args={[0.16, 16, 16]} />
            <meshStandardMaterial
              color="#ffbb33"
              emissive="#ffbb33"
              emissiveIntensity={0.65}
              metalness={0.3}
              roughness={0.25}
            />
          </mesh>
        </group>
      ))}

      <mesh rotation-x={-Math.PI / 2} position={[0, -0.04, TRACK_LENGTH * 0.5 - 6]} receiveShadow>
        <planeGeometry args={[54, TRACK_LENGTH * 1.4]} />
        <meshStandardMaterial
          color="#4a7a2f"
          roughness={1}
          metalness={0}
        />
      </mesh>

      <PreRaceCountdown isActive={!isRaceActive} elapsedTime={elapsedTimeRef.current} />
    </>
  );
}

export default function RaceThreeScene({ playerProgress = 0, cpuProgress = 0, playerSpeed = 50, cpuSpeed = 40, boostPulse = 0, slowPulse = 0 }) {
  return (
    <div style={{ width: "100%", height: "360px" }}>
      <Canvas
        shadows
        camera={{ position: [0, 5, -3], fov: 50, near: 0.1, far: 1000 }}
        gl={{ antialias: true, alpha: false }}
      >
        <Suspense fallback={null}>
          <color attach="background" args={["#1a3a52"]} />
          <fog attach="fog" args={["#1a3a52", 10, 180]} />

          <Sky distance={450000} sunPosition={[120, 40, 140]} inclination={0.45} azimuth={0.3} />
          <Stars radius={150} depth={50} count={3000} factor={5} saturation={0.3} fade speed={0.2} />

          <AdvancedLighting />
          <Environment preset="night" intensity={0.5} />

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

useGLTF.preload(PLAYER_MODEL_URL);
useGLTF.preload(CPU_MODEL_URL);
