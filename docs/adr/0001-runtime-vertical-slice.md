# ADR 0001：首轮采用 Runtime 垂直切片

## Status

Accepted

## Context

仓库初始为空，但架构文档已经定义了较大的目标范围。若首轮直接实现 Phaser、TCA、GAS、Asset、UI 和 DevTools，风险会集中爆发，且很难判断基础边界是否正确。

## Decision

首轮只实现 runtime 垂直切片：

- pnpm workspace + Turbo。
- `@gamekit/core`
- `@gamekit/world`
- `@gamekit/world-koota`
- `@gamekit/event-bus`
- `@gamekit/game-runtime`
- `@gamekit/test-utils`
- `apps/sandbox`

Koota 作为第一版 ECS adapter，但只存在于 `@gamekit/world-koota` 内部。

## Consequences

收益：

- 先验证包边界、模块安装、系统调度、事件链路。
- 后续 renderer、asset、TCA、GAS 可以沿同一垂直切片增量接入。
- Koota 可替换性由 `@gamekit/world` facade 和 conformance tests 保护。

代价：

- 首轮没有真实游戏画面和完整玩法。
- Sandbox 只能证明基础运行时，不代表最终 demo 体验。
