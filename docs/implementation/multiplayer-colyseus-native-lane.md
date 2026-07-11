# Multiplayer Colyseus Native Lane

Status: Planned

## Goal

在不让 Colyseus SDK 类型进入 `multiplayer-core` 或玩法 domain 的前提下，让 `apps/multiplayer-demo` 真实使用 Colyseus Schema state sync 作为可选 authoritative path，并与现有 `gamekit-envelope` baseline 使用同一 app-local `RealtimeArenaSnapshotPayload` 和 presentation pipeline。

## Scope

1. 为 Demo session 声明唯一 authoritative path：`gamekit-envelope` 或 `colyseus-schema`，禁止双写 gameplay state。
2. 在 server-owned Colyseus Room state 中维护可版本化 Schema authority state，由 host simulation 作为唯一 writer。
3. 在 `@gamekit/multiplayer-colyseus` typed native bridge 中把 Schema update 映射为 app-local view model，不向 gameplay、DataType、Save 或 core API 暴露 Room/Schema instance。
4. Client receiver 对 session、source endpoint、tick/version、size、stale update 和 resync 执行与 baseline 等价的 gate。
5. Demo HUD 展示 authoritative path、schema version/state version、state size、update/patch count 和 resync reason。
6. Headless tests 覆盖双 client ready/start/input/result、非 authority update、room isolation、host close 和同名 session recreate buffer cleanup。
7. Browser smoke 对比两条 lane 的完整一局、远端 interpolation、本地 prediction 和 diagnostics。

## Non-Goals

- 本工作流不实现生产 reconnect/seat reservation、matchmaking、账号或公网部署。
- 不把 Relay Arena payload、Colyseus Schema class 或 provider room handle 上推到 `multiplayer-core`。
- 不允许 envelope 与 Schema 同时写入客户端 authority state。

## Validation

```bash
corepack pnpm --filter @gamekit/multiplayer-colyseus test
corepack pnpm --filter multiplayer-demo test
corepack pnpm --filter multiplayer-demo build
corepack pnpm bench:multiplayer:check
corepack pnpm test
corepack pnpm build
corepack pnpm lint
corepack pnpm format
```

需要分别对 `gamekit-envelope` 和 `colyseus-schema` 运行真实双窗口 browser smoke，并确认 console、HUD 和 authority diagnostics 能解释当前路径。
