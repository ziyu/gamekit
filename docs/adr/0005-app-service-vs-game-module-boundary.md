# ADR 0005：区分 App Service 和 Game Module

## Status

Accepted

## Context

引入 App Host 后，Platform、Data、Asset、Renderer、Input、Camera 和 GameRuntime 都可以被统一装配和观察。这个方向减少了 app 入口代码，但也带来新的风险：如果把所有能力都做成 App Host standard service，App Host 会逐渐变成 gameplay runtime 或上帝对象。

Camera 暴露了这个问题。Camera 需要 input action、camera rig、renderer camera adapter sync，有时还需要跟随 entity、响应 TCA/Cue、参与 tick。它不像 Platform 或 Renderer 那样主要管理外部句柄和 adapter lifecycle，更像一次游戏会话中的 gameplay module。

TCA 和 GAS 也有同类问题：它们需要监听 EventBus、读取 gameplay DataType、执行规则、写 trace、在 GameRuntime dispose 时清理订阅。它们需要无痛启动，但不应该因此成为 App Host 标准服务。

## Decision

明确区分 App Service 和 Game Module。

App Service 的判断标准：

- 生命周期跟应用、窗口、平台、资源或外部句柄绑定。
- 主要负责 adapter boot/dispose、配置来源、平台差异、资源加载、全局诊断。
- 不需要每帧读取 world，也不应该直接知道具体玩法上下文。
- 可以通过 App Host `services.xxx` 被多个 game module、UI 或 DevTools 读取。

Game Module 的判断标准：

- 生命周期跟一次 GameRuntime 会话绑定。
- 需要注册 system、监听 EventBus、读写 world、读取 gameplay DataType 或参与 tick。
- 需要知道具体游戏上下文、规则、actor、camera rig、ability、save slot 等。
- 应通过 `GameModule` 安装，并在 GameRuntime dispose 时清理订阅和 runtime 状态。

长期归属：

- Platform、Data、Asset、Renderer、Input source adapters、UI shell、DevTools shell 属于 App Service。
- Camera controller / camera rig、TCA runtime、GAS runtime、gameplay save capture / restore 属于 Game Module。
- `camera-phaser`、`camera-three` 这类包是 renderer camera adapter / bridge，不拥有 gameplay camera state。

TCA 不作为 App Host 标准服务。它应提供 `createTcaModule(...)` 这样的标准 GameModule helper，让游戏无需手写 EventBus 订阅、rule compile、trace store 和 cleanup。

Camera 不作为长期 App Host 标准服务。它应提供 `createCameraModule(...)` 或 camera rig helper，把 input action、camera controller、renderer camera adapter sync 和 cleanup 封装在 GameModule lifecycle 里。

## Consequences

收益：

- App Host 继续专注应用组合、服务生命周期、配置和诊断。
- GameRuntime 继续保持薄内核，只提供 GameModule lifecycle，而不直接理解 Camera/TCA/GAS。
- Camera、TCA、GAS 等玩法会话能力仍能无痛启动，但跟随 GameRuntime dispose 清理。
- DevTools 可以同时观察 App Host services 和 gameplay module trace，而不要求所有 trace runtime 都是 App Service。

代价：

- GameRuntime 需要支持 GameModule cleanup/disposable 和 runtime dispose。
- 标准 gameplay module helper 需要足够好用，否则用户仍会回到手写装配。
- App Host profile 的 `game.createRuntime` 需要成为组合应用服务和标准游戏模块的主要接缝。

迁移影响：

- 当前 Camera 已在 App Host standard service 中接入 Sandbox。后续应迁移为标准 GameModule helper。
- App Host 可以继续提供 renderer、input、data 等依赖，但不继续扩大 gameplay standard service 范围。
