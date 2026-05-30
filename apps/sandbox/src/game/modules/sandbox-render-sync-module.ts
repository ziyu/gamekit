import { defineGameModule } from "@gamekit/core";
import type { GameInstallContext } from "@gamekit/game-runtime";
import type {
  RenderNodePatch,
  RenderNodePath,
  RenderObjectDefinition,
  RenderObjectPatch,
  RendererAdapter
} from "@gamekit/renderer-core";
import type { EntityId, GameWorld } from "@gamekit/world";
import {
  LinkState,
  ObjectiveState,
  Position,
  RenderObjectPresentation,
  SceneObject,
  BuildingState,
  ResourceStorage,
  ThreatState,
  WorkAssignment,
  type SandboxRenderNodeAnimation
} from "../components";

export type SandboxRenderSize = {
  width: number;
  height: number;
};

type SandboxRenderTransformPatch = {
  x: number;
  y: number;
  rotation?: number | undefined;
  width?: number | undefined;
};

type RenderObjectPatchSignature = {
  x?: number | undefined;
  y?: number | undefined;
  rotation?: number | undefined;
  width?: number | undefined;
  alpha?: number | undefined;
  tint?: number | undefined;
  tintMode?: string | number | undefined;
};

type RenderNodePatchSignature = {
  x?: number | undefined;
  y?: number | undefined;
  rotation?: number | undefined;
  scaleX?: number | undefined;
  scaleY?: number | undefined;
  width?: number | undefined;
  alpha?: number | undefined;
  tint?: number | undefined;
  tintMode?: string | number | undefined;
};

type RenderSyncCache = {
  objectPatches: Map<string, RenderObjectPatchSignature>;
  nodePatches: Map<string, Map<string, RenderNodePatchSignature>>;
  positionsByObjectId: Map<string, { x: number; y: number }>;
};

export type SandboxRenderSyncOptions = {
  renderer: RendererAdapter;
  size: SandboxRenderSize;
};

const RENDER_POSITION_EPSILON = 0.01;
const RENDER_VALUE_EPSILON = 0.001;

export function createSandboxRenderSyncModule(options: SandboxRenderSyncOptions) {
  return defineGameModule<GameInstallContext>({
    id: "sandbox.render_sync",
    install(ctx) {
      ctx.eventBus.emit(
        "sandbox.renderer_sync_installed",
        { rendererId: options.renderer.id },
        "sandbox.render_sync"
      );
      const cache: RenderSyncCache = {
        objectPatches: new Map(),
        nodePatches: new Map(),
        positionsByObjectId: new Map()
      };

      ctx.systems.register({
        id: "sandbox.render_sync_system",
        update({ world, tick, elapsed }) {
          cache.positionsByObjectId.clear();
          for (const entity of world.query([SceneObject, Position])) {
            const object = world.get(entity, SceneObject);
            const position = world.get(entity, Position);
            if (object && position) {
              cache.positionsByObjectId.set(object.objectId, position);
            }
          }

          for (const entity of world.query([Position, RenderObjectPresentation])) {
            const position = world.get(entity, Position);
            const presentation = world.get(entity, RenderObjectPresentation);
            if (!position || !presentation) {
              continue;
            }

            const link = world.get(entity, LinkState);
            const renderTransform: SandboxRenderTransformPatch = link
              ? createLinkTransform(link, cache.positionsByObjectId, options.size)
              : {
                  x: toPixel(position.x, options.size.width),
                  y: toPixel(position.y, options.size.height)
                };

            if (!presentation.renderObjectId) {
              const renderObjectId = options.renderer.createObject(
                createObjectDefinition({
                  x: renderTransform.x,
                  y: renderTransform.y,
                  rotation: renderTransform.rotation,
                  width: renderTransform.width,
                  presentation
                })
              );
              world.set(entity, RenderObjectPresentation, { ...presentation, renderObjectId });
              ctx.eventBus.emit(
                "sandbox.render_object_linked",
                { entity, renderObjectId },
                "sandbox.render_sync"
              );
              continue;
            }

            updateObjectIfChanged(
              options.renderer,
              cache,
              presentation.renderObjectId,
              createObjectPatch(renderTransform, link)
            );
            applyNodeAnimations(
              options.renderer,
              cache,
              presentation.renderObjectId,
              presentation,
              elapsed
            );
            applySceneNodeState(
              options.renderer,
              cache,
              presentation.renderObjectId,
              world,
              entity
            );
          }

          if (tick % 120 === 0) {
            ctx.eventBus.emit("sandbox.render_sync_tick", { tick }, "sandbox.render_sync");
          }
        }
      });
    }
  });
}

