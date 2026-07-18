import { defineGameModule } from "@gamekit/core";
import type { DataRegistry } from "@gamekit/data";
import type { GameInstallContext } from "@gamekit/game-runtime";
import { PhysicsTransformComponent } from "@gamekit/physics-core";
import type { RendererAdapter } from "@gamekit/renderer-core";

import { OutpostGameplayObject, OutpostPresentation } from "../gameplay/components";
import {
  createOutpostArenaRenderObjectDefinitions,
  type OutpostRenderTargetWriter
} from "./preview-presentation-module";
import { createOutpostDynamicRenderObjectDefinition } from "./player-render-object";

export type CreateOutpostClientPresentationModuleOptions = {
  dataRegistry: DataRegistry;
  renderer: RendererAdapter;
  applyRenderTargetState?: OutpostRenderTargetWriter | undefined;
  readObjectState?(objectId: string):
    | {
        position: { x: number; y: number };
        facing: number;
        tags?: readonly string[] | undefined;
      }
    | undefined;
};

export function createOutpostClientPresentationModule(
  options: CreateOutpostClientPresentationModuleOptions
) {
  const arenaObjects = createOutpostArenaRenderObjectDefinitions(options.dataRegistry);
  return defineGameModule<GameInstallContext>({
    id: "outpost.client.presentation",
    install(ctx) {
      const arenaObjectIds = new Set<string>();
      const dynamicObjectIds = new Set<string>();
      const signatures = new Map<string, string>();
      let arenaCreated = false;

      ctx.systems.register({
        id: "outpost.client.presentation.sync",
        update() {
          if (!arenaCreated) {
            for (const definition of arenaObjects) {
              const objectId = requireObjectId(definition.id, "arena");
              options.renderer.createObject(definition);
              arenaObjectIds.add(objectId);
            }
            arenaCreated = true;
          }

          const desiredObjectIds = new Set<string>();
          for (const entity of ctx.world.query([
            OutpostPresentation,
            OutpostGameplayObject,
            PhysicsTransformComponent
          ])) {
            const presentation = ctx.world.get(entity, OutpostPresentation);
            const object = ctx.world.get(entity, OutpostGameplayObject);
            const transform = ctx.world.get(entity, PhysicsTransformComponent);
            if (!presentation || !object || !transform || object.kind === "arena-boundary") {
              continue;
            }
            const presented = options.readObjectState?.(object.id);
            const position = presented?.position ?? transform.position;
            const facing = presented?.facing ?? object.facing;
            const objectId = presentation.renderObjectId ?? object.id;
            desiredObjectIds.add(objectId);
            if (!dynamicObjectIds.has(objectId)) {
              options.renderer.createObject(
                createOutpostDynamicRenderObjectDefinition(
                  options.dataRegistry,
                  presentation.renderKey,
                  objectId,
                  position.x,
                  position.y,
                  facing,
                  [`outpost.client-${object.kind}`]
                )
              );
              dynamicObjectIds.add(objectId);
            }

            const shocked = presented?.tags?.includes("status.shocked") ?? false;
            const signature = `${position.x.toFixed(3)}:${position.y.toFixed(3)}:${facing.toFixed(3)}:${shocked ? 1 : 0}`;
            if (signatures.get(objectId) === signature) {
              continue;
            }
            signatures.set(objectId, signature);
            const handle = options.renderer.getObjectHandle?.(objectId);
            if (handle && options.applyRenderTargetState) {
              options.applyRenderTargetState(handle.native, {
                transform: {
                  position: { x: position.x, y: position.y },
                  rotation: { z: facing }
                },
                props: { tint: shocked ? 0x63fff2 : 0xffffff }
              });
            }
          }

          for (const objectId of dynamicObjectIds) {
            if (desiredObjectIds.has(objectId)) {
              continue;
            }
            options.renderer.destroyObject(objectId);
            dynamicObjectIds.delete(objectId);
            signatures.delete(objectId);
          }
        }
      });

      return () => {
        for (const objectId of dynamicObjectIds) {
          options.renderer.destroyObject(objectId);
        }
        for (const objectId of arenaObjectIds) {
          options.renderer.destroyObject(objectId);
        }
        dynamicObjectIds.clear();
        arenaObjectIds.clear();
        signatures.clear();
        arenaCreated = false;
      };
    }
  });
}

function requireObjectId(value: string | undefined, kind: string): string {
  if (!value) {
    throw new Error(`Outpost ${kind} RenderObject requires id`);
  }
  return value;
}
