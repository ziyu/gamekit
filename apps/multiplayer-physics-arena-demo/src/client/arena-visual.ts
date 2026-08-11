import type { ThreeRendererNative } from "@gamekit/driver-three";
import type {
  PhysicsBodyState,
  PhysicsPredictionIslandMemberDefinition,
  PhysicsPredictionIslandStateSnapshot,
  PhysicsRotation
} from "@gamekit/physics-core";
import * as THREE from "three";

import { ARENA_ENVIRONMENT, arenaMemberRole } from "../shared/arena-definition";
import type { ArenaEffectPresentationEvent } from "./arena-effects";

export type ArenaVisual = {
  update(
    state: PhysicsPredictionIslandStateSnapshot | undefined,
    localMemberId?: string,
    deltaMs?: number
  ): void;
  effect(event: ArenaEffectPresentationEvent): void;
  destroy(): void;
};

type MemberVisual = {
  root: THREE.Group;
  model: THREE.Group;
  role: ReturnType<typeof arenaMemberRole>;
  glowMaterials: THREE.MeshStandardMaterial[];
  limbs: THREE.Object3D[];
  localRing?: THREE.Mesh | undefined;
  marker?: THREE.Group | undefined;
  initialized: boolean;
};

type FxParticle = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
};

type ArenaFx = {
  effectId: string;
  root: THREE.Group;
  ageMs: number;
  durationMs: number;
  particles: FxParticle[];
};

const UNIT = 32;
const CAMERA_IDLE_POSITION = new THREE.Vector3(0, 8.4 * UNIT, 14.5 * UNIT);
const CAMERA_IDLE_TARGET = new THREE.Vector3(0, 0.8 * UNIT, -3.8 * UNIT);
const COLOR = {
  ink: 0x071225,
  midnight: 0x0b1834,
  track: 0x17345b,
  trackTop: 0x24507a,
  cyan: 0x44e6ff,
  acid: 0xc8ff45,
  coral: 0xff5b55,
  sun: 0xffcf4b,
  violet: 0x8b78ff,
  white: 0xf5f7ff
} as const;

export function createArenaVisual(
  native: ThreeRendererNative,
  definitions: ReadonlyMap<string, PhysicsPredictionIslandMemberDefinition>
): ArenaVisual {
  const root = new THREE.Group();
  root.name = "knockout-circuit.root";
  const members = new Map<string, MemberVisual>();
  const effects: ArenaFx[] = [];
  const camera = new THREE.PerspectiveCamera(54, 16 / 9, 0.5, 5_000);
  const cameraTarget = CAMERA_IDLE_TARGET.clone();
  let localVisual: MemberVisual | undefined;
  let cameraShake = 0;
  let elapsedMs = 0;

  setupScene(native, root);
  createCourse(root);
  native.scene.add(root, camera);
  camera.position.copy(CAMERA_IDLE_POSITION);
  camera.lookAt(cameraTarget);
  configureRenderer(native.renderer);

  return {
    update(state, localMemberId, deltaMs = 1000 / 60) {
      const safeDeltaMs = Math.min(50, Math.max(0, deltaMs));
      elapsedMs += safeDeltaMs;
      localVisual = undefined;
      if (state) {
        const retained = new Set<string>();
        for (const member of state.members) {
          const definition = definitions.get(member.id);
          if (!definition) continue;
          retained.add(member.id);
          const visual = ensureMemberMesh(root, members, definition);
          const local = member.id === localMemberId;
          updateMemberVisual(visual, member.body, state.tick, safeDeltaMs, local);
          setLocalPresentation(visual, local);
          if (local) localVisual = visual;
        }
        for (const [id, visual] of members) {
          if (retained.has(id)) continue;
          visual.root.removeFromParent();
          disposeObject(visual.root);
          members.delete(id);
        }
      }
      updateEffects(effects, safeDeltaMs);
      cameraShake = Math.max(0, cameraShake - safeDeltaMs * 0.0018 * UNIT);
      updateCamera(camera, cameraTarget, localVisual, safeDeltaMs, elapsedMs, cameraShake);
      renderScene(native, camera);
    },
    effect(event) {
      const existingIndex = effects.findIndex((effect) => effect.effectId === event.effectId);
      if (existingIndex >= 0) removeEffect(effects, existingIndex);
      if (event.phase === "cancel") return;
      const origin = localVisual?.root.position ?? cameraTarget;
      effects.push(createEffect(root, event, origin));
      if (event.kind === "contact" && event.phase === "confirm") {
        cameraShake = Math.max(cameraShake, 0.22 * UNIT);
      } else if (event.kind === "jump" && event.phase === "confirm") {
        cameraShake = Math.max(cameraShake, 0.07 * UNIT);
      }
    },
    destroy() {
      camera.removeFromParent();
      root.removeFromParent();
      disposeObject(root);
      members.clear();
      effects.length = 0;
    }
  };
}