function applyNodeAnimations(
  renderer: RendererAdapter,
  cache: RenderSyncCache,
  renderObjectId: string,
  presentation: ReturnType<typeof RenderObjectPresentation.create>,
  elapsed: number
): void {
  if (!renderer.updateNode || !presentation.nodeAnimations) {
    return;
  }

  const seconds = elapsed / 1000;
  for (const animation of presentation.nodeAnimations) {
    updateNodeIfChanged(
      renderer,
      cache,
      renderObjectId,
      animation.nodePath,
      createNodePatch(animation, seconds)
    );
  }
}

function createNodePatch(animation: SandboxRenderNodeAnimation, seconds: number): RenderNodePatch {
  const phase = animation.phase ?? 0;
  const wave = Math.sin(seconds * animation.speed + phase);

  if (animation.kind === "orbit") {
    return {
      transform: {
        position: {
          x: Math.cos(seconds * animation.speed + phase) * animation.radius,
          y: Math.sin(seconds * animation.speed + phase) * animation.radius
        }
      }
    };
  }

  if (animation.kind === "pulse") {
    const scale = 1 + wave * animation.scale;
    const patch: RenderNodePatch = {
      transform: {
        scale: { x: scale, y: scale }
      }
    };

    if (animation.alpha) {
      patch.alpha =
        animation.alpha.min + ((wave + 1) / 2) * (animation.alpha.max - animation.alpha.min);
    }

    return patch;
  }

  return {
    transform: {
      rotation: {
        z: seconds * animation.speed + phase
      }
    }
  };
}

function createObjectDefinition(input: {
  x: number;
  y: number;
  rotation?: number | undefined;
  width?: number | undefined;
  presentation: ReturnType<typeof RenderObjectPresentation.create>;
}): RenderObjectDefinition {
  return {
    ...input.presentation.definition,
    transform: {
      ...input.presentation.definition.transform,
      position: {
        ...input.presentation.definition.transform?.position,
        x: input.x,
        y: input.y
      },
      ...(input.rotation === undefined
        ? input.presentation.definition.transform?.rotation
          ? { rotation: input.presentation.definition.transform.rotation }
          : {}
        : { rotation: { z: input.rotation } })
    },
    props: {
      ...input.presentation.definition.props,
      ...(input.width === undefined ? {} : { width: input.width })
    }
  };
}

function createObjectPatch(
  transform: SandboxRenderTransformPatch,
  link: ReturnType<typeof LinkState.create> | undefined
): RenderObjectPatch {
  const patch: RenderObjectPatch = {
    transform: {
      position: { x: transform.x, y: transform.y },
      ...(transform.rotation === undefined ? {} : { rotation: { z: transform.rotation } })
    },
    props: {
      ...(transform.width === undefined ? {} : { width: transform.width }),
      ...(link ? { tint: linkTint(link.status) } : {})
    }
  };

  if (link) {
    patch.alpha = 0.28 + Math.min(0.65, link.flow * 0.65);
  }

  return patch;
}

function createLinkTransform(
  link: ReturnType<typeof LinkState.create>,
  positionsByObjectId: Map<string, { x: number; y: number }>,
  size: SandboxRenderSize
): { x: number; y: number; rotation: number; width: number } {
  const from = positionsByObjectId.get(link.fromObjectId) ?? { x: 0, y: 0 };
  const to = positionsByObjectId.get(link.toObjectId) ?? { x: 0, y: 0 };
  const fromX = toPixel(from.x, size.width);
  const fromY = toPixel(from.y, size.height);
  const toX = toPixel(to.x, size.width);
  const toY = toPixel(to.y, size.height);

  return {
    x: (fromX + toX) / 2,
    y: (fromY + toY) / 2,
    rotation: Math.atan2(toY - fromY, toX - fromX),
    width: Math.max(8, Math.hypot(toX - fromX, toY - fromY))
  };
}

