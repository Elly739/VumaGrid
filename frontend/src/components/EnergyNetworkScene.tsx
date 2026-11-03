"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type EnergyNetworkSceneProps = {
  solarKw: number;
  gridKw: number;
  batteryChargeKw: number;
  batteryDischargeKw: number;
  evKw: number;
  heatPumpKw: number;
  gridOnline: boolean;
};

type FlowState = EnergyNetworkSceneProps;
type AnimatedRoute = {
  curve: THREE.CatmullRomCurve3;
  material: THREE.MeshStandardMaterial;
  pulses: Array<{ mesh: THREE.Mesh; offset: number }>;
  flow: "gridKw" | "solarKw" | "battery" | "evKw" | "heatPumpKw";
  reverseWhenCharging?: boolean;
};

function makeBox(
  scene: THREE.Scene,
  dimensions: [number, number, number],
  position: [number, number, number],
  color: number,
  options: { roughness?: number; metalness?: number; emissive?: number } = {},
) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.72,
    metalness: options.metalness ?? 0.12,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: 0.3,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

export default function EnergyNetworkScene(props: EnergyNetworkSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<FlowState>(props);
  flowRef.current = props;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      host.classList.add("scene-unavailable");
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x07121e, 22, 43);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
    camera.position.set(14, 12, 17);
    camera.lookAt(0, 1.1, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.enablePan = false;
    controls.minDistance = 13;
    controls.maxDistance = 42;
    controls.minPolarAngle = Math.PI * 0.2;
    controls.maxPolarAngle = Math.PI * 0.43;
    controls.target.set(0, 1.1, 0);

    scene.add(new THREE.HemisphereLight(0xb9e8ff, 0x111c25, 1.35));
    const keyLight = new THREE.DirectionalLight(0xffe6bd, 3.2);
    keyLight.position.set(-7, 14, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -15;
    keyLight.shadow.camera.right = 15;
    keyLight.shadow.camera.top = 15;
    keyLight.shadow.camera.bottom = -15;
    scene.add(keyLight);
    const coolFill = new THREE.PointLight(0x41b8e4, 44, 24);
    coolFill.position.set(8, 5, -2);
    scene.add(coolFill);
    const greenFill = new THREE.PointLight(0x36d2a0, 22, 18);
    greenFill.position.set(-6, 3, 4);
    scene.add(greenFill);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 28),
      new THREE.MeshStandardMaterial({ color: 0x0b1720, roughness: 0.94, metalness: 0.04 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.19;
    ground.receiveShadow = true;
    scene.add(ground);
    const sitePad = makeBox(scene, [17, 0.18, 12], [0, -0.08, 0], 0x17252b, { roughness: 0.9 });
    sitePad.receiveShadow = true;
    const road = makeBox(scene, [18, 0.035, 1.15], [0, 0.018, 5.8], 0x222c30, { roughness: 0.95 });
    road.castShadow = false;
    for (let markIndex = -7; markIndex <= 7; markIndex += 2) {
      makeBox(scene, [0.85, 0.012, 0.055], [markIndex, 0.042, 5.8], 0xa2a28a, { roughness: 1 });
    }

    // Low-rise industrial plant with service bays, clerestory windows and rooftop equipment.
    makeBox(scene, [6.8, 0.32, 4.9], [0, 0.2, 0.2], 0x53656a, { roughness: 0.8 });
    makeBox(scene, [6.1, 2.05, 4.25], [0, 1.36, 0], 0x8eaaa5, { roughness: 0.72 });
    makeBox(scene, [6.35, 0.2, 4.55], [0, 2.49, 0], 0x263e48, { roughness: 0.57, metalness: 0.24 });
    makeBox(scene, [6.5, 0.12, 4.75], [0, 2.61, 0], 0xc3d1c5, { roughness: 0.58, metalness: 0.12 });
    for (let windowIndex = -2; windowIndex <= 2; windowIndex += 1) {
      makeBox(scene, [0.72, 0.34, 0.055], [windowIndex * 1.05, 1.85, 2.14], 0x2d6872, { roughness: 0.28, metalness: 0.35, emissive: 0x0b2732 });
    }
    for (let bayIndex = -1; bayIndex <= 1; bayIndex += 1) {
      makeBox(scene, [1.32, 1.28, 0.075], [bayIndex * 1.8, 0.99, 2.18], 0x536c6d, { roughness: 0.66, metalness: 0.22 });
      makeBox(scene, [1.12, 0.07, 0.09], [bayIndex * 1.8, 1.6, 2.23], 0xb9c9b9, { roughness: 0.52 });
    }
    for (let unitIndex = 0; unitIndex < 3; unitIndex += 1) {
      const unit = makeBox(scene, [0.95, 0.42, 0.72], [-1.85 + unitIndex * 1.85, 2.9, -0.6], 0x52676b, { roughness: 0.67, metalness: 0.24 });
      for (let ventIndex = 0; ventIndex < 4; ventIndex += 1) {
        makeBox(scene, [0.035, 0.24, 0.58], [-2.17 + unitIndex * 1.85 + ventIndex * 0.19, 2.9, -0.22], 0x9cad9f, { roughness: 0.54, metalness: 0.32 });
      }
      unit.castShadow = true;
    }
    makeBox(scene, [0.54, 2.8, 0.54], [2.65, 3.9, -1.32], 0x798c87, { roughness: 0.72, metalness: 0.19 });
    makeBox(scene, [0.8, 0.16, 0.8], [2.65, 5.36, -1.32], 0x3a5157, { roughness: 0.67 });

    // Battery storage uses container-sized modules and visible access panels.
    for (let cabinetIndex = 0; cabinetIndex < 2; cabinetIndex += 1) {
      const cabinetX = -6.25 + cabinetIndex * 1.7;
      makeBox(scene, [1.42, 1.75, 2.05], [cabinetX, 0.98, 0.55], 0x859995, { roughness: 0.62, metalness: 0.26 });
      makeBox(scene, [1.46, 0.11, 2.09], [cabinetX, 1.9, 0.55], 0xb4c6b7, { roughness: 0.48, metalness: 0.28 });
      makeBox(scene, [0.9, 1.25, 0.055], [cabinetX, 0.98, 1.59], 0x526c70, { roughness: 0.58, metalness: 0.3 });
      for (let seamIndex = 0; seamIndex < 5; seamIndex += 1) {
        makeBox(scene, [0.035, 1.02, 0.025], [cabinetX - 0.37 + seamIndex * 0.18, 0.98, 1.63], 0x9baea5, { roughness: 0.48, metalness: 0.24 });
      }
      makeBox(scene, [0.24, 0.12, 0.04], [cabinetX + 0.47, 1.55, 1.64], 0x3dd4a4, { roughness: 0.28, emissive: 0x0d6849 });
    }

    // Four tilted PV tables, each assembled from framed glass modules.
    for (let tableIndex = 0; tableIndex < 2; tableIndex += 1) {
      const tableX = 5.65 + tableIndex * 2.0;
      for (let moduleIndex = 0; moduleIndex < 4; moduleIndex += 1) {
        const panel = makeBox(scene, [0.86, 0.085, 1.12], [tableX, 1.25, -1.1 + moduleIndex * 0.95], 0x17618a, { roughness: 0.28, metalness: 0.52, emissive: 0x08233a });
        panel.rotation.x = -0.22;
        makeBox(scene, [0.045, 0.48, 0.075], [tableX - 0.29, 0.79, -1.05 + moduleIndex * 0.95], 0x899b94, { roughness: 0.62, metalness: 0.32 });
        makeBox(scene, [0.045, 0.48, 0.075], [tableX + 0.29, 0.79, -1.05 + moduleIndex * 0.95], 0x899b94, { roughness: 0.62, metalness: 0.32 });
        panel.userData.pvModule = true;
      }
      makeBox(scene, [1.96, 0.075, 0.08], [tableX, 0.59, 0.28], 0x627a80, { roughness: 0.5, metalness: 0.42 });
    }

    // A compact distribution pole and crossarms represent the grid intertie.
    makeBox(scene, [0.18, 5.0, 0.18], [0, 2.5, -6.2], 0x677a73, { roughness: 0.76 });
    makeBox(scene, [2.5, 0.16, 0.16], [0, 4.35, -6.2], 0x8a9b91, { roughness: 0.62, metalness: 0.2 });
    makeBox(scene, [1.85, 0.13, 0.13], [0, 3.55, -6.2], 0x7d8f85, { roughness: 0.66, metalness: 0.18 });
    for (const insulatorX of [-0.95, 0, 0.95]) {
      const insulator = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.11, 0.38, 6),
        new THREE.MeshStandardMaterial({ color: 0x87a9a2, roughness: 0.38, metalness: 0.1 }),
      );
      insulator.position.set(insulatorX, 4.62, -6.2);
      scene.add(insulator);
    }

    // End-use equipment is intentionally smaller than the site bus.
    makeBox(scene, [0.55, 1.1, 0.42], [-6.4, 0.55, -3.4], 0x466775, { roughness: 0.52, metalness: 0.3 });
    makeBox(scene, [0.4, 0.12, 0.045], [-6.4, 0.55, -3.18], 0x50c8a9, { roughness: 0.3, emissive: 0x0d553f });
    makeBox(scene, [1.2, 0.9, 0.85], [6.3, 0.47, -3.4], 0x657d7c, { roughness: 0.73, metalness: 0.18 });
    const heatFan = new THREE.Mesh(
      new THREE.TorusGeometry(0.23, 0.035, 6, 14),
      new THREE.MeshStandardMaterial({ color: 0x8eaaa3, roughness: 0.5, metalness: 0.25 }),
    );
    heatFan.position.set(6.3, 0.5, -2.95);
    scene.add(heatFan);
    for (let bladeIndex = 0; bladeIndex < 4; bladeIndex += 1) {
      const blade = makeBox(scene, [0.06, 0.035, 0.38], [6.3, 0.5, -2.95], 0x77938e, { roughness: 0.5, metalness: 0.24 });
      blade.rotation.y = (bladeIndex * Math.PI) / 4;
      blade.userData.heatFanBlade = true;
    }

    const routeDefinitions: Array<{
      points: Array<[number, number, number]>;
      color: number;
      flow: AnimatedRoute["flow"];
      reverseWhenCharging?: boolean;
    }> = [
      { points: [[0, 4.5, -6.1], [0, 3.8, -4.7], [0.4, 2.1, -2.5], [0.1, 1.2, -1.5]], color: 0x58b8ee, flow: "gridKw" },
      { points: [[-5.8, 1.15, 0.5], [-4.3, 1.2, 0.4], [-2.9, 1.2, 0.1], [-1.9, 1.25, 0.05]], color: 0x40d8a5, flow: "battery", reverseWhenCharging: true },
      { points: [[5.5, 1.3, -0.2], [4.1, 1.3, -0.3], [2.9, 1.5, -0.2], [2.2, 1.55, -0.1]], color: 0xf2c35d, flow: "solarKw" },
      { points: [[-1.6, 0.8, 1.8], [-2.8, 0.7, 1.8], [-4.2, 0.6, 0.3], [-5.8, 0.5, -2.8]], color: 0xb782df, flow: "evKw" },
      { points: [[1.7, 0.8, 1.7], [3, 0.7, 1.8], [4.4, 0.6, 0], [5.9, 0.5, -2.9]], color: 0x78a9e8, flow: "heatPumpKw" },
    ];
    const animatedRoutes: AnimatedRoute[] = routeDefinitions.map((definition) => {
      const curve = new THREE.CatmullRomCurve3(definition.points.map((point) => new THREE.Vector3(...point)));
      const material = new THREE.MeshStandardMaterial({
        color: definition.color,
        emissive: definition.color,
        emissiveIntensity: 1.5,
        roughness: 0.34,
        transparent: true,
        opacity: 0.72,
      });
      const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.035, 6, false), material);
      cable.castShadow = false;
      scene.add(cable);
      const pulses = Array.from({ length: 3 }, (_, pulseIndex) => {
        const pulseMaterial = new THREE.MeshStandardMaterial({
          color: definition.color,
          emissive: definition.color,
          emissiveIntensity: 2.1,
        });
        const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), pulseMaterial);
        scene.add(pulse);
        return { mesh: pulse, offset: pulseIndex / 3 };
      });
      return { curve, material, pulses, flow: definition.flow, reverseWhenCharging: definition.reverseWhenCharging };
    });

    const resizeObserver = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      const aspect = host.clientWidth / host.clientHeight;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      const mobileFit = aspect < 0.7 ? 1.68 : aspect < 0.85 ? 1.38 : aspect < 1.2 ? 1.16 : 1;
      camera.position.copy(controls.target).add(new THREE.Vector3(14, 12, 17).multiplyScalar(mobileFit));
      controls.update();
      renderer.setSize(host.clientWidth, host.clientHeight, false);
    });
    resizeObserver.observe(host);
    camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight, false);

    let animationFrame = 0;
    const timer = new THREE.Timer();
    timer.connect(document);
    const animate = (timestamp = performance.now()) => {
      animationFrame = window.requestAnimationFrame(animate);
      timer.update(timestamp);
      const elapsed = timer.getElapsed();
      controls.update();
      for (const object of scene.children) {
        if (object.userData.heatFanBlade) object.rotation.y = elapsed * 1.3 + Number(object.userData.baseRotation || 0);
        if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial && object.userData.pvModule) {
          object.material.emissiveIntensity = 0.18 + (flowRef.current.solarKw > 0 ? 0.24 : 0.04);
        }
      }
      for (const route of animatedRoutes) {
        const state = flowRef.current;
        const routeFlow = route.flow === "battery"
          ? state.batteryChargeKw + state.batteryDischargeKw
          : state[route.flow];
        const connected = route.flow !== "gridKw" || state.gridOnline;
        const active = connected && routeFlow > 0.1;
        route.material.opacity = active ? 0.74 : 0.13;
        const reverse = route.reverseWhenCharging && state.batteryChargeKw > state.batteryDischargeKw;
        for (const pulse of route.pulses) {
          pulse.mesh.visible = active;
          if (!active) continue;
          const progress = (elapsed * 0.16 + pulse.offset) % 1;
          const safeProgress = Number.isFinite(progress) ? progress : 0;
          pulse.mesh.position.copy(route.curve.getPoint(reverse ? 1 - safeProgress : safeProgress));
        }
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      controls.dispose();
      timer.dispose();
      for (const object of scene.children) {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
          else object.material.dispose();
        }
      }
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className="energy-scene" aria-label="Interactive isometric microgrid campus" />;
}