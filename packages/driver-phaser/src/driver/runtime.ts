import type { DriverBootContext } from "@gamekit/driver-core";
import type { PhaserRendererRuntime } from "@gamekit/renderer-phaser";
import type { PhaserDriverAssetRuntime } from "./assets";
import type { PhaserDriverCameraRuntime } from "./camera";
import type { PhaserDriverInputRuntime } from "./input-source";
import type { ResolvedPhaserDriverRenderOptions } from "./render-options";

export type PhaserDriverRuntimeOptions = {
  backgroundColor: string;
  render: ResolvedPhaserDriverRenderOptions;
};

export type PhaserDriverRuntime = {
  view: HTMLCanvasElement;
  pixelRatio: number;
  renderer: PhaserRendererRuntime;
  assets: PhaserDriverAssetRuntime;
  camera: PhaserDriverCameraRuntime;
  input: PhaserDriverInputRuntime;
  diagnostics(): {
    pixelRatio: number;
    canvas: { width: number; height: number };
    camera: {
      width: number;
      height: number;
      zoom: number;
      scrollX: number;
      scrollY: number;
    };
  };
  resize(width: number, height: number): void;
  destroy(): void;
};

export async function createPhaserDriverRuntime(
  ctx: DriverBootContext,
  options: PhaserDriverRuntimeOptions
): Promise<PhaserDriverRuntime> {
  const Phaser = await import("phaser");
  const render = options.render;
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
      width: internalSize(ctx.width, render.pixelRatio),
      height: internalSize(ctx.height, render.pixelRatio),
      backgroundColor: options.backgroundColor,
      scene: GameKitScene,
      render: {
        antialias: render.antialias,
        antialiasGL: render.antialiasGL,
        roundPixels: render.roundPixels,
        mipmapFilter: render.mipmapFilter
      },
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
  applyLogicalCanvasSize(gameRef, view, ctx.width, ctx.height);

  return {
    view,
    pixelRatio: render.pixelRatio,
    renderer: {
      view,
      scene: sceneRef,
      resize(width, height) {
        resizeGame(gameRef, view, width, height, render.pixelRatio);
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
      centerOn(x, y) {
        sceneRef.cameras.main.centerOn(x, y);
      },
      setZoom(zoom) {
        sceneRef.cameras.main.setZoom(zoom * render.pixelRatio);
      },
      setRotation(rotation) {
        sceneRef.cameras.main.setRotation(rotation);
      }
    },
    input: {
      coordinateScale: render.pixelRatio,
      on(eventName, listener) {
        inputEmitter(sceneRef, eventName)?.on(eventName, listener);
      },
      off(eventName, listener) {
        inputEmitter(sceneRef, eventName)?.off(eventName, listener);
      }
    },
    diagnostics() {
      const camera = sceneRef.cameras.main;
      return {
        pixelRatio: render.pixelRatio,
        canvas: { width: view.width, height: view.height },
        camera: {
          width: camera.width,
          height: camera.height,
          zoom: camera.zoom,
          scrollX: camera.scrollX,
          scrollY: camera.scrollY
        }
      };
    },
    resize(width, height) {
      resizeGame(gameRef, view, width, height, render.pixelRatio);
    },
    destroy() {
      gameRef.destroy(true);
    }
  };
}

function internalSize(logicalSize: number, pixelRatio: number): number {
  return Math.max(1, Math.round(logicalSize * pixelRatio));
}

function applyLogicalCanvasSize(
  game: { scale: { refresh?(): void } },
  view: HTMLCanvasElement,
  width: number,
  height: number
): void {
  view.style.width = `${width}px`;
  view.style.height = `${height}px`;
  game.scale.refresh?.();
}

function resizeGame(
  game: { scale: { resize(width: number, height: number): void; refresh?(): void } },
  view: HTMLCanvasElement,
  width: number,
  height: number,
  pixelRatio: number
): void {
  game.scale.resize(internalSize(width, pixelRatio), internalSize(height, pixelRatio));
  applyLogicalCanvasSize(game, view, width, height);
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