function setupScene(native: ThreeRendererNative, root: THREE.Group): void {
  native.scene.background = new THREE.Color(COLOR.ink);
  native.scene.fog = new THREE.Fog(COLOR.ink, 16 * UNIT, 54 * UNIT);

  const hemisphere = new THREE.HemisphereLight(0xb9ecff, 0x10172c, 2.4);
  const key = new THREE.DirectionalLight(0xfff0dc, 4.5);
  key.position.set(-10 * UNIT, 18 * UNIT, 12 * UNIT);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -18 * UNIT;
  key.shadow.camera.right = 18 * UNIT;
  key.shadow.camera.top = 20 * UNIT;
  key.shadow.camera.bottom = -20 * UNIT;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 70 * UNIT;

  const cyanRim = new THREE.PointLight(COLOR.cyan, 120, 32 * UNIT, 1.5);
  cyanRim.position.set(-11 * UNIT, 6 * UNIT, -5 * UNIT);
  const coralRim = new THREE.PointLight(COLOR.coral, 105, 30 * UNIT, 1.5);
  coralRim.position.set(11 * UNIT, 5 * UNIT, -10 * UNIT);
  root.add(hemisphere, key, cyanRim, coralRim);

  createSkyParticles(root);
  createBroadcastRings(root);
}

function createCourse(root: THREE.Group): void {
  const course = new THREE.Group();
  course.name = "knockout.course";
  root.add(course);

  const voidDeck = createMesh(
    new THREE.CylinderGeometry(18 * UNIT, 21 * UNIT, 1.2 * UNIT, 48),
    new THREE.MeshStandardMaterial({
      color: 0x09162d,
      roughness: 0.55,
      metalness: 0.45
    }),
    "knockout.course.void-deck"
  );
  voidDeck.position.set(0, -2.4 * UNIT, -2.5 * UNIT);
  course.add(voidDeck);

  for (const body of ARENA_ENVIRONMENT.bodies ?? []) {
    const bodyId = body.id;
    if (!bodyId) continue;
    const collider = (ARENA_ENVIRONMENT.colliders ?? []).find(
      (candidate) => candidate.bodyId === bodyId
    );
    if (!collider || collider.shape.type !== "box") continue;
    const role = bodyId === "course.finish" ? "finish" : bodyId.includes("ramp") ? "ramp" : "floor";
    const material = new THREE.MeshPhysicalMaterial({
      color: role === "finish" ? 0x23607b : role === "ramp" ? 0x304a78 : COLOR.track,
      roughness: 0.38,
      metalness: 0.26,
      clearcoat: 0.35,
      clearcoatRoughness: 0.5
    });
    const mesh = createMesh(
      new THREE.BoxGeometry(
        collider.shape.width * UNIT,
        collider.shape.height * UNIT,
        (collider.shape.depth ?? 1) * UNIT
      ),
      material,
      `knockout.${bodyId}`
    );
    applyTransform(mesh, body.position ?? { x: 0, y: 0, z: 0 }, body.rotation);
    course.add(mesh);
  }

  const trackSurface = createMesh(
    new THREE.PlaneGeometry(20.4 * UNIT, 24.4 * UNIT),
    new THREE.MeshPhysicalMaterial({
      color: COLOR.trackTop,
      roughness: 0.46,
      metalness: 0.18,
      clearcoat: 0.3
    }),
    "knockout.course.track-surface"
  );
  trackSurface.rotation.x = -Math.PI / 2;
  trackSurface.position.y = 0.02 * UNIT;
  course.add(trackSurface);

  createEdgeLights(course);
  createLaneGraphics(course);
  createStartGrid(course);
  createFinishPortal(course);
  createSpectatorPods(course);
}