function applySceneNodeState(
  renderer: RendererAdapter,
  cache: RenderSyncCache,
  renderObjectId: string,
  world: GameWorld,
  entity: EntityId
): void {
  if (!renderer.updateNode) {
    return;
  }

  const storage = world.get(entity, ResourceStorage);
  const building = world.get(entity, BuildingState);
  const work = world.get(entity, WorkAssignment);
  const threat = world.get(entity, ThreatState);
  const objective = world.get(entity, ObjectiveState);
  const object = world.get(entity, SceneObject);

  if (storage) {
    const ratio = storage.capacity <= 0 ? 0 : Math.min(1, storage.resource / storage.capacity);
    updateNodeIfChanged(renderer, cache, renderObjectId, "charge/fill", {
      props: {
        width: 4 + ratio * 48,
        tint: ratio > 0.85 ? 0xd9b35f : 0x7fd16b
      },
      alpha: 0.45 + ratio * 0.55
    });
    updateNodeIfChanged(renderer, cache, renderObjectId, "beacon", {
      alpha: 0.25 + ratio * 0.75,
      transform: {
        scale: {
          x: 0.85 + ratio * 0.35,
          y: 0.85 + ratio * 0.35
        }
      }
    });
  }

  if (building) {
    const health = clamp(building.health / 100, 0, 1);
    const heat = clamp(building.heat / 100, 0, 1);
    updateNodeIfChanged(renderer, cache, renderObjectId, "outer", {
      props: {
        tint: heat > 0.68 ? 0xdd3627 : health < 0.72 ? 0xd9b35f : 0x64c2d0
      },
      alpha: 0.44 + building.priority * 0.08
    });
    updateNodeIfChanged(renderer, cache, renderObjectId, "inner", {
      alpha: 0.25 + health * 0.58,
      transform: {
        scale: {
          x: 0.9 + heat * 0.18,
          y: 0.9 + heat * 0.18
        }
      }
    });
  }

  if (work) {
    const carrying = work.cargo > 0 ? Math.min(1, work.cargo / 18) : 0;
    updateNodeIfChanged(renderer, cache, renderObjectId, "cargo", {
      alpha: carrying,
      transform: {
        scale: {
          x: 0.75 + carrying * 0.55,
          y: 0.75 + carrying * 0.55
        }
      }
    });
    updateNodeIfChanged(renderer, cache, renderObjectId, "task", {
      props: {
        tint: taskTint(work.task)
      },
      alpha: 0.35 + Math.max(work.progress, work.routeProgress) * 0.55
    });
    updateNodeIfChanged(renderer, cache, renderObjectId, "outer", {
      alpha: 0.3 + (work.battery / 100) * 0.42
    });
  }

  if (threat) {
    updateNodeIfChanged(renderer, cache, renderObjectId, "field", {
      alpha: 0.12 + threat.intensity * 0.42,
      transform: {
        scale: {
          x: 1 + threat.intensity * 0.25,
          y: 1 + threat.intensity * 0.25
        }
      }
    });
  }

  if (objective) {
    const progress =
      objective.targetResources <= 0
        ? 0
        : Math.min(1, objective.progressResources / objective.targetResources);
    updateNodeIfChanged(renderer, cache, renderObjectId, "aura", {
      alpha: 0.24 + progress * 0.5,
      transform: {
        scale: {
          x: 1 + progress * 0.22,
          y: 1 + progress * 0.22
        }
      }
    });
    updateNodeIfChanged(renderer, cache, renderObjectId, "core", {
      props: {
        tint: progress > 0.78 ? 0xd9b35f : 0xf3f0e8
      }
    });
  }

  if (object?.role === "storage") {
    updateNodeIfChanged(renderer, cache, renderObjectId, "core", {
      props: { tint: 0x9d89d8 }
    });
  }
  if (object?.role === "workshop") {
    updateNodeIfChanged(renderer, cache, renderObjectId, "core", {
      props: { tint: 0xd9b35f }
    });
  }
}

function linkTint(status: ReturnType<typeof LinkState.create>["status"]): number {
  if (status === "danger") {
    return 0xdd3627;
  }
  if (status === "blocked") {
    return 0xd9b35f;
  }
  return 0x64c2d0;
}

function updateObjectIfChanged(
  renderer: RendererAdapter,
  cache: RenderSyncCache,
  renderObjectId: string,
  patch: RenderObjectPatch
): void {
  const signature = createObjectPatchSignature(patch);
  if (sameObjectSignature(cache.objectPatches.get(renderObjectId), signature)) {
    return;
  }
  renderer.updateObject(renderObjectId, patch);
  cache.objectPatches.set(renderObjectId, signature);
}

function updateNodeIfChanged(
  renderer: RendererAdapter,
  cache: RenderSyncCache,
  renderObjectId: string,
  nodePath: RenderNodePath,
  patch: RenderNodePatch
): void {
  if (!renderer.updateNode) {
    return;
  }

  const signature = createNodePatchSignature(patch);
  const nodePatches = getNodePatchCache(cache, renderObjectId);
  const cacheKey = createNodePathCacheKey(nodePath);
  if (sameNodeSignature(nodePatches.get(cacheKey), signature)) {
    return;
  }
  renderer.updateNode(renderObjectId, nodePath, patch);
  nodePatches.set(cacheKey, signature);
}

