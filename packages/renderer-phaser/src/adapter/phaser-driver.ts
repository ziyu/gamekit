import { GameError } from "@gamekit/core";
import type { PhaserRendererDriver } from "./types";
import { applyRenderCommand } from "./command-handlers";
import {
  createPhaserRenderRecord,
  ensureDebugTexture,
  SUPPORTED_OBJECT_TYPES
} from "./object-factory";
import { requireRenderRecord, resolveNodePath, type PhaserRenderRecord } from "./object-registry";
import { applyObjectPatch } from "./patch-handlers";

export function createDefaultPhaserDriver(): PhaserRendererDriver {
  return {
    capabilities() {
      return {
        objectTypes: [...SUPPORTED_OBJECT_TYPES],
        supportsObjectTree: true,
        supportsNodeUpdates: true,
        commandTypes: ["animation.play"],
        supportsNativeHandles: true
      };
    },
    async boot(ctx, options) {
      const Phaser = await import("phaser");
      const objects = new Map<string, PhaserRenderRecord>();
      let sceneRef: any;
      const setSceneRef = (scene: any) => {
        sceneRef = scene;
      };

      const ready = new Promise<void>((resolve) => {
        class GameKitScene extends Phaser.Scene {
          constructor() {
            super("gamekit-renderer");
          }

          create() {
            setSceneRef(this);
            ensureDebugTexture(this, options.debugTextureId);
            resolve();
          }
        }

        new Phaser.Game({
          type: Phaser.AUTO,
          parent: ctx.container,
          width: ctx.width,
          height: ctx.height,
          backgroundColor: options.backgroundColor,
          scene: GameKitScene,
          audio: {
            noAudio: true
          },
          scale: {
            mode: Phaser.Scale.NONE
          }
        });
      });

      await ready;
      const game = sceneRef.game;
      const view = game.canvas as HTMLCanvasElement;

      return {
        view,
        camera: {
          setScroll(x, y) {
            sceneRef.cameras.main.setScroll(x, y);
          },
          setZoom(zoom) {
            sceneRef.cameras.main.setZoom(zoom);
          },
          setRotation(rotation) {
            sceneRef.cameras.main.setRotation(rotation);
          },
          screenToWorld(point) {
            const worldPoint = sceneRef.cameras.main.getWorldPoint(point.x, point.y);
            return {
              x: worldPoint.x,
              y: worldPoint.y
            };
          },
          worldToScreen(point) {
            const camera = sceneRef.cameras.main;
            return {
              x: (point.x - camera.scrollX) * camera.zoom,
              y: (point.y - camera.scrollY) * camera.zoom
            };
          }
        },
        assets: {
          hasTexture(id) {
            return sceneRef.textures.exists(id);
          },
          loadImage(assetId, url) {
            return loadPhaserAsset(sceneRef, assetId, () => {
              sceneRef.load.image(assetId, url);
            });
          },
          loadSpritesheet(assetId, url, frame) {
            return loadPhaserAsset(sceneRef, assetId, () => {
              sceneRef.load.spritesheet(assetId, url, {
                frameWidth: frame.width,
                frameHeight: frame.height,
                margin: frame.margin ?? 0,
                spacing: frame.spacing ?? 0
              });
            });
          }
        },
        resize(width, height) {
          game.scale.resize(width, height);
        },
        destroy() {
          objects.clear();
          game.destroy(true);
        },
        createObject(id, config) {
          objects.set(id, createPhaserRenderRecord(sceneRef, id, config, options.debugTextureId));
        },
        updateObject(id, patch) {
          applyObjectPatch(requireRenderRecord(objects, id).native, patch);
        },
        updateNode(id, nodePath, patch) {
          const record = requireRenderRecord(objects, id);
          const resolvedPath = resolveNodePath(nodePath);
          const node = record.nodes.get(resolvedPath);
          if (!node) {
            throw new GameError("renderer.missing_node", `Missing render node: ${resolvedPath}`, {
              objectId: id,
              nodePath: resolvedPath
            });
          }

          applyObjectPatch(node, patch);
        },
        destroyObject(id) {
          const record = requireRenderRecord(objects, id);
          record.native.destroy();
          objects.delete(id);
        },
        command(id, command) {
          applyRenderCommand(requireRenderRecord(objects, id), command);
        },
        getObjectHandle(id) {
          const record = requireRenderRecord(objects, id);
          return {
            id,
            type: record.type,
            native: record.native,
            escaped: true
          };
        }
      };
    }
  };
}

function loadPhaserAsset(scene: any, assetId: string, enqueue: () => void): Promise<void> {
  if (scene.textures.exists(assetId)) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const loader = scene.load;
    const cleanup = () => {
      loader.off("complete", onComplete);
      loader.off("loaderror", onError);
    };
    const onComplete = () => {
      cleanup();
      resolve();
    };
    const onError = (file: { key?: string }) => {
      if (file.key !== undefined && file.key !== assetId) {
        return;
      }
      cleanup();
      reject(new Error(`Failed to load Phaser asset: ${assetId}`));
    };

    loader.once("complete", onComplete);
    loader.on("loaderror", onError);
    enqueue();
    loader.start();
  });
}