function ensureMemberMesh(
  root: THREE.Group,
  members: Map<string, MemberVisual>,
  definition: PhysicsPredictionIslandMemberDefinition
): MemberVisual {
  const existing = members.get(definition.id);
  if (existing) return existing;

  const role = arenaMemberRole(definition.id);
  const visual =
    role === "player" || role === "bot"
      ? createRunnerVisual(definition.id, role)
      : role === "sweeper"
        ? createSweeperVisual(definition)
        : role === "platform"
          ? createPlatformVisual(definition)
          : createPropVisual(definition);
  visual.root.name = `knockout.${definition.id}`;
  root.add(visual.root);
  members.set(definition.id, visual);
  return visual;
}

function applyTransform(
  target: THREE.Object3D,
  position: { x: number; y: number; z?: number },
  rotation?: PhysicsRotation,
  alpha = 1
): void {
  const desiredPosition = new THREE.Vector3(
    position.x * UNIT,
    position.y * UNIT,
    (position.z ?? 0) * UNIT
  );
  if (alpha >= 1) target.position.copy(desiredPosition);
  else target.position.lerp(desiredPosition, alpha);

  if (rotation === undefined) return;
  const desiredRotation = new THREE.Quaternion();
  if (typeof rotation === "number") {
    desiredRotation.setFromEuler(new THREE.Euler(0, 0, rotation));
  } else if ("w" in rotation) {
    desiredRotation.set(rotation.x, rotation.y, rotation.z, rotation.w);
  } else {
    desiredRotation.setFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z ?? 0));
  }
  if (alpha >= 1) target.quaternion.copy(desiredRotation);
  else target.quaternion.slerp(desiredRotation, alpha);
}

function colorForRole(role: ReturnType<typeof arenaMemberRole>, id: string): number {
  if (role === "player") return id.endsWith("0") ? COLOR.coral : COLOR.cyan;
  if (role === "bot") {
    const palette = [COLOR.sun, COLOR.violet, 0x63e6a4, 0xff8ac5, 0xff9851, 0x73a8ff];
    return palette[Number(id.split(".").at(-1) ?? 0) % palette.length] ?? COLOR.sun;
  }
  if (role === "sweeper") return COLOR.coral;
  if (role === "platform") return COLOR.violet;
  return id.includes("ball") ? COLOR.acid : COLOR.white;
}

function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) material.dispose();
}

function configureRenderer(renderer: THREE.WebGLRenderer | undefined): void {
  if (!renderer) return;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
}

function createMesh<TMaterial extends THREE.Material>(
  geometry: THREE.BufferGeometry,
  material: TMaterial,
  name: string
): THREE.Mesh<THREE.BufferGeometry, TMaterial> {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createRunnerVisual(id: string, role: "player" | "bot"): MemberVisual {
  const root = new THREE.Group();
  const model = new THREE.Group();
  model.name = `${id}.runner-model`;
  root.add(model);

  const color = colorForRole(role, id);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.3,
    metalness: 0.06,
    emissive: color,
    emissiveIntensity: 0.06
  });
  const body = createMesh(
    new THREE.CapsuleGeometry(0.5 * UNIT, 0.72 * UNIT, 10, 20),
    bodyMaterial,
    `${id}.chassis`
  );
  body.scale.set(1, 1.02, 0.9);
  model.add(body);

  const belly = createMesh(
    new THREE.SphereGeometry(0.39 * UNIT, 20, 12),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).lerp(new THREE.Color(COLOR.white), 0.3),
      roughness: 0.4,
      metalness: 0.02
    }),
    `${id}.belly`
  );
  belly.scale.set(0.95, 0.82, 0.18);
  belly.position.set(0, -0.08 * UNIT, -0.44 * UNIT);
  model.add(belly);

  const visorMaterial = new THREE.MeshStandardMaterial({
    color: 0x07111f,
    roughness: 0.12,
    metalness: 0.82,
    emissive: role === "player" ? COLOR.cyan : 0x4385a4,
    emissiveIntensity: role === "player" ? 0.55 : 0.22
  });
  const visor = createMesh(
    new THREE.SphereGeometry(0.36 * UNIT, 24, 12),
    visorMaterial,
    `${id}.visor`
  );
  visor.scale.set(1.18, 0.54, 0.18);
  visor.position.set(0, 0.3 * UNIT, -0.48 * UNIT);
  model.add(visor);

  const eyeMaterial = new THREE.MeshBasicMaterial({ color: COLOR.white });
  for (const x of [-0.11, 0.11]) {
    const eye = createMesh(
      new THREE.SphereGeometry(0.035 * UNIT, 10, 8),
      eyeMaterial.clone(),
      `${id}.eye`
    );
    eye.position.set(x * UNIT, 0.31 * UNIT, -0.575 * UNIT);
    model.add(eye);
  }

  const limbMaterial = bodyMaterial.clone();
  limbMaterial.color.offsetHSL(0, -0.05, -0.08);
  const limbs: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const arm = createMesh(
      new THREE.CapsuleGeometry(0.12 * UNIT, 0.22 * UNIT, 5, 10),
      limbMaterial.clone(),
      `${id}.arm`
    );
    arm.position.set(side * 0.56 * UNIT, -0.04 * UNIT, 0);
    arm.rotation.z = side * -0.28;
    model.add(arm);
    limbs.push(arm);

    const foot = createMesh(
      new THREE.SphereGeometry(0.19 * UNIT, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0x10182a, roughness: 0.5, metalness: 0.2 }),
      `${id}.foot`
    );
    foot.scale.set(1, 0.72, 1.35);
    foot.position.set(side * 0.26 * UNIT, -0.86 * UNIT, -0.08 * UNIT);
    model.add(foot);
    limbs.push(foot);
  }

  const localRing = createMesh(
    new THREE.TorusGeometry(0.82 * UNIT, 0.045 * UNIT, 8, 40),
    new THREE.MeshBasicMaterial({ color: COLOR.acid, transparent: true, opacity: 0.82 }),
    `${id}.local-ring`
  );
  localRing.rotation.x = Math.PI / 2;
  localRing.position.y = -0.92 * UNIT;
  localRing.visible = false;
  root.add(localRing);

  const marker = createLocalMarker(id);
  marker.visible = false;
  root.add(marker);

  return {
    root,
    model,
    role,
    glowMaterials: [bodyMaterial, visorMaterial],
    limbs,
    localRing,
    marker,
    initialized: false
  };
}

