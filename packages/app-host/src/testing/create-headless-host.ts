import { createAssetManager, type AssetDefinition, type AssetLoaderAdapter } from "@gamekit/asset";
import { createDataRegistry, type DataKindDefinition, type DataPack } from "@gamekit/data";
import type {
  RenderNodePath,
  RenderNodePatch,
  RenderObjectDefinition,
  RenderObjectId,
  RenderObjectPatch,
  RendererAdapter,
  RendererBootContext,
  RendererCapabilities
} from "@gamekit/renderer-core";
import { createConfiguredAppHost } from "../definition/create-configured-app-host";
import { defineGameApp } from "../definition/define-game-app";
import type { AppHost, AppServiceBinding, CreateAppHostOptions } from "../runtime/types";
import { createStandardAppProfile } from "../standard/create-standard-app-profile";

export type CreateHeadlessHostOptions = {
  id?: string;
  kinds?: Array<DataKindDefinition> | undefined;
  dataPacks?: DataPack[] | undefined;
  preloadGroups?: string[] | undefined;
  services?: Array<AppServiceBinding> | undefined;
  configSources?: CreateAppHostOptions["configSources"] | undefined;
};

export function createHeadlessHost(options: CreateHeadlessHostOptions = {}): AppHost {
  const data = createDataRegistry();
  const renderer = createHeadlessRenderer();
  const assets = createAssetManager({
    adapter: createMemoryAssetAdapter()
  });
  const extensionServices = options.services ?? [];
  const appId = options.id ?? "headless-host";
  const app = defineGameApp({
    id: appId,
    ...(options.configSources === undefined ? {} : { configSources: options.configSources }),
    services: [
      { id: "data" },
      { id: "renderer" },
      { id: "assets" },
      ...extensionServices.map((binding) => ({
        id: binding.key.id,
        dependencies: binding.lifecycle.dependencies
      }))
    ]
  });
  const profile = createStandardAppProfile({
    id: "headless",
    services: {
      data: {
        registry: data,
        kinds: () => options.kinds ?? [],
        dataPacks: () => options.dataPacks ?? []
      },
      renderer: {
        adapter: renderer
      },
      assets: {
        manager: assets,
        dataRegistry: () => data,
        preloadGroups: () => options.preloadGroups
      }
    },
    extensions: Object.fromEntries(
      extensionServices.map((binding) => [binding.key.id, () => binding])
    )
  });

  return createConfiguredAppHost({
    app,
    profile,
    context: {}
  }).host;
}

function createMemoryAssetAdapter(): AssetLoaderAdapter {
  return {
    id: "headless-asset-loader",
    supports() {
      return true;
    },
    async load(_asset: AssetDefinition) {
      return undefined;
    }
  };
}

function createHeadlessRenderer(): RendererAdapter {
  let nextId = 0;
  const objects = new Map<string, RenderObjectDefinition>();
  const capabilities: RendererCapabilities = {
    objectTypes: ["debug.square", "sprite", "container"],
    supportsObjectTree: true,
    supportsNodeUpdates: true,
    commandTypes: ["animation.play"],
    supportsNativeHandles: true
  };

  return {
    id: "headless-renderer",
    async boot(_ctx: RendererBootContext) {
      return undefined;
    },
    destroy() {
      objects.clear();
    },
    getView() {
      return { dataset: { renderer: "headless" } } as unknown as HTMLElement;
    },
    capabilities() {
      return capabilities;
    },
    resize() {
      return undefined;
    },
    createObject(definition) {
      const id = definition.id ?? `headless-object-${nextId}`;
      nextId += 1;
      objects.set(id, { ...definition, id });
      return id;
    },
    updateObject(id: RenderObjectId, patch: RenderObjectPatch) {
      const object = objects.get(id);
      if (!object) {
        throw new Error(`Missing render object: ${id}`);
      }
      objects.set(id, {
        ...object,
        ...patch,
        props: { ...object.props, ...patch.props }
      });
    },
    destroyObject(id: RenderObjectId) {
      objects.delete(id);
    },
    updateNode(_objectId: RenderObjectId, _nodePath: RenderNodePath, _patch: RenderNodePatch) {
      return undefined;
    },
    command() {
      return undefined;
    },
    getObjectHandle(id) {
      const object = objects.get(id);
      if (!object) {
        throw new Error(`Missing render object: ${id}`);
      }
      return {
        id,
        type: object.type,
        native: object,
        escaped: true
      };
    }
  };
}
