import { describe, expect, it } from "vitest";
import {
  DataRegistryError,
  createDataRegistry,
  type DataPack,
  type DataTypeDefinition
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

type HeroDefinition = {
  id: string;
  actorId: string;
  role: string;
  tags?: string[];
};

describe("createDataRegistry", () => {
  it("registers custom data types and entry-based data packs", () => {
    const registry = createDataRegistry();
    registry.registerType(assetType());
    registry.registerType(renderObjectType(["sprite"]));
    registry.registerType(heroType());

    registry.registerPack({
      id: "sandbox",
      version: "1.0.0",
      namespace: "demo",
      priority: 10,
      entries: [
        {
          type: "asset.definition",
          id: "asset.hero",
          data: { id: "asset.hero", type: "image", tags: ["preload"] }
        },
        {
          type: "render.object",
          id: "render.hero",
          data: { id: "render.hero", type: "sprite", assetId: "asset.hero" }
        },
        {
          type: "game.hero",
          id: "hero.guardian",
          data: { id: "hero.guardian", actorId: "actor.guardian", role: "tank" }
        }
      ]
    });

    expect(registry.getValue<AssetDefinition>("asset.definition", "asset.hero")).toMatchObject({
      id: "asset.hero"
    });
    expect(registry.list("render.object")).toHaveLength(1);
    expect(registry.query({ type: "asset.definition", tags: ["preload"] })).toHaveLength(1);
    expect(registry.query({ sourcePackId: "sandbox" })).toHaveLength(3);
    expect(registry.snapshot()).toMatchObject({
      types: ["asset.definition", "render.object", "game.hero"],
      packs: ["sandbox"]
    });
  });

  it("supports custom indexes for global gameplay data", () => {
    const registry = createDataRegistry();
    registry.registerType(renderObjectType(["sprite"]));
    registry.registerType(actorType());
    registry.registerPack(packWithActor());

    const guardians = registry.query<ActorDefinition>({
      type: "game.actor",
      index: { id: "faction", value: "guardian" }
    });

    expect(guardians.map((document) => document.id)).toEqual(["actor.guardian"]);
  });

  it("tracks outgoing and incoming references by type and id", () => {
    const registry = createDataRegistry();
    registry.registerType(assetType());
    registry.registerType(renderObjectType(["sprite"]));
    registry.registerType(actorType());
    registry.registerPack({
      id: "sandbox",
      version: "1.0.0",
      entries: [
        { type: "asset.definition", id: "asset.hero", data: { id: "asset.hero", type: "image" } },
        {
          type: "render.object",
          id: "render.hero",
          data: { id: "render.hero", type: "sprite", assetId: "asset.hero" }
        },
        {
          type: "game.actor",
          id: "actor.guardian",
          data: { id: "actor.guardian", renderObjectId: "render.hero", faction: "guardian" }
        }
      ]
    });

    expect(registry.referencesFrom({ type: "game.actor", id: "actor.guardian" })).toMatchObject([
      {
        from: { type: "game.actor", id: "actor.guardian" },
        to: { type: "render.object", id: "render.hero" }
      }
    ]);
    expect(registry.referencesTo({ type: "asset.definition", id: "asset.hero" })).toMatchObject([
      {
        from: { type: "render.object", id: "render.hero" },
        to: { type: "asset.definition", id: "asset.hero" }
      }
    ]);
  });

  it("reports duplicate documents", () => {
    const registry = createDataRegistry();
    registry.registerType(assetType());

    expect(() =>
      registry.registerPack({
        id: "broken",
        version: "1.0.0",
        entries: [
          { type: "asset.definition", id: "asset.hero", data: { id: "asset.hero", type: "image" } },
          { type: "asset.definition", id: "asset.hero", data: { id: "asset.hero", type: "image" } }
        ]
      })
    ).toThrow(DataRegistryError);
  });

  it("reports duplicate data packs", () => {
    const registry = createDataRegistry();
    registry.registerType(assetType());
    registry.registerPack({
      id: "sandbox",
      version: "1.0.0",
      entries: [
        { type: "asset.definition", id: "asset.hero", data: { id: "asset.hero", type: "image" } }
      ]
    });

    expect(() =>
      registry.registerPack({
        id: "sandbox",
        version: "1.0.0",
        entries: [
          {
            type: "asset.definition",
            id: "asset.villain",
            data: { id: "asset.villain", type: "image" }
          }
        ]
      })
    ).toThrow(DataRegistryError);
  });

  it("reports unknown types, validation failures, and missing references with source detail", () => {
    const registry = createDataRegistry();
    registry.registerType(assetType());
    registry.registerType(renderObjectType(["sprite"]));

    const validation = registry.validatePack({
      id: "broken",
      version: "1.0.0",
      entries: [
        { type: "asset.definition", id: "asset.bad", data: { id: "asset.bad", type: "video" } },
        {
          type: "render.object",
          id: "render.hero",
          data: { id: "render.hero", type: "mesh", assetId: "asset.missing" }
        },
        { type: "game.ability", id: "ability.unregistered", data: { id: "ability.unregistered" } }
      ]
    });

    expect(validation.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "data.validation.unknown_asset_type",
      "data.validation.unknown_render_type",
      "data.unknown_type",
      "data.missing_reference"
    ]);
    expect(validation.diagnostics.at(-1)).toMatchObject({
      sourcePackId: "broken",
      path: "assetId",
      details: {
        entryType: "render.object",
        entryId: "render.hero",
        targetType: "asset.definition",
        targetId: "asset.missing"
      }
    });
  });

  it("normalizes documents before registration", () => {
    const registry = createDataRegistry();
    registry.registerType<AssetDefinition>({
      type: "asset.definition",
      normalize: (value) => ({
        ...value,
        id: value.id.trim()
      })
    });

    registry.registerPack({
      id: "sandbox",
      version: "1.0.0",
      entries: [
        {
          type: "asset.definition",
          id: "asset.hero",
          data: { id: " asset.hero ", type: "image" }
        }
      ]
    });

    expect(registry.has("asset.definition", "asset.hero")).toBe(true);
    expect(registry.getValue<AssetDefinition>("asset.definition", "asset.hero").id).toBe(
      "asset.hero"
    );
  });
});