function createLocalMarker(id: string): THREE.Group {
  const marker = new THREE.Group();
  marker.name = `${id}.local-marker`;
  marker.position.y = 1.55 * UNIT;
  const diamond = createMesh(
    new THREE.OctahedronGeometry(0.16 * UNIT, 0),
    new THREE.MeshBasicMaterial({ color: COLOR.acid }),
    `${id}.marker-diamond`
  );
  const halo = createMesh(
    new THREE.TorusGeometry(0.23 * UNIT, 0.025 * UNIT, 6, 24),
    new THREE.MeshBasicMaterial({ color: COLOR.white, transparent: true, opacity: 0.72 }),
    `${id}.marker-halo`
  );
  halo.rotation.x = Math.PI / 2;
  marker.add(diamond, halo);
  return marker;
}

function createSweeperVisual(definition: PhysicsPredictionIslandMemberDefinition): MemberVisual {
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);
  const shape = definition.colliders?.[0]?.shape;
  const width = shape?.type === "box" ? shape.width : 13;
  const height = shape?.type === "box" ? shape.height : 0.55;
  const depth = shape?.type === "box" ? (shape.depth ?? 0.55) : 0.55;
  const material = new THREE.MeshStandardMaterial({
    color: COLOR.coral,
    roughness: 0.24,
    metalness: 0.48,
    emissive: COLOR.coral,
    emissiveIntensity: 0.18
  });
  const bar = createMesh(
    new THREE.BoxGeometry(width * UNIT, height * UNIT, depth * UNIT),
    material,
    `${definition.id}.bar`
  );
  model.add(bar);
  for (let index = -5; index <= 5; index += 1) {
    const stripe = createMesh(
      new THREE.BoxGeometry(0.35 * UNIT, (height + 0.03) * UNIT, (depth + 0.035) * UNIT),
      new THREE.MeshBasicMaterial({ color: index % 2 === 0 ? COLOR.sun : 0x17152c }),
      `${definition.id}.stripe`
    );
    stripe.position.x = index * 1.05 * UNIT;
    stripe.rotation.z = 0.34;
    model.add(stripe);
  }
  const hub = createMesh(
    new THREE.CylinderGeometry(0.72 * UNIT, 0.86 * UNIT, 1.35 * UNIT, 24),
    new THREE.MeshStandardMaterial({
      color: 0x172040,
      roughness: 0.3,
      metalness: 0.65,
      emissive: COLOR.cyan,
      emissiveIntensity: 0.3
    }),
    `${definition.id}.hub`
  );
  hub.position.y = 0.36 * UNIT;
  model.add(hub);
  return {
    root,
    model,
    role: "sweeper",
    glowMaterials: [material],
    limbs: [],
    initialized: false
  };
}

