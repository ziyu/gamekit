import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { OutpostConnectionView } from "../ui/OutpostLobby";
import { OutpostApp } from "../ui/OutpostApp";

describe("Outpost HUD", () => {
  it("keeps exhausted Dash feedback short and explicit", () => {
    const connection = {
      phase: "connected",
      sessionId: "os-ui-test",
      localPlayerId: "player.local",
      match: {
        phase: "running",
        elapsedMs: 1_000,
        countdownMsRemaining: 0,
        participants: [],
        combat: {
          actors: [
            {
              objectId: "player.local",
              kind: "player",
              health: 100,
              shield: 50,
              stamina: 12,
              resource: 100,
              cooldowns: {}
            }
          ],
          cues: [
            {
              sequence: 1,
              kind: "action-rejected",
              at: 900,
              sourceObjectId: "player.local",
              ability: "dash",
              reason: "costs-unavailable"
            }
          ],
          kills: 0
        }
      }
    } as unknown as OutpostConnectionView;
    const noop = vi.fn();
    const html = renderToStaticMarkup(
      createElement(OutpostApp, {
        bootMessage: "Ready",
        bootPhase: "running",
        connection,
        onCreateSession: noop,
        onGameFocus: noop,
        onJoinSession: noop,
        onReady: noop,
        onResetConnection: noop,
        rendererRoot: {} as HTMLElement,
        uiRuntime: {} as never
      })
    );

    expect(html).toContain("STAMINA 12 of 100");
    expect(html).toContain("DASH LOCKED");
    expect(html).toContain("LOW STAMINA");
    expect(html).not.toContain("DASH DENIED");
    expect(html).not.toContain("INSUFFICIENT STAMINA");
    expect(html).not.toContain("REQUIRES 25 STAMINA");
  });

  it("renders the authority Dash cooldown directly over its icon", () => {
    const connection = {
      phase: "connected",
      sessionId: "os-ui-cooldown-test",
      localPlayerId: "player.local",
      match: {
        phase: "running",
        elapsedMs: 1_000,
        countdownMsRemaining: 0,
        participants: [],
        combat: {
          actors: [
            {
              objectId: "player.local",
              kind: "player",
              health: 100,
              shield: 50,
              stamina: 75,
              resource: 100,
              cooldowns: { "ability.outpost.dash": 2_500 }
            }
          ],
          cues: [],
          kills: 0
        }
      }
    } as unknown as OutpostConnectionView;
    const noop = vi.fn();
    const html = renderToStaticMarkup(
      createElement(OutpostApp, {
        bootMessage: "Ready",
        bootPhase: "running",
        connection,
        onCreateSession: noop,
        onGameFocus: noop,
        onJoinSession: noop,
        onReady: noop,
        onResetConnection: noop,
        rendererRoot: {} as HTMLElement,
        uiRuntime: {} as never
      })
    );

    expect(html).toContain('aria-label="Dash cooldown 1.5 seconds"');
    expect(html).toContain('class="outpost-ability__cooldown">1.5</span>');
    expect(html).toContain("25 ST");
  });
});