function assetType(
  patch: Partial<DataTypeDefinition<AssetDefinition>> = {}
): DataTypeDefinition<AssetDefinition> {
  return {
    type: "asset.definition",
    validate(document) {
      return document.data.type === "image" || document.data.type === "spritesheet"
        ? []
        : [
            {
              code: "data.validation.unknown_asset_type",
              message: `Unknown asset type: ${document.data.type}`,
              severity: "error",
              key: document
            }
          ];
    },
    ...patch
  };
}

function renderObjectType(supportedTypes: string[]): DataTypeDefinition<RenderObjectDefinition> {
  return {
    type: "render.object",
    references(document) {
      return document.data.assetId
        ? [{ type: "asset.definition", id: document.data.assetId, path: "assetId" }]
        : [];
    },
    validate(document) {
      return supportedTypes.includes(document.data.type)
        ? []
        : [
            {
              code: "data.validation.unknown_render_type",
              message: `Unknown render type: ${document.data.type}`,
              severity: "error",
              key: document
            }
          ];
    }
  };
}

function actorType(): DataTypeDefinition<ActorDefinition> {
  return {
    type: "game.actor",
    references(document) {
      return [{ type: "render.object", id: document.data.renderObjectId, path: "renderObjectId" }];
    },
    indexes: [
      {
        id: "faction",
        values(document) {
          return [document.data.faction];
        }
      }
    ]
  };
}

function heroType(): DataTypeDefinition<HeroDefinition> {
  return {
    type: "game.hero",
    indexes: [
      {
        id: "role",
        values(document) {
          return [document.data.role];
        }
      }
    ]
  };
}

function packWithActor(): DataPack {
  return {
    id: "sandbox",
    version: "1.0.0",
    entries: [
      { type: "render.object", id: "render.hero", data: { id: "render.hero", type: "sprite" } },
      {
        type: "game.actor",
        id: "actor.guardian",
        data: {
          id: "actor.guardian",
          renderObjectId: "render.hero",
          faction: "guardian"
        }
      }
    ]
  };
}