function createPlatformVisual(definition: PhysicsPredictionIslandMemberDefinition): MemberVisual {
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);
  const shape = definition.colliders?.[0]?.shape;
  const width = shape?.type === "box" ? shape.width : 4;
  const height = shape?.type === "box" ? shape.height : 0.55;
  const depth = shape?.type === "box" ? (shape.depth ?? 3.2) : 3.2;
  const material = new THREE.MeshStandardMaterial({
    color: COLOR.violet,
    roughness: 0.3,
    metalness: 0.42,
    emissive: COLOR.violet,
    emissiveIntensity: 0.12
  });
  const deck = createMesh(
    new THREE.BoxGeometry(width * UNIT, height * UNIT, depth * UNIT),
    material,
    `${definition.id}.deck`
  );
  model.add(deck);
  for (const x of [-0.34, 0, 0.34]) {
    const strip = createMesh(
      new THREE.BoxGeometry(0.07 * UNIT, 0.025 * UNIT, depth * 0.82 * UNIT),
      new THREE.MeshBasicMaterial({ color: x === 0 ? COLOR.white : COLOR.cyan }),
      `${definition.id}.light-strip`
    );
    strip.position.set(x * width * UNIT, (height / 2 + 0.02) * UNIT, 0);
    model.add(strip);
  }
  return {
    root,
    model,
    role: "platform",
    glowMaterials: [material],
    limbs: [],
    initialized: false
  };
}

function createPropVisual(definition: PhysicsPredictionIslandMemberDefinition): MemberVisual {
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);
  const shape = definition.colliders?.[0]?.shape;
  const color = colorForRole("prop", definition.id);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: definition.id.includes("ball") ? 0.24 : 0.38,
    metalness: 0.18,
    emissive: color,
    emissiveIntensity: 0.08
  });
  let geometry: THREE.BufferGeometry;
  if (shape?.type === "sphere") {
    geometry = new THREE.SphereGeometry(shape.radius * UNIT, 32, 20);
  } else if (shape?.type === "box") {
    geometry = new THREE.BoxGeometry(
      shape.width * UNIT,
      shape.height * UNIT,
      (shape.depth ?? 1) * UNIT,
      2,
      2,
      2
    );
  } else {
    geometry = new THREE.DodecahedronGeometry(0.7 * UNIT, 1);
  }
  const prop = createMesh(geometry, material, `${definition.id}.body`);
  model.add(prop);

  if (shape?.type === "sphere") {
    for (const rotation of [0, Math.PI / 2]) {
      const ring = createMesh(
        new THREE.TorusGeometry(shape.radius * 1.02 * UNIT, 0.045 * UNIT, 8, 40),
        new THREE.MeshBasicMaterial({ color: COLOR.ink }),
        `${definition.id}.ring`
      );
      ring.rotation.x = rotation;
      model.add(ring);
    }
  } else {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: COLOR.ink, transparent: true, opacity: 0.7 })
    );
    edges.name = `${definition.id}.edges`;
    model.add(edges);
  }
  return {
    root,
    model,
    role: "prop",
    glowMaterials: [material],
    limbs: [],
    initialized: false
  };
}