function createNodePathCacheKey(nodePath: RenderNodePath): string {
  return Array.isArray(nodePath) ? nodePath.join("/") : nodePath;
}

function getNodePatchCache(
  cache: RenderSyncCache,
  renderObjectId: string
): Map<string, RenderNodePatchSignature> {
  const existing = cache.nodePatches.get(renderObjectId);
  if (existing) {
    return existing;
  }
  const nodePatches = new Map<string, RenderNodePatchSignature>();
  cache.nodePatches.set(renderObjectId, nodePatches);
  return nodePatches;
}

function createObjectPatchSignature(patch: RenderObjectPatch): RenderObjectPatchSignature {
  return {
    x: patch.transform?.position?.x,
    y: patch.transform?.position?.y,
    rotation: patch.transform?.rotation?.z,
    width: readNumberProp(patch.props, "width"),
    alpha: patch.alpha,
    tint: readNumberProp(patch.props, "tint"),
    tintMode: readTintModeProp(patch.props)
  };
}

function createNodePatchSignature(patch: RenderNodePatch): RenderNodePatchSignature {
  return {
    x: patch.transform?.position?.x,
    y: patch.transform?.position?.y,
    rotation: patch.transform?.rotation?.z,
    scaleX: patch.transform?.scale?.x,
    scaleY: patch.transform?.scale?.y,
    width: readNumberProp(patch.props, "width"),
    alpha: patch.alpha,
    tint: readNumberProp(patch.props, "tint"),
    tintMode: readTintModeProp(patch.props)
  };
}

function readNumberProp(
  props: Partial<Record<string, unknown>> | undefined,
  key: string
): number | undefined {
  const value = props?.[key];
  return typeof value === "number" ? value : undefined;
}

function readTintModeProp(
  props: Partial<Record<string, unknown>> | undefined
): string | number | undefined {
  const value = props?.tintMode;
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function sameObjectSignature(
  previous: RenderObjectPatchSignature | undefined,
  next: RenderObjectPatchSignature
): boolean {
  return (
    !!previous &&
    sameOptionalNumber(previous.x, next.x, RENDER_POSITION_EPSILON) &&
    sameOptionalNumber(previous.y, next.y, RENDER_POSITION_EPSILON) &&
    sameOptionalNumber(previous.rotation, next.rotation, RENDER_VALUE_EPSILON) &&
    sameOptionalNumber(previous.width, next.width, RENDER_POSITION_EPSILON) &&
    sameOptionalNumber(previous.alpha, next.alpha, RENDER_VALUE_EPSILON) &&
    previous.tint === next.tint &&
    previous.tintMode === next.tintMode
  );
}

function sameNodeSignature(
  previous: RenderNodePatchSignature | undefined,
  next: RenderNodePatchSignature
): boolean {
  return (
    !!previous &&
    sameOptionalNumber(previous.x, next.x, RENDER_POSITION_EPSILON) &&
    sameOptionalNumber(previous.y, next.y, RENDER_POSITION_EPSILON) &&
    sameOptionalNumber(previous.rotation, next.rotation, RENDER_VALUE_EPSILON) &&
    sameOptionalNumber(previous.scaleX, next.scaleX, RENDER_VALUE_EPSILON) &&
    sameOptionalNumber(previous.scaleY, next.scaleY, RENDER_VALUE_EPSILON) &&
    sameOptionalNumber(previous.width, next.width, RENDER_POSITION_EPSILON) &&
    sameOptionalNumber(previous.alpha, next.alpha, RENDER_VALUE_EPSILON) &&
    previous.tint === next.tint &&
    previous.tintMode === next.tintMode
  );
}

function sameOptionalNumber(
  previous: number | undefined,
  next: number | undefined,
  epsilon: number
): boolean {
  if (previous === undefined || next === undefined) {
    return previous === next;
  }
  return Math.abs(previous - next) <= epsilon;
}

function taskTint(task: ReturnType<typeof WorkAssignment.create>["task"]): number {
  if (task === "haul") {
    return 0xd9b35f;
  }
  if (task === "repair") {
    return 0x7fd16b;
  }
  if (task === "defend") {
    return 0xdd3627;
  }
  if (task === "build") {
    return 0x9d89d8;
  }
  return 0x64c2d0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toPixel(percent: number, size: number): number {
  return (percent / 100) * size;
}
