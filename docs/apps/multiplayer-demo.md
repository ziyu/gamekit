# Multiplayer Demo 应用设计

## 定位

Multiplayer Demo 是 `@gamekit/multiplayer-core` 与 `@gamekit/multiplayer-colyseus` 的独立能力实验台。它用本地 Colyseus server、host GameRuntime、client facade 和浏览器控制台验证真实 backend 路径，不依赖 Sandbox 玩法，也不把 demo command 固化成核心协议。

它的目标是展示多人模块的组合边界：App/server 层创建连接和可命名 GameKit session，GameRuntime bridge 在 tick 边界处理 `game.command`，host authority 决定接受或拒绝，UI 只消费 session、peer、message 和低频 summary。

## 体验结构

- 主面板展示 Colyseus backend、GameKit session、active peer count、message count、accepted/rejected command 和 host state summary。
- Room 控制区允许输入 session id，并显式执行 `Host Room`、`Connect Client`、`Disconnect Client` 和 `Reset Room`；`Host Room` 创建或复用选中的 GameKit session，`Connect Client` 只加入已经托管的 session。
- Command 控制区发送 app-local 语义命令，例如选择目标、确认目标、切换策略和设置优先级。
- 侧边 timeline 展示 authority accepted/rejected/result 事实，client message log 展示 facade 收到的 provider-neutral message envelope。
- 本地 dev server 同时启动 Vite UI、Colyseus server，并按 session id 懒创建 host GameRuntime；浏览器 client 通过 Colyseus 加入选中的 GameKit session。

## 模块协作

- `apps/multiplayer-demo/src/server` 持有本地 Colyseus server，以及 `sessionId -> host runtime` lifecycle。
- Browser client 通过 `@gamekit/multiplayer-colyseus` root adapter 创建 `MultiplayerRuntime`，不 import server-only helper。
- Host GameRuntime 安装 `createMultiplayerBridgeModule()`，只在 tick 边界消费 command queue。
- Demo authority 与 handler 只依赖 `@gamekit/multiplayer-core` 的 envelope、peer、runtime 和 bridge context。
- UI 通过 app-local client facade 发送 command，通过 `/api/multiplayer-demo/session` 读取 host summary；UI 不直接读取 Colyseus Room、Client 或 socket handle。

## 约束

- Demo command 保持 app-local 类型，不能进入 `multiplayer-core` 顶层 API。
- UI 中的 Room 是 GameKit session id，不是 Colyseus room type；Colyseus room id 映射仍由 adapter 负责。
- `Connect Client` 不能隐式创建 session；用户输入不存在的 session id 时必须显示未托管错误，避免把 join 和 host lifecycle 混在一起。
- Colyseus server helper 只出现在 server/dev harness 和测试夹具中，不能进入 browser UI 的公共边界。
- Host authority 必须把 remote payload 当作不可信输入，先 decode/schema check，再应用到 demo state。
- Live connection、Room handle、message queue 和 peer presence 不作为可保存 gameplay state。
- Multiplayer Demo 可以验证 multiplayer package 的真实 backend 链路，但不承诺生产 matchmaking、账号、邀请、NAT traversal 或完整 reconnect。