function updateMemberVisual(
  visual: MemberVisual,
  body: PhysicsBodyState,
  tick: number,
  deltaMs: number,
  local: boolean
): void {
  const alpha = visual.initialized ? 1 - Math.exp(-deltaMs / (local ? 38 : 72)) : 1;
  const actor = visual.role === "player" || visual.role === "bot";
  // Rapier yaw belongs to the collision capsule. Runner facing is presentation state derived from
  // horizontal velocity; applying both rotations would make every contact yaw the model twice.
  applyTransform(visual.root, body.position, actor ? undefined : body.rotation, alpha);
  visual.initialized = true;
  if (!actor) return;

  const velocity = body.linearVelocity;
  const horizontalSpeed = Math.hypot(velocity.x, velocity.z ?? 0);
  const stride = Math.min(1, horizontalSpeed / 6.4);
  if (horizontalSpeed > 0.12) {
    const targetYaw = Math.atan2(-velocity.x, -(velocity.z ?? 0));
    visual.root.rotation.y = lerpAngle(visual.root.rotation.y, targetYaw, alpha * 0.7);
  }
  const step = tick * 0.42;
  visual.model.position.y = Math.abs(Math.sin(step)) * stride * 0.055 * UNIT;
  visual.model.rotation.x = THREE.MathUtils.lerp(
    visual.model.rotation.x,
    Math.min(0.18, stride * 0.14),
    alpha
  );
  for (const [index, limb] of visual.limbs.entries()) {
    const side = index % 2 === 0 ? 1 : -1;
    limb.rotation.x = Math.sin(step + (side * Math.PI) / 2) * stride * 0.42;
  }
  if (visual.localRing) visual.localRing.rotation.z = tick * 0.035;
  if (visual.marker) {
    visual.marker.position.y = (1.55 + Math.sin(tick * 0.08) * 0.08) * UNIT;
    visual.marker.rotation.y += deltaMs * 0.0024;
  }
}

function setLocalPresentation(visual: MemberVisual, local: boolean): void {
  if (visual.localRing) visual.localRing.visible = local;
  if (visual.marker) visual.marker.visible = local;
  for (const material of visual.glowMaterials) {
    material.emissiveIntensity = local ? 0.52 : visual.role === "bot" ? 0.05 : 0.14;
  }
}

function updateCamera(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  local: MemberVisual | undefined,
  deltaMs: number,
  elapsedMs: number,
  shake: number
): void {
  const desiredPosition = CAMERA_IDLE_POSITION.clone();
  const desiredTarget = CAMERA_IDLE_TARGET.clone();
  if (local) {
    desiredPosition.set(
      local.root.position.x,
      local.root.position.y + 5.2 * UNIT,
      local.root.position.z + 8.8 * UNIT
    );
    desiredTarget.set(
      local.root.position.x,
      local.root.position.y + 0.55 * UNIT,
      local.root.position.z - 4.8 * UNIT
    );
  }
  const alpha = 1 - Math.exp(-deltaMs / 190);
  camera.position.lerp(desiredPosition, camera.position.lengthSq() === 0 ? 1 : alpha);
  target.lerp(desiredTarget, alpha * 1.3);
  if (shake > 0) {
    camera.position.x += Math.sin(elapsedMs * 0.052) * shake;
    camera.position.y += Math.cos(elapsedMs * 0.041) * shake * 0.5;
  }
  camera.lookAt(target);
}

function renderScene(native: ThreeRendererNative, camera: THREE.PerspectiveCamera): void {
  const canvas = native.renderer?.domElement;
  const width = canvas?.clientWidth || canvas?.width || 1280;
  const height = canvas?.clientHeight || canvas?.height || 720;
  const nextAspect = width / Math.max(1, height);
  if (Math.abs(camera.aspect - nextAspect) > 0.001) {
    camera.aspect = nextAspect;
    camera.updateProjectionMatrix();
  }
  if (native.renderer) native.renderer.render(native.scene, camera);
  else native.render();
}

function createEffect(
  parent: THREE.Group,
  event: ArenaEffectPresentationEvent,
  origin: THREE.Vector3
): ArenaFx {
  const root = new THREE.Group();
  root.name = `knockout.fx.${event.kind}.${event.phase}`;
  root.position.copy(origin);
  const particles: FxParticle[] = [];
  const confirmed = event.phase === "confirm" || event.phase === "replace";
  const color = event.kind === "jump" ? COLOR.cyan : confirmed ? COLOR.sun : COLOR.coral;
  const ring = createMesh(
    new THREE.TorusGeometry((event.kind === "jump" ? 0.62 : 0.38) * UNIT, 0.045 * UNIT, 8, 36),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: confirmed ? 0.92 : 0.62 }),
    `${root.name}.ring`
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = event.kind === "jump" ? -0.72 * UNIT : 0;
  root.add(ring);

  const particleCount = event.kind === "jump" ? 8 : confirmed ? 16 : 9;
  for (let index = 0; index < particleCount; index += 1) {
    const angle = (index / particleCount) * Math.PI * 2;
    const particle = createMesh(
      new THREE.OctahedronGeometry((confirmed ? 0.055 : 0.035) * UNIT, 0),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }),
      `${root.name}.particle`
    );
    root.add(particle);
    particles.push({
      mesh: particle,
      velocity: new THREE.Vector3(
        Math.cos(angle) * (confirmed ? 2.9 : 1.8) * UNIT,
        (event.kind === "jump" ? 2.4 : 1.2 + (index % 3) * 0.45) * UNIT,
        Math.sin(angle) * (confirmed ? 2.9 : 1.8) * UNIT
      )
    });
  }
  parent.add(root);
  return {
    effectId: event.effectId,
    root,
    ageMs: 0,
    durationMs: event.kind === "jump" ? 620 : 480,
    particles
  };
}

