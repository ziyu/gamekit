import type { SandboxRuntime } from "../game";

export function renderSandbox(appElement: HTMLElement, sandbox: SandboxRuntime): void {
  const state = sandbox.snapshot();
  const clock = state.clock;

  appElement.innerHTML = `
    <section class="shell">
      <header class="masthead">
        <div>
          <p class="eyebrow">GameKit / runtime vertical slice</p>
          <h1>Sandbox Control Plane</h1>
        </div>
        <div class="status ${state.running ? "status--running" : ""}">
          <span></span>
          ${state.running ? "running" : "stopped"}
        </div>
      </header>

      <section class="grid">
        <article class="panel panel--stage">
          <div class="panel__title">
            <span>World</span>
            <strong>${state.entityCount} entities</strong>
          </div>
          <div class="stage">
            ${state.entities
              .map(
                (entity, index) => `
                <span
                  class="entity entity--${index + 1}"
                  title="${String(entity.id)}"
                  style="left: ${entity.x}%; top: ${entity.y}%"
                ></span>
              `
              )
              .join("")}
          </div>
        </article>

        <article class="panel">
          <div class="panel__title">
            <span>Runtime</span>
            <strong>tick ${clock.ticks}</strong>
          </div>
          <dl class="metrics">
            <div><dt>Elapsed</dt><dd>${clock.elapsed.toFixed(1)} ms</dd></div>
            <div><dt>Delta</dt><dd>${clock.delta.toFixed(1)} ms</dd></div>
            <div><dt>Systems</dt><dd>${sandbox.runtime.systems.values().length}</dd></div>
          </dl>
        </article>

        <article class="panel panel--events">
          <div class="panel__title">
            <span>EventBus</span>
            <strong>${state.events.length} recent</strong>
          </div>
          <ol class="events">
            ${state.events
              .slice()
              .reverse()
              .map(
                (event) => `
                <li>
                  <code>${event.type}</code>
                  <span>${event.source ?? "unknown"} · ${event.timestamp}</span>
                </li>
              `
              )
              .join("")}
          </ol>
        </article>
      </section>
    </section>
  `;
}
