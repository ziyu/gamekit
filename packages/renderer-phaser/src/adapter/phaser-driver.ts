import type { RenderObjectConfig, RenderObjectPatch } from "@gamekit/renderer-core";
import type { PhaserRendererDriver } from "./types";

const SUPPORTED_OBJECT_TYPES = ["debug.square", "sprite", "container"] as const;

export function createDefaultPhaserDriver(): PhaserRendererDriver {
  return {
    capabilities() {
      return {
        objectTypes: [...SUPPORTED_OBJECT_TYPES],
        supportsObjectTree: true
      };
    },
    async boot(ctx, options) {
      const Phaser = await import("phaser");
      const objects = new Map<string, any>();
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
        resize(width, height) {
          game.scale.resize(width, height);
        },
        destroy() {
          objects.clear();
          game.destroy(true);
        },
        createObject(id, config) {
          const object = createPhaserObject(sceneRef, config, options.debugTextureId);
          object.setData?.("renderObjectId", id);
          applyObjectPatch(object, config);
          objects.set(id, object);

          if (config.parentId) {
            setParentObject(objects, id, config.parentId);
          }
        },
        updateObject(id, patch) {
          const object = objects.get(id);
          if (!object) {
            return;
          }

          applyObjectPatch(object, patch);
        },
        setParent(id, parentId) {
          setParentObject(objects, id, parentId);
        },
        destroyObject(id) {
          const object = objects.get(id);
          if (object) {
            object.destroy();
            objects.delete(id);
          }
        },
        playAnimation(id, animationId) {
          const object = objects.get(id);
          if (object?.play) {
            object.play(animationId);
          }
        }
      };
    }
  };
}

function ensureDebugTexture(scene: any, debugTextureId: string): void {
  if (scene.textures.exists(debugTextureId)) {
    return;
  }

  const graphics = scene.make.graphics({ x: 0, y: 0, add: false });
  graphics.fillStyle(0x7fd16b, 1);
  graphics.fillRect(0, 0, 24, 24);
  graphics.lineStyle(3, 0x10100e, 1);
  graphics.strokeRect(1, 1, 22, 22);
  graphics.generateTexture(debugTextureId, 24, 24);
  graphics.destroy();
}

function createPhaserObject(scene: any, config: RenderObjectConfig, debugTextureId: string): any {
  const transform = config.transform;
  const x = transform?.x ?? 0;
  const y = transform?.y ?? 0;

  if (config.type === "container") {
    return scene.add.container(x, y);
  }

  const textureId = resolveTexture(scene, config, debugTextureId);
  return scene.add.sprite(x, y, textureId);
}

function resolveTexture(scene: any, config: RenderObjectConfig, debugTextureId: string): string {
  const textureId =
    typeof config.props?.textureId === "string" ? config.props.textureId : undefined;
  if (textureId && scene.textures.exists(textureId)) {
    return textureId;
  }

  return debugTextureId;
}

function applyObjectPatch(object: any, patch: RenderObjectConfig | RenderObjectPatch): void {
  const transform = patch.transform;
  if (transform?.x !== undefined || transform?.y !== undefined) {
    object.setPosition?.(transform.x ?? object.x, transform.y ?? object.y);
  }
  if (transform?.width !== undefined || transform?.height !== undefined) {
    object.setDisplaySize?.(
      transform.width ?? object.displayWidth,
      transform.height ?? object.displayHeight
    );
  }
  if (transform?.scaleX !== undefined || transform?.scaleY !== undefined) {
    object.setScale?.(transform.scaleX ?? object.scaleX, transform.scaleY ?? object.scaleY);
  }
  if (transform?.rotation !== undefined) {
    object.setRotation?.(transform.rotation);
  }
  if (patch.alpha !== undefined) {
    object.setAlpha?.(patch.alpha);
  }
  if (patch.visible !== undefined) {
    object.setVisible?.(patch.visible);
  }
  if (patch.depth !== undefined) {
    object.setDepth?.(patch.depth);
  }
  if (typeof patch.props?.tint === "number") {
    object.setTint?.(patch.props.tint);
  }
}

function setParentObject(
  objects: Map<string, any>,
  id: string,
  parentId: string | undefined
): void {
  const object = objects.get(id);
  if (!object) {
    return;
  }

  if (!parentId) {
    object.parentContainer?.remove?.(object);
    return;
  }

  const parent = objects.get(parentId);
  parent?.add?.(object);
}