function updateEffects(effects: ArenaFx[], deltaMs: number): void {
  const deltaSeconds = deltaMs / 1000;
  for (let index = effects.length - 1; index >= 0; index -= 1) {
    const effect = effects[index];
    if (!effect) continue;
    effect.ageMs += deltaMs;
    const progress = Math.min(1, effect.ageMs / effect.durationMs);
    effect.root.scale.setScalar(1 + progress * 1.4);
    for (const particle of effect.particles) {
      particle.mesh.position.addScaledVector(particle.velocity, deltaSeconds);
      particle.velocity.y -= 6.5 * UNIT * deltaSeconds;
      particle.mesh.rotation.x += deltaSeconds * 5;
      particle.mesh.rotation.y += deltaSeconds * 7;
    }
    effect.root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if ("opacity" in material) material.opacity = (1 - progress) ** 1.5;
      }
    });
    if (progress < 1) continue;
    removeEffect(effects, index);
  }
}

function removeEffect(effects: ArenaFx[], index: number): void {
  const effect = effects[index];
  if (!effect) return;
  effect.root.removeFromParent();
  disposeObject(effect.root);
  effects.splice(index, 1);
}

function createEdgeLights(course: THREE.Group): void {
  const material = new THREE.MeshBasicMaterial({ color: COLOR.cyan });
  for (const x of [-10.34, 10.34]) {
    const edge = createMesh(
      new THREE.BoxGeometry(0.08 * UNIT, 0.025 * UNIT, 24.2 * UNIT),
      material.clone(),
      "knockout.course.edge-light"
    );
    edge.position.set(x * UNIT, 0.055 * UNIT, 0);
    course.add(edge);
  }
  for (const z of [-12.1, 12.1]) {
    const edge = createMesh(
      new THREE.BoxGeometry(20.7 * UNIT, 0.025 * UNIT, 0.08 * UNIT),
      new THREE.MeshBasicMaterial({ color: z < 0 ? COLOR.coral : COLOR.acid }),
      "knockout.course.end-light"
    );
    edge.position.set(0, 0.055 * UNIT, z * UNIT);
    course.add(edge);
  }
}

function createLaneGraphics(course: THREE.Group): void {
  for (const x of [-5.2, 0, 5.2]) {
    const lane = createMesh(
      new THREE.BoxGeometry(0.035 * UNIT, 0.018 * UNIT, 21.5 * UNIT),
      new THREE.MeshBasicMaterial({ color: 0x6d9bbd, transparent: true, opacity: 0.22 }),
      "knockout.course.lane"
    );
    lane.position.set(x * UNIT, 0.065 * UNIT, 0.4 * UNIT);
    course.add(lane);
  }
  for (const z of [7.2, 3.2, -5.1, -9.1]) {
    for (const x of [-2.4, 2.4]) {
      for (const side of [-1, 1]) {
        const slash = createMesh(
          new THREE.BoxGeometry(0.18 * UNIT, 0.022 * UNIT, 1.25 * UNIT),
          new THREE.MeshBasicMaterial({ color: COLOR.white, transparent: true, opacity: 0.45 }),
          "knockout.course.chevron"
        );
        slash.position.set((x + side * 0.38) * UNIT, 0.075 * UNIT, z * UNIT);
        slash.rotation.y = side * 0.52;
        course.add(slash);
      }
    }
  }
}

function createStartGrid(course: THREE.Group): void {
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const tile = createMesh(
        new THREE.BoxGeometry(1.1 * UNIT, 0.025 * UNIT, 0.72 * UNIT),
        new THREE.MeshBasicMaterial({
          color: (row + column) % 2 === 0 ? COLOR.white : COLOR.ink,
          transparent: true,
          opacity: 0.68
        }),
        "knockout.course.start-tile"
      );
      tile.position.set((column - 3.5) * 1.1 * UNIT, 0.08 * UNIT, (6.9 + row * 0.72) * UNIT);
      course.add(tile);
    }
  }
}

