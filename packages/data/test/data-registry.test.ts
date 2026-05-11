import { describe, expect, it } from "vitest";
import {
  DataRegistryError,
  createDataRegistry,
  type DataKindDefinition,
  type DataPack
} from "../src";

type AssetDefinition = {
  id: string;
  type: string;
  tags?: string[];
};

type RenderObjectDefinition = {
  id: string;
  type: string;
  assetId?: string;
  tags?: string[];
};

type ActorDefinition = {
  id: string;
  renderObjectId: string;
  faction: string;
  tags?: string[];
};

describe("createDataRegistry", () => {
  it("registers custom data kinds and data packs", () => {
    const registry = createDataRegistry();
    registry.registerKind(assetKind());
    registry.registerKind(renderObjectKind(["sprite"]));

    registry.registerPack({
      id: "sandbox",
      version: "1.0.0",
      namespace: "demo",
      priority: 10,
      data: {
        asset: [{ id: "asset.hero", type: "image", tags: ["preload"] }],
        renderObject: [{ id: "render.hero", type: "sprite", assetId: "asset.hero" }]
      }
    });

    expect(registry.getValue<AssetDefinition>("asset", "asset.hero")).toMatchObject({
      id: "asset.hero"
    });
    expect(registry.list("renderObject")).toHaveLength(1);
    expect(registry.query({ kind: "asset", tags: ["preload"] })).toHaveLength(1);
    expect(registry.query({ sourcePackId: "sandbox" })).toHaveLength(2);
    expect(registry.snapshot()).toMatchObject({
      kinds: ["asset", "renderObject"],
      packs: ["sandbox"]
    });
  });

  it("supports custom indexes for global gameplay data", () => {
    const registry = createDataRegistry();
    registry.registerKind(renderObjectKind(["sprite"]));
    registry.registerKind(actorKind());
    registry.registerPack(packWithActor());

    const guardians = registry.query<ActorDefinition>({
      kind: "actor",
      index: { id: "faction", value: "guardian" }
    });

    expect(guardians.map((document) => document.id)).toEqual(["actor.guardian"]);
  });

  it("tracks outgoing and incoming references", () => {
    const registry = createDataRegistry();
    registry.registerKind(assetKind());
    registry.registerKind(renderObjectKind(["sprite"]));
    registry.registerKind(actorKind());
    registry.registerPack({
      id: "sandbox",
      version: "1.0.0",
      data: {
        asset: [{ id: "asset.hero", type: "image" }],
        renderObject: [{ id: "render.hero", type: "sprite", assetId: "asset.hero" }],
        actor: [{ id: "actor.guardian", renderObjectId: "render.hero", faction: "guardian" }]
      }
    });

    expect(registry.referencesFrom({ kind: "actor", id: "actor.guardian" })).toMatchObject([
      {
        from: { kind: "actor", id: "actor.guardian" },
        to: { kind: "renderObject", id: "render.hero" }
      }
    ]);
    expect(registry.referencesTo({ kind: "asset", id: "asset.hero" })).toMatchObject([
      {
        from: { kind: "renderObject", id: "render.hero" },
        to: { kind: "asset", id: "asset.hero" }
      }
    ]);
  });

  it("reports duplicate documents", () => {
    const registry = createDataRegistry();
    registry.registerKind(assetKind());

    expect(() =>
      registry.registerPack({
        id: "broken",
        version: "1.0.0",
        data: {
          asset: [
            { id: "asset.hero", type: "image" },
            { id: "asset.hero", type: "image" }
          ]
        }
      })
    ).toThrow(DataRegistryError);
  });

  it("reports duplicate data packs", () => {
    const registry = createDataRegistry();
    registry.registerKind(assetKind());
    registry.registerPack({
      id: "sandbox",
      version: "1.0.0",
      data: { asset: [{ id: "asset.hero", type: "image" }] }
    });

    expect(() =>
      registry.registerPack({
        id: "sandbox",
        version: "1.0.0",
        data: { asset: [{ id: "asset.villain", type: "image" }] }
      })
    ).toThrow(DataRegistryError);
  });

  it("reports unknown kinds, validation failures, and missing references", () => {
    const registry = createDataRegistry();
    registry.registerKind(assetKind());
    registry.registerKind(renderObjectKind(["sprite"]));

    const validation = registry.validatePack({
      id: "broken",
      version: "1.0.0",
      data: {
        asset: [{ id: "asset.bad", type: "video" }],
        renderObject: [{ id: "render.hero", type: "mesh", assetId: "asset.missing" }],
        ability: [{ id: "ability.unregistered" }]
      }
    });

    expect(validation.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "data.validation.unknown_asset_type",
      "data.validation.unknown_render_type",
      "data.unknown_kind",
      "data.missing_reference"
    ]);
  });

  it("normalizes documents before registration", () => {
    const registry = createDataRegistry();
    registry.registerKind<AssetDefinition>({
      kind: "asset",
      normalize: (value) => ({
        ...value,
        id: value.id.trim()
      })
    });

    registry.registerPack({
      id: "sandbox",
      version: "1.0.0",
      data: {
        asset: [{ id: " asset.hero ", type: "image" }]
      }
    });

    expect(registry.has("asset", "asset.hero")).toBe(true);
  });
});

function assetKind(): DataKindDefinition<AssetDefinition> {
  return {
    kind: "asset",
    validate(document) {
      return document.value.type === "image" || document.value.type === "spritesheet"
        ? []
        : [
            {
              code: "data.validation.unknown_asset_type",
              message: `Unknown asset type: ${document.value.type}`,
              severity: "error",
              key: document
            }
          ];
    }
  };
}

function renderObjectKind(supportedTypes: string[]): DataKindDefinition<RenderObjectDefinition> {
  return {
    kind: "renderObject",
    references(document) {
      return document.value.assetId
        ? [{ kind: "asset", id: document.value.assetId, path: "assetId" }]
        : [];
    },
    validate(document) {
      return supportedTypes.includes(document.value.type)
        ? []
        : [
            {
              code: "data.validation.unknown_render_type",
              message: `Unknown render type: ${document.value.type}`,
              severity: "error",
              key: document
            }
          ];
    }
  };
}

function actorKind(): DataKindDefinition<ActorDefinition> {
  return {
    kind: "actor",
    references(document) {
      return [{ kind: "renderObject", id: document.value.renderObjectId, path: "renderObjectId" }];
    },
    indexes: [
      {
        id: "faction",
        values(document) {
          return [document.value.faction];
        }
      }
    ]
  };
}

function packWithActor(): DataPack {
  return {
    id: "sandbox",
    version: "1.0.0",
    data: {
      renderObject: [{ id: "render.hero", type: "sprite" }],
      actor: [
        {
          id: "actor.guardian",
          renderObjectId: "render.hero",
          faction: "guardian"
        }
      ]
    }
  };
}
