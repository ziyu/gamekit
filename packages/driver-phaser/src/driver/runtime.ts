import type { DriverBootContext } from "@gamekit/driver-core";
import type { PhaserRendererRuntime } from "@gamekit/renderer-phaser";
import type { PhaserDriverAssetRuntime } from "./assets";
import type { PhaserDriverCameraRuntime } from "./camera";
import type { PhaserDriverInputRuntime } from "./input-source";

export type PhaserDriverRuntimeOptions = {
  backgroundColor: string;
};

export type PhaserDriverRuntime = {
  view: HTMLCanvasElement;
  renderer: PhaserRendererRuntime;
  assets: PhaserDriverAssetRuntime;
  camera: PhaserDriverCameraRuntime;
  input: PhaserDriverInputRuntime;
  resize(width: number, height: number): void;
  destroy(): void;
};

export async function createPhaserDriverRuntime(
  ctx: DriverBootContext,
  options: PhaserDriverRuntimeOptions
): Promise<PhaserDriverRuntime> {
  const Phaser = await import("phaser");
  let sceneRef: any;
  let gameRef: any;

  const ready = new Promise<void>((resolve) => {
    const captureScene = (scene: unknown): void => {
      sceneRef = scene;
      resolve();
    };

    class GameKitScene extends Phaser.Scene {
      constructor() {
        super("gamekit-driver");
      }

      create() {
        captureScene(this);
      }
    }

    const gameConfig: any = {
      type: Phaser.AUTO,
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
    };
    if (ctx.container !== undefined) {
      gameConfig.parent = ctx.container;
    }

    gameRef = new Phaser.Game(gameConfig);
  });

  await ready;
  const view = gameRef.canvas as HTMLCanvasElement;

  return {
    view,
    renderer: {
      view,
      scene: sceneRef,
      resize(width, height) {
        gameRef.scale.resize(width, height);
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
    camera: {
      setScroll(x, y) {
        sceneRef.cameras.main.setScroll(x, y);
      },
      setZoom(zoom) {
        sceneRef.cameras.main.setZoom(zoom);
      },
      setRotation(rotation) {
        sceneRef.cameras.main.setRotation(rotation);
      }
    },
    input: {
      on(eventName, listener) {
        inputEmitter(sceneRef, eventName)?.on(eventName, listener);
      },
      off(eventName, listener) {
        inputEmitter(sceneRef, eventName)?.off(eventName, listener);
      }
    },
    resize(width, height) {
      gameRef.scale.resize(width, height);
    },
    destroy() {
      gameRef.destroy(true);
    }
  };
}

function inputEmitter(
  scene: any,
  eventName: string
):
  | {
      on(eventName: string, listener: (...args: unknown[]) => void): void;
      off(eventName: string, listener: (...args: unknown[]) => void): void;
    }
  | undefined {
  if (eventName === "keydown" || eventName === "keyup") {
    return scene.input.keyboard;
  }

  return scene.input;
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