function createFinishPortal(course: THREE.Group): void {
  const material = new THREE.MeshStandardMaterial({
    color: 0x15294d,
    roughness: 0.26,
    metalness: 0.66,
    emissive: COLOR.coral,
    emissiveIntensity: 0.22
  });
  for (const x of [-4.45, 4.45]) {
    const column = createMesh(
      new THREE.BoxGeometry(0.55 * UNIT, 5.5 * UNIT, 0.65 * UNIT),
      material.clone(),
      "knockout.course.finish-column"
    );
    column.position.set(x * UNIT, 3.35 * UNIT, -11.6 * UNIT);
    course.add(column);
  }
  const header = createMesh(
    new THREE.BoxGeometry(9.45 * UNIT, 0.72 * UNIT, 0.75 * UNIT),
    material,
    "knockout.course.finish-header"
  );
  header.position.set(0, 6.05 * UNIT, -11.6 * UNIT);
  course.add(header);
  for (let index = 0; index < 9; index += 1) {
    const lamp = createMesh(
      new THREE.SphereGeometry(0.09 * UNIT, 10, 8),
      new THREE.MeshBasicMaterial({ color: index % 2 === 0 ? COLOR.cyan : COLOR.coral }),
      "knockout.course.finish-lamp"
    );
    lamp.position.set((index - 4) * UNIT, 6.05 * UNIT, -11.98 * UNIT);
    course.add(lamp);
  }
}

function createSpectatorPods(course: THREE.Group): void {
  for (const side of [-1, 1]) {
    for (let index = 0; index < 5; index += 1) {
      const pod = new THREE.Group();
      pod.name = "knockout.course.spectator-pod";
      pod.position.set(
        side * (13.5 + (index % 2) * 1.4) * UNIT,
        (2.1 + index * 0.38) * UNIT,
        (8 - index * 5.1) * UNIT
      );
      const base = createMesh(
        new THREE.CylinderGeometry(0.8 * UNIT, 1.05 * UNIT, 0.38 * UNIT, 16),
        new THREE.MeshStandardMaterial({ color: 0x16274a, roughness: 0.35, metalness: 0.48 }),
        "knockout.course.pod-base"
      );
      const light = createMesh(
        new THREE.CylinderGeometry(0.5 * UNIT, 0.5 * UNIT, 0.08 * UNIT, 16),
        new THREE.MeshBasicMaterial({ color: index % 2 === 0 ? COLOR.cyan : COLOR.coral }),
        "knockout.course.pod-light"
      );
      light.position.y = 0.22 * UNIT;
      pod.add(base, light);
      course.add(pod);
    }
  }
}

function createSkyParticles(root: THREE.Group): void {
  const count = 220;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const angle = pseudoRandom(index * 3) * Math.PI * 2;
    const radius = (18 + pseudoRandom(index * 3 + 1) * 30) * UNIT;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = (4 + pseudoRandom(index * 3 + 2) * 24) * UNIT;
    positions[index * 3 + 2] = Math.sin(angle) * radius - 6 * UNIT;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xa8dfff,
      size: 0.075 * UNIT,
      transparent: true,
      opacity: 0.62,
      sizeAttenuation: true
    })
  );
  points.name = "knockout.sky-particles";
  root.add(points);
}

function createBroadcastRings(root: THREE.Group): void {
  for (const [index, color] of [COLOR.cyan, COLOR.coral, COLOR.violet].entries()) {
    const ring = createMesh(
      new THREE.TorusGeometry((9 + index * 2.8) * UNIT, 0.045 * UNIT, 6, 72),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16 - index * 0.03 }),
      "knockout.broadcast-ring"
    );
    ring.position.set((index - 1) * 5 * UNIT, (8 + index * 2.2) * UNIT, (-27 - index * 4) * UNIT);
    ring.rotation.z = index * 0.4;
    root.add(ring);
  }
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      disposeMesh(child);
      return;
    }
    if (child instanceof THREE.LineSegments || child instanceof THREE.Points) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material.dispose();
    }
  });
}

function lerpAngle(current: number, target: number, alpha: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * Math.min(1, alpha);
}

function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 91.371 + 17.73) * 43_758.5453;
  return value - Math.floor(value);
}
