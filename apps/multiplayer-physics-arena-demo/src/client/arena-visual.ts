import type { ThreeRendererNative } from "@gamekit/driver-three";
import type {
  PhysicsPredictionIslandMemberDefinition,
  PhysicsPredictionIslandStateSnapshot,
  PhysicsRotation
} from "@gamekit/physics-core";
import * as THREE from "three";

import { ARENA_ENVIRONMENT, arenaMemberRole } from "../shared/arena-definition";

export type ArenaVisual = {
  update(state: PhysicsPredictionIslandStateSnapshot | undefined, localMemberId?: string): void;
  destroy(): void;
};

const UNIT = 34;

export function createArenaVisual(
  native: ThreeRendererNative,
  definitions: ReadonlyMap<string, PhysicsPredictionIslandMemberDefinition>
): ArenaVisual {
  const root = new THREE.Group();
  root.name = "knockout-circuit.root";
  const meshes = new Map<string, THREE.Mesh>();
  setupScene(native, root);
  createCourse(root);
  native.scene.add(root);

  const camera = native.camera as THREE.PerspectiveCamera;
  camera.position.set(0, 14 * UNIT, 18 * UNIT);
  camera.lookAt(0, 0, -3 * UNIT);
  camera.updateProjectionMatrix?.();

  return {
    update(state, localMemberId) {
      if (state) {
        const retained = new Set<string>();
        for (const member of state.members) {
          const definition = definitions.get(member.id);
          if (!definition) continue;
          retained.add(member.id);
          const mesh = ensureMemberMesh(root, meshes, definition);
          applyTransform(mesh, member.body.position, member.body.rotation);
          const material = mesh.material as THREE.MeshStandardMaterial;
          const local = member.id === localMemberId;
          material.emissive.set(local ? 0x9bff31 : 0x000000);
          material.emissiveIntensity = local ? 0.75 : 0;
        }
        for (const [id, mesh] of meshes) {
          if (retained.has(id)) continue;
          mesh.removeFromParent();
          disposeMesh(mesh);
          meshes.delete(id);
        }
      }
      native.render();
    },
    destroy() {
      root.removeFromParent();
      root.traverse((child) => {
        if (child instanceof THREE.Mesh) disposeMesh(child);
      });
    }
  };
}

function setupScene(native: ThreeRendererNative, root: THREE.Group): void {
  native.scene.fog = new THREE.FogExp2(0x08131b, 0.00075);
  const hemisphere = new THREE.HemisphereLight(0xc9f5ff, 0x14202a, 2.15);
  const key = new THREE.DirectionalLight(0xfff0d2, 3.1);
  key.position.set(-8 * UNIT, 16 * UNIT, 12 * UNIT);
  const rim = new THREE.DirectionalLight(0x2be7ff, 2.4);
  rim.position.set(12 * UNIT, 8 * UNIT, -14 * UNIT);
  root.add(hemisphere, key, rim);
}

function createCourse(root: THREE.Group): void {
  for (const body of ARENA_ENVIRONMENT.bodies ?? []) {
    const collider = (ARENA_ENVIRONMENT.colliders ?? []).find(
      (candidate) => candidate.bodyId === body.id
    );
    if (!collider || collider.shape.type !== "box") continue;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        collider.shape.width * UNIT,
        collider.shape.height * UNIT,
        (collider.shape.depth ?? 1) * UNIT
      ),
      new THREE.MeshStandardMaterial({
        color: body.id === "course.finish" ? 0xff5a1f : 0x19313d,
        roughness: 0.72,
        metalness: 0.12
      })
    );
    applyTransform(mesh, body.position ?? { x: 0, y: 0, z: 0 }, body.rotation);
    root.add(mesh);
  }
  const grid = new THREE.GridHelper(26 * UNIT, 26, 0x2be7ff, 0x17313e);
  grid.position.y = 1;
  root.add(grid);
}

function ensureMemberMesh(
  root: THREE.Group,
  meshes: Map<string, THREE.Mesh>,
  definition: PhysicsPredictionIslandMemberDefinition
): THREE.Mesh {
  const existing = meshes.get(definition.id);
  if (existing) return existing;
  const shape = definition.colliders?.[0]?.shape;
  let geometry: THREE.BufferGeometry;
  if (shape?.type === "capsule") {
    geometry = new THREE.CapsuleGeometry(shape.radius * UNIT, shape.height * UNIT, 8, 16);
  } else if (shape?.type === "sphere") {
    geometry = new THREE.SphereGeometry(shape.radius * UNIT, 24, 16);
  } else if (shape?.type === "box") {
    geometry = new THREE.BoxGeometry(
      shape.width * UNIT,
      shape.height * UNIT,
      (shape.depth ?? 1) * UNIT
    );
  } else {
    geometry = new THREE.BoxGeometry(UNIT, UNIT, UNIT);
  }
  const role = arenaMemberRole(definition.id);
  const material = new THREE.MeshStandardMaterial({
    color: colorForRole(role, definition.id),
    roughness: role === "sweeper" ? 0.28 : 0.58,
    metalness: role === "sweeper" || role === "platform" ? 0.48 : 0.08
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `knockout.${definition.id}`;
  root.add(mesh);
  meshes.set(definition.id, mesh);
  return mesh;
}

function applyTransform(
  target: THREE.Object3D,
  position: { x: number; y: number; z?: number },
  rotation?: PhysicsRotation
): void {
  target.position.set(position.x * UNIT, position.y * UNIT, (position.z ?? 0) * UNIT);
  if (rotation === undefined) return;
  if (typeof rotation === "number") {
    target.rotation.set(0, 0, rotation);
  } else if ("w" in rotation) {
    target.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  } else {
    target.rotation.set(rotation.x, rotation.y, rotation.z ?? 0);
  }
}

function colorForRole(role: ReturnType<typeof arenaMemberRole>, id: string): number {
  if (role === "player") return id.endsWith("0") ? 0xff5a1f : 0x2be7ff;
  if (role === "bot") return 0xf4c84a;
  if (role === "sweeper") return 0xff2e63;
  if (role === "platform") return 0x7f5cff;
  return id.includes("ball") ? 0x9bff31 : 0xece3d0;
}

function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) material.dispose();
}
