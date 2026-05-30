import { defineGameModule } from "@gamekit/core";
import type { DataRegistry } from "@gamekit/data";
import type { GameInstallContext } from "@gamekit/game-runtime";
import type { RenderObjectDefinition, RendererAdapter } from "@gamekit/renderer-core";
import { Actor, Combat, FloatingText, Lifetime, Position, Presentation } from "../components";
import { RENDER_OBJECT_TYPE } from "../content";
import type { AbyssRuntimeState } from "../runtime-state";

export type CreateAbyssPresentationModuleOptions = {
  renderer: RendererAdapter;
  dataRegistry: DataRegistry;
  state: AbyssRuntimeState;
};

export function createAbyssPresentationModule(options: CreateAbyssPresentationModuleOptions) {
  return defineGameModule<GameInstallContext>({
    id: "abyss.presentation",
    install(ctx) {
      ctx.systems.register({
        id: "abyss.presentation.system",
        update(system) {
          syncPresentation(ctx, options, system.elapsed);
        }
      });
    }
  });
}

function syncPresentation(
  ctx: GameInstallContext,
  options: CreateAbyssPresentationModuleOptions,
  elapsed: number
): void {
  const visible = new Set<string>();
  for (const entity of ctx.world.query([Presentation, Position])) {
    const presentation = ctx.world.get(entity, Presentation);
    const position = ctx.world.get(entity, Position);
    if (!presentation || !position) {
      continue;
    }

    if (!presentation.objectId) {
      const definition = cloneRenderObject(
        options.dataRegistry.getValue<RenderObjectDefinition>(
          RENDER_OBJECT_TYPE,
          presentation.renderKey
        ),
        String(entity),
        presentation.layer
      );
      presentation.objectId = options.renderer.createObject(definition);
      options.state.trace({
        kind: "runtime",
        label: `render ${presentation.renderKey}`,
        entityId: entity
      });
    }

    visible.add(presentation.objectId);
    const actor = ctx.world.get(entity, Actor);
    const combat = ctx.world.get(entity, Combat);
    const lifetime = ctx.world.get(entity, Lifetime);
    const floating = ctx.world.get(entity, FloatingText);
    const alpha =
      lifetime && lifetime.lifetimeMs > 0
        ? Math.max(0, 1 - lifetime.ageMs / lifetime.lifetimeMs)
        : 1;

    options.renderer.updateObject(presentation.objectId, {
      alpha,
      transform: {
        position: { x: position.x, y: position.y },
        rotation: { z: position.rotation }
      }
    });

    if (combat && actor?.faction === "enemy") {
      updateHealthBar(options.renderer, presentation.objectId, combat);
    }
    if (combat && elapsed < combat.hitFlashUntil) {
      options.renderer.updateNode?.(presentation.objectId, "body", {
        props: { tint: 0xffffff }
      });
    }
    if (floating) {
      updateFloatingText(options.renderer, presentation.objectId, floating.tone);
    }
  }
}

function cloneRenderObject(
  definition: RenderObjectDefinition,
  entityId: string,
  depth: number
): RenderObjectDefinition {
  return {
    ...structuredClone(definition),
    id: `abyss.${entityId}.${definition.id ?? definition.type}`,
    props: {
      ...definition.props,
      depth
    }
  };
}

function updateHealthBar(
  renderer: RendererAdapter,
  objectId: string,
  combat: { health: number; maxHealth: number }
): void {
  const ratio = Math.max(0, Math.min(1, combat.health / Math.max(1, combat.maxHealth)));
  renderer.updateNode?.(objectId, "hp-fill", {
    props: {
      width: Math.max(2, 34 * ratio),
      tint: ratio < 0.35 ? 0xff3848 : 0x7cff92
    },
    transform: {
      position: { x: -17 + (34 * ratio) / 2, y: -28 }
    }
  });
}

function updateFloatingText(renderer: RendererAdapter, objectId: string, tone: string): void {
  renderer.updateNode?.(objectId, "text", {
    props: {
      tint: tone === "damage" ? 0xff4f59 : tone === "reward" ? 0xb7ff73 : 0xffd76d
    }
  });
}
