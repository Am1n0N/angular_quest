import { useEffect, useRef } from "react";
import * as THREE from "three";

const TRACK_LENGTH = 110;
const FINISH_Z = 102;
const PLAYER_LANE_X = -2.2;
const CPU_LANE_X = 2.2;
const SPEED_DISPLAY_FACTOR = 16;

export default function RaceThreeScene({ playerProgress = 0, cpuProgress = 0, playerSpeed = 40, cpuSpeed = 40 }) {
  const containerRef = useRef(null);
  const playerProgressRef = useRef(playerProgress);
  const cpuProgressRef = useRef(cpuProgress);
  const playerSpeedRef = useRef(playerSpeed);
  const cpuSpeedRef = useRef(cpuSpeed);

  useEffect(() => {
    playerProgressRef.current = playerProgress;
    cpuProgressRef.current = cpuProgress;
    playerSpeedRef.current = playerSpeed;
    cpuSpeedRef.current = cpuSpeed;
  }, [playerProgress, cpuProgress, playerSpeed, cpuSpeed]);

  useEffect(() => {
    if (!containerRef.current) return;

    // ── SETUP ──────────────────────────────────────────────────
    const cont = containerRef.current;
    const canvas = document.createElement("canvas");
    canvas.id = "rc";
    canvas.style.cssText = "display:block;position:absolute;inset:0;width:100%;height:100%;";

    const gameDiv = document.createElement("div");
    gameDiv.style.cssText = "position:relative;width:100%;height:100%;background:#1b3e58;overflow:hidden;";
    gameDiv.appendChild(canvas);
    cont.innerHTML = "";
    cont.appendChild(gameDiv);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 180);
    camera.position.set(0, 5, -6);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#1b3e58");
    scene.fog = new THREE.Fog("#1b3e58", 65, 145);

    function resize() {
      const W = gameDiv.clientWidth;
      const H = gameDiv.clientHeight;
      renderer.setSize(W, H);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", resize);

    // ── MATERIALS ──────────────────────────────────────────────
    const M = (c) => new THREE.MeshToonMaterial({ color: c });
    const ME = (c, i = 0.5) => new THREE.MeshToonMaterial({ color: c, emissive: c, emissiveIntensity: i });
    const MT = (c, o = 0.8) => new THREE.MeshToonMaterial({ color: c, transparent: true, opacity: o });

    // ── LIGHTS ────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const sun = new THREE.DirectionalLight(0xffeedd, 1.25);
    sun.position.set(8, 18, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, far: 55 });
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0x7799ff, 0.32);
    fill.position.set(-8, 5, -10);
    scene.add(fill);

    const backLight = new THREE.DirectionalLight(0x4488aa, 0.2);
    backLight.position.set(0, 3, -20);
    scene.add(backLight);

    // ── ROAD ───────────────────────────────────────────────────
    const road = new THREE.Mesh(new THREE.PlaneGeometry(9.4, TRACK_LENGTH + 12), M("#22223a"));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, TRACK_LENGTH / 2);
    road.receiveShadow = true;
    scene.add(road);

    const gMat = M("#286b1a");
    for (const sx of [-1, 1]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(42, TRACK_LENGTH + 12), gMat);
      g.rotation.x = -Math.PI / 2;
      g.position.set(sx * 25, -0.01, TRACK_LENGTH / 2);
      g.receiveShadow = true;
      scene.add(g);
    }

    const yMat = M("#ddb820");
    for (const sx of [-1, 1]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.22, TRACK_LENGTH + 12), yMat);
      s.rotation.x = -Math.PI / 2;
      s.position.set(sx * 4.58, 0.01, TRACK_LENGTH / 2);
      scene.add(s);
    }

    const dMat = M("#dde8f5");
    const ND = 30;
    for (let i = 0; i < ND; i++) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 1.4), dMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(0, 0.01, (i * (TRACK_LENGTH / ND)) + 0.5);
      scene.add(d);
    }

    // Start line
    const wMat = M("#f0f0f0");
    const sl = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 0.55), wMat);
    sl.rotation.x = -Math.PI / 2;
    sl.position.set(0, 0.02, 1.8);
    scene.add(sl);

    // Finish line
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 2; j++) {
        if ((i + j) % 2 === 0) {
          const t = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.85), wMat);
          t.rotation.x = -Math.PI / 2;
          t.position.set(-4 + i, 0.02, FINISH_Z + (j - 0.5) * 0.85);
          scene.add(t);
        }
      }
    }

    // Finish arch
    const archRM = M("#cc2020");
    const archYM = M("#f5c200");
    const pGeo = new THREE.BoxGeometry(0.28, 5.6, 0.28);
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(pGeo, archRM);
      p.position.set(sx * 5.1, 2.8, FINISH_Z + 0.35);
      p.castShadow = true;
      scene.add(p);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.38, 0.3), archYM);
    bar.position.set(0, 5.6, FINISH_Z + 0.35);
    bar.castShadow = true;
    scene.add(bar);

    for (let i = 0; i < 8; i++) {
      const fc = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.34, 0.05), M(i % 2 ? "#111" : "#eee"));
      fc.position.set(-4.2 + i * 1.2, 5.6, FINISH_Z + 0.5);
      scene.add(fc);
    }

    const sign = new THREE.Mesh(new THREE.BoxGeometry(5, 0.6, 0.08), M("#ffcc22"));
    sign.position.set(0, 6.6, FINISH_Z + 0.35);
    scene.add(sign);

    // Lamps
    const lpM = M("#5a6e7a");
    const lbM = ME("#ffeea0", 0.65);
    const lpG = new THREE.CylinderGeometry(0.07, 0.1, 3.8, 5);
    const lbG = new THREE.SphereGeometry(0.2, 5, 5);
    for (let i = 0; i < 15; i++) {
      const z = (i * (TRACK_LENGTH / 14)) + 1;
      for (const sx of [-1, 1]) {
        const lp = new THREE.Mesh(lpG, lpM);
        lp.position.set(sx * 5.4, 1.9, z);
        lp.castShadow = true;
        scene.add(lp);

        const lb = new THREE.Mesh(lbG, lbM);
        lb.position.set(sx * 5.4, 3.85, z);
        scene.add(lb);

        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 4), lpM);
        arm.rotation.z = Math.PI / 2;
        arm.position.set(sx * (5.4 - sx * 0.3), 3.75, z);
        scene.add(arm);
      }
    }

    // Trees
    const trM = M("#4f2e14");
    const lfMs = [M("#246218"), M("#2f7622"), M("#1a5514")];
    const trG = new THREE.CylinderGeometry(0.17, 0.28, 2, 5);
    const lfG = new THREE.ConeGeometry(1.5, 3.2, 6);
    [
      [-11, 4], [-15, 18], [-10, 32], [-14, 47], [-11, 61], [-15, 76], [-10, 90], [-14, 105],
      [10, 7], [14, 21], [11, 36], [14, 51], [12, 66], [10, 81], [14, 96], [11, 108],
    ].forEach(([x, z], i) => {
      const tr = new THREE.Mesh(trG, trM);
      tr.position.set(x, 1, z);
      tr.castShadow = true;
      scene.add(tr);

      const lf = new THREE.Mesh(lfG, lfMs[i % 3]);
      lf.position.set(x, 3.7, z);
      lf.castShadow = true;
      scene.add(lf);
    });

    // Crowd
    const cCols = ["#e74c3c", "#3ecec6", "#f39c12", "#9b59b6", "#2ecc71", "#e91e63", "#3498db", "#ff6b35"];
    const hdG = new THREE.SphereGeometry(0.18, 5, 4);
    const skG = new THREE.BoxGeometry(0.38, 0.75, 0.28);
    for (let i = 0; i < 55; i++) {
      const col = cCols[i % cCols.length];
      const sx = i % 2 ? -1 : 1;
      const sk = new THREE.Mesh(skG, M(col));
      sk.position.set(sx * (6.2 + Math.random() * 5.5), 0.375, Math.random() * TRACK_LENGTH);
      sk.castShadow = true;
      scene.add(sk);

      const hd = new THREE.Mesh(hdG, M("#f0d0a0"));
      hd.position.set(sk.position.x, sk.position.y + 0.55, sk.position.z);
      scene.add(hd);
    }

    // ── CARS ───────────────────────────────────────────────────
    function buildCar(bC, aC) {
      const g = new THREE.Group();
      const BM = M(bC);
      const AM = M(aC);
      const GM = MT("#2a3a55", 0.78);
      const HM = ME("#ffffaa", 0.75);
      const TM = ME("#ff1100", 0.65);
      const WM = M("#161628");
      const RM = M("#aabbcc");

      const body = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.5, 3.2), BM);
      body.position.y = 0.58;
      body.castShadow = true;
      g.add(body);

      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.48, 1.8), BM);
      cab.position.set(0, 1.07, 0.06);
      cab.castShadow = true;
      g.add(cab);

      const wsG = new THREE.BoxGeometry(1.3, 0.4, 0.06);
      for (const [z] of [[0.97], [-0.81]]) {
        const ws = new THREE.Mesh(wsG, GM);
        ws.position.set(0, 1.06, z);
        g.add(ws);
      }

      const swG = new THREE.BoxGeometry(0.06, 0.36, 1.28);
      for (const sx of [-0.69, 0.69]) {
        const sw = new THREE.Mesh(swG, GM);
        sw.position.set(sx, 1.06, 0.1);
        g.add(sw);
      }

      const hood = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 1.12), BM);
      hood.position.set(0, 0.84, 1.1);
      g.add(hood);

      const sp = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.07, 0.42), AM);
      sp.position.set(0, 1.5, -1.28);
      g.add(sp);

      for (const sx of [-0.62, 0.62]) {
        const sl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.1), AM);
        sl.position.set(sx, 1.3, -1.28);
        g.add(sl);
      }

      const bump = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 0.1), AM);
      bump.position.set(0, 0.38, 1.67);
      g.add(bump);

      const rbump = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.1), BM);
      rbump.position.set(0, 0.36, -1.67);
      g.add(rbump);

      const ltG = new THREE.BoxGeometry(0.38, 0.15, 0.07);
      for (const sx of [-0.56, 0.56]) {
        const h = new THREE.Mesh(ltG, HM);
        h.position.set(sx, 0.64, 1.63);
        g.add(h);

        const t = new THREE.Mesh(ltG, TM);
        t.position.set(sx, 0.64, -1.63);
        g.add(t);
      }

      g.userData.wheels = [];
      const wG = new THREE.CylinderGeometry(0.3, 0.3, 0.24, 10);
      const rG = new THREE.CylinderGeometry(0.15, 0.15, 0.25, 8);

      [
        [-0.95, 0.3, 1.02],
        [0.95, 0.3, 1.02],
        [-0.95, 0.3, -1.02],
        [0.95, 0.3, -1.02],
      ].forEach(([x, y, z]) => {
        const wh = new THREE.Mesh(wG, WM);
        wh.position.set(x, y, z);
        wh.rotation.z = Math.PI / 2;
        wh.castShadow = true;
        g.add(wh);

        const rm = new THREE.Mesh(rG, RM);
        rm.position.set(x, y, z);
        rm.rotation.z = Math.PI / 2;
        g.add(rm);

        g.userData.wheels.push(wh);
      });

      const ugM = new THREE.MeshToonMaterial({
        color: bC,
        emissive: bC,
        emissiveIntensity: 0.25,
        transparent: true,
        opacity: 0.3,
      });
      const ug = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.7), ugM);
      ug.rotation.x = Math.PI / 2;
      ug.position.y = 0.1;
      g.add(ug);

      g.userData.glowMat = ugM;
      g.userData.bodyMat = BM;

      return g;
    }

    const pMesh = buildCar("#3ecec6", "#1fada6");
    pMesh.position.set(PLAYER_LANE_X, 0, 0);
    scene.add(pMesh);

    const cMesh = buildCar("#ff5835", "#cc3515");
    cMesh.position.set(CPU_LANE_X, 0, 0);
    scene.add(cMesh);

    // ── ANIMATION LOOP ────────────────────────────────────────
    let rafId = 0;
    let lastTime = performance.now();
    let elapsedTime = 0;
    let wRot = 0;
    let pZRender = (playerProgressRef.current / 100) * FINISH_Z;
    let cZRender = (cpuProgressRef.current / 100) * FINISH_Z;
    let pSpeedRender = playerSpeedRef.current;
    let cSpeedRender = cpuSpeedRef.current;

    function animate() {
      rafId = requestAnimationFrame(animate);

      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      elapsedTime += dt;
      lastTime = now;

      const currentPlayerProgress = playerProgressRef.current;
      const currentCpuProgress = cpuProgressRef.current;
      const currentPlayerSpeed = playerSpeedRef.current;
      const currentCpuSpeed = cpuSpeedRef.current;

      const pZTarget = (currentPlayerProgress / 100) * FINISH_Z;
      const cZTarget = (currentCpuProgress / 100) * FINISH_Z;
      const posLerp = 1 - Math.exp(-dt * 14);
      const speedLerp = 1 - Math.exp(-dt * 10);
      pZRender += (pZTarget - pZRender) * posLerp;
      cZRender += (cZTarget - cZRender) * posLerp;
      pSpeedRender += (currentPlayerSpeed - pSpeedRender) * speedLerp;
      cSpeedRender += (currentCpuSpeed - cSpeedRender) * speedLerp;
      const t = elapsedTime;

      // Player car movement
      const pWobX = Math.sin(t * 9) * 0.02;
      const pBobY = Math.abs(Math.sin(t * 14)) * 0.023;
      pMesh.position.set(PLAYER_LANE_X + pWobX, pBobY, pZRender);
      pMesh.rotation.y = Math.sin(t * 6) * 0.016;
      pMesh.rotation.z = Math.sin(t * 8) * 0.01;

      // CPU car movement
      cMesh.position.set(CPU_LANE_X + Math.sin(t * 8 + 1.3) * 0.013, Math.abs(Math.sin(t * 13 + 0.5)) * 0.023, cZRender);
      cMesh.rotation.y = Math.sin(t * 5) * 0.012;

      // Wheel rotation
      wRot += pSpeedRender * dt * 1.8;
      pMesh.userData.wheels.forEach((w) => (w.rotation.x = wRot));
      if (pSpeedRender > 0) {
        const cWR = wRot * (cSpeedRender / Math.max(0.1, pSpeedRender));
        cMesh.userData.wheels.forEach((w) => (w.rotation.x = cWR));
      }

      // Glow pulse
      pMesh.userData.glowMat.emissiveIntensity = 0.22 + Math.sin(t * 8) * 0.08;

      // Camera follow
      const camTY = 5;
      const camTZ = pZRender - 6;
      camera.position.x += (0 - camera.position.x) * 0.06;
      camera.position.y += (camTY - camera.position.y) * 0.045;
      camera.position.z += (camTZ - camera.position.z) * 0.1;
      camera.lookAt(0, 0.7, pZRender + 9.5);

      renderer.render(scene, camera);
    }

    animate();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafId);
      renderer.dispose();
    };
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height: "360px", background: "#1b3e58", borderRadius: "12px", overflow: "hidden" }} />;
}
