import { createAssetManager } from "@gamekit/asset";
import type { DataPack } from "@gamekit/data";
import { describe, expect, it } from "vitest";
import { outpostAppDefinition } from "../app-definition";
import {
  createOutpostDataRegistry,
  outpostContentPack,
  registerOutpostDataTypes
} from "../content";
import {
  OUTPOST_PLAYER_TYPE,
  OUTPOST_RENDER_OBJECT_TYPE,
  OUTPOST_WAVE_TYPE,
  OUTPOST_WEAPON_TYPE,
  type OutpostPlayerDefinition
} from "../domain";
import {
  loadOutpostInitialAssetGroups,
  loadOutpostLazyAssetGroup,
  outpostProfileDefinition
} from "../profiles";
import { createDataRegistry } from "@gamekit/data";

describe("Outpost content pipeline", () => {
  it("registers app and framework content through one reference graph", () => {
    const registry = createOutpostDataRegistry();
    const snapshot = registry.snapshot();

    expect(snapshot.packs).toEqual(["outpost-siege.core"]);
    expect(snapshot.types).toEqual(
      expect.arrayContaining([
        "asset.definition",
        "gas.actor",
        "gas.ability",
        "gas.effect",
        "physics.body",
        "physics.collider",
        "tca.rule",
        OUTPOST_RENDER_OBJECT_TYPE,
        OUTPOST_PLAYER_TYPE,
        OUTPOST_WAVE_TYPE
      ])
    );
    expect(snapshot.documents.length).toBeGreaterThan(30);
    expect(
      snapshot.documents
        .filter((document) => document.type !== "asset.definition")
        .some((document) => JSON.stringify(document.data).includes("/assets/"))
    ).toBe(false);
    expect(
      registry.referencesFrom({ type: OUTPOST_PLAYER_TYPE, id: "player.outpost.ranger" })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          to: { type: OUTPOST_WEAPON_TYPE, id: "weapon.outpost.rifle" },
          path: "weapon"
        }),
        expect.objectContaining({
          to: { type: "physics.body", id: "body.outpost.player" },
          path: "physicsBody"
        })
      ])
    );
    expect(
      registry.referencesFrom({
        type: OUTPOST_RENDER_OBJECT_TYPE,
        id: "render.outpost.overseer"
      })
    ).toContainEqual(
      expect.objectContaining({
        to: { type: "asset.definition", id: "asset.outpost.overseer" },
        path: "assetRefs.texture"
      })
    );
  });

  it("locates missing and duplicate content at source pack paths", () => {
    const registry = createOutpostDataRegistry();
    const missingReferencePack: DataPack = {
      id: "outpost.invalid-reference",
      version: "1.0.0",
      entries: [
        {
          type: OUTPOST_PLAYER_TYPE,
          id: "player.outpost.invalid",
          data: {
            id: "player.outpost.invalid",
            actor: { type: "gas.actor", id: "actor.outpost.player" },
            weapon: { type: OUTPOST_WEAPON_TYPE, id: "weapon.outpost.missing" },
            physicsBody: { type: "physics.body", id: "body.outpost.player" },
            renderObject: {
              type: OUTPOST_RENDER_OBJECT_TYPE,
              id: "render.outpost.player"
            },
            moveSpeed: 220
          } satisfies OutpostPlayerDefinition
        }
      ]
    };
    const missing = registry.validatePack(missingReferencePack);

    expect(missing.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "data.missing_reference",
        sourcePackId: "outpost.invalid-reference",
        path: "weapon",
        key: { type: OUTPOST_PLAYER_TYPE, id: "player.outpost.invalid" }
      })
    );

    const emptyRegistry = createDataRegistry();
    registerOutpostDataTypes(emptyRegistry);
    const duplicate = emptyRegistry.validatePack({
      id: "outpost.duplicate",
      version: "1.0.0",
      entries: [outpostContentPack.entries[0]!, outpostContentPack.entries[0]!]
    });
    expect(duplicate.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "data.duplicate_document",
        sourcePackId: "outpost.duplicate",
        path: "entries[1]"
      })
    );
  });

  it("keeps headless visual loading empty and retries lazy boss assets", async () => {
    const registry = createOutpostDataRegistry();
    const attempts = new Map<string, number>();
    const diagnostics: Array<{ type: string; assetId?: string; source?: string }> = [];
    const manager = createAssetManager({
      adapter: {
        id: "outpost.test-assets",
        supports: () => true,
        async load(asset) {
          const attempt = (attempts.get(asset.id) ?? 0) + 1;
          attempts.set(asset.id, attempt);
          if (asset.id === "asset.outpost.overseer" && attempt === 1) {
            throw new Error("temporary boss asset failure");
          }
        }
      },
      onDiagnostic(event) {
        diagnostics.push({
          type: event.type,
          ...(event.assetId === undefined ? {} : { assetId: event.assetId }),
          ...(event.source === undefined ? {} : { source: event.source })
        });
      }
    });
    manager.registerFromDataRegistry(registry);

    const headlessResults = await loadOutpostInitialAssetGroups(
      manager,
      outpostProfileDefinition("headless-server")
    );
    expect(headlessResults).toEqual([]);
    expect(attempts.size).toBe(0);

    const browser = outpostProfileDefinition("browser-web");
    const initialResults = await loadOutpostInitialAssetGroups(manager, browser);
    expect(initialResults.map((result) => result.group)).toEqual(["boot", "match", "combat"]);
    expect(initialResults.every((result) => result.succeeded)).toBe(true);
    expect(attempts.has("asset.outpost.overseer")).toBe(false);

    const bossResult = await loadOutpostLazyAssetGroup(manager, browser, "boss", 2);
    expect(bossResult).toMatchObject({ group: "boss", attempt: 2, succeeded: true });
    expect(attempts.get("asset.outpost.overseer")).toBe(2);
    expect(diagnostics).toContainEqual({
      type: "asset.failed",
      assetId: "asset.outpost.overseer",
      source: "asset.manager"
    });
  });

  it("declares a shared service graph for all runtime profiles", () => {
    expect(outpostAppDefinition.services.map((service) => service.id)).toEqual([
      "platform",
      "drivers",
      "data",
      "renderer",
      "assets",
      "input",
      "multiplayer",
      "ui",
      "game",
      "save",
      "devtools"
    ]);
    expect(
      outpostAppDefinition.services.find((service) => service.id === "assets")?.dependencies
    ).toEqual(["data", "drivers", "renderer"]);
  });
});
