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
import { createOutpostPlayerRenderObjectDefinition } from "./player-render-object";

export type CreateOutpostClientPresentationModuleOptions = {
  dataRegistry: DataRegistry;
  renderer: RendererAdapter;
  applyRenderTargetState?: OutpostRenderTargetWriter | undefined;
  readPlayerState?(playerId: string):
    | {
        position: { x: number; y: number };
        facing: number;
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
      const playerObjectIds = new Set<string>();
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

          const desiredPlayerObjectIds = new Set<string>();
          for (const entity of ctx.world.query([
            OutpostPresentation,
            OutpostGameplayObject,
            PhysicsTransformComponent
          ])) {
            const presentation = ctx.world.get(entity, OutpostPresentation);
            const object = ctx.world.get(entity, OutpostGameplayObject);
            const transform = ctx.world.get(entity, PhysicsTransformComponent);
            if (!presentation || !object || !transform || object.kind !== "player") {
              continue;
            }
            const presented = options.readPlayerState?.(object.id);
            const position = presented?.position ?? transform.position;
            const facing = presented?.facing ?? object.facing;
            const objectId = presentation.renderObjectId ?? object.id;
            desiredPlayerObjectIds.add(objectId);
            if (!playerObjectIds.has(objectId)) {
              options.renderer.createObject(
                createOutpostPlayerRenderObjectDefinition(
                  options.dataRegistry,
                  presentation.renderKey,
                  objectId,
                  position.x,
                  position.y,
                  facing
                )
              );
              playerObjectIds.add(objectId);
            }

            const signature = `${position.x.toFixed(3)}:${position.y.toFixed(3)}:${facing.toFixed(3)}`;
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
                }
              });
            }
          }

          for (const objectId of playerObjectIds) {
            if (desiredPlayerObjectIds.has(objectId)) {
              continue;
            }
            options.renderer.destroyObject(objectId);
            playerObjectIds.delete(objectId);
            signatures.delete(objectId);
          }
        }
      });

      return () => {
        for (const objectId of playerObjectIds) {
          options.renderer.destroyObject(objectId);
        }
        for (const objectId of arenaObjectIds) {
          options.renderer.destroyObject(objectId);
        }
        playerObjectIds.clear();
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
