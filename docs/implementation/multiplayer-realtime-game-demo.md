# Multiplayer Realtime Game Demo

Status: Active; planning only.

## Goal

把现有 `apps/multiplayer-demo` 从低频 loopback console 演进为一个真正考验多人能力的实时游戏 demo。目标不是做一个完整商业游戏，而是在独立 app 中用真实 Colyseus backend 验证多人模块最容易出问题的长链路：

- 多窗口玩家同时移动和交互。
- 客户端持续发送输入，而不是偶发按钮命令。
- host/server authority 以固定 tick 模拟世界。
- 客户端通过 snapshot interpolation 和本地预测获得可玩手感。
- 迟到加入、离开、断线、无效输入、房间隔离和诊断都可观察、可测试。

长期设计事实仍以以下文档为准：

- `docs/modules/multiplayer.md`
- `docs/apps/multiplayer-demo.md`
- `docs/architecture.md`
- `docs/best-practices.md`
- `docs/adr/0012-mature-multiplayer-backend-adapter.md`

本文件只记录执行规划，不作为长期协议来源。实现时若改变 app 长期体验或 package 公共 API，需要同步更新对应长期文档或补 ADR。

## Demo Concept

建议玩法：`Relay Arena`。

玩家进入一个小型俯视角 arena，每个玩家控制一个单位，在地图中争夺能量球并送回己方 relay node。地图包含墙体、能量球、危险区和短冷却冲刺。这个玩法足够小，但能覆盖多人实时游戏的关键问题：

- 持续方向输入：移动、冲刺、交互。
- 权威碰撞：玩家不能穿墙、不能伪造拾取距离。
- 共享目标：多个玩家争夺同一个能量球。
- 低频事实：得分、拾取、交付、拒绝、round end。
- 高频状态：位置、速度、朝向、cooldown、carry state。
- 迟到加入：新窗口能拿到当前 arena snapshot。

第一版推荐支持 2-4 个 browser clients，同一机器多窗口即可验证。Host 可以继续由 dev server 托管，不需要把 host 放进某个浏览器窗口。

## Architecture Direction

### Responsibility Split

```txt
Browser input
  -> realtime client input sampler
  -> Colyseus message / GameKit multiplayer facade
  -> server-hosted fixed tick simulation
  -> authoritative arena snapshot
  -> client interpolation / prediction
  -> canvas presentation + diagnostics
```

职责边界：

- `multiplayer-core` 继续只提供 session、message envelope、bridge、authority 和 diagnostics，不引入 Colyseus state schema 或游戏玩法类型。
- `multiplayer-colyseus` 继续持有 Colyseus client/server/runtime；如果需要高频 state sync，应通过 backend package 的 typed native bridge 或 app-local helper 使用，不能泄漏进 core。
- `apps/multiplayer-demo` 可以有 app-local realtime domain、Colyseus room state、canvas presentation 和调试 UI。
- GameRuntime bridge 继续用于低频 `game.command`、authority facts、event trace 和 round-level state change；高频 transform 不进入 EventBus。
- 高频玩家输入和 snapshot 需要独立于 DOM UI render loop，UI 只消费节流后的 summary。

### State Sync Choice

推荐采用混合路径：

- 高频 arena state：优先使用 Colyseus 自身 state sync 或 app-local Colyseus message stream，由 app-specific typed native path 持有。
- 低频语义事实：继续使用 GameKit `MultiplayerMessageEnvelope`，例如 `game.event`、`game.command.result`、`debug.trace`。
- Diagnostics：GameKit snapshot 展示 backend、session、peers、sent/received、rtt、snapshot age、input queue、rejected inputs。

这样能真正考验成熟 backend 的实时能力，同时保持 GameKit core 薄内核。如果后续决定把 state sync helper 做成可复用 package API，需要单独 ADR。

## Gameplay Contract

### Input

客户端以固定频率发送 compact input frame：

```ts
type RealtimeInputFrame = {
  sequence: number;
  clientTime: number;
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  sprint: boolean;
  interact: boolean;
};
```

规则：

- Browser 每帧采样键盘，但以 15-30Hz 合并发送 input frame。
- Input frame 只表示意图，不是事实。
- 服务端按 peer id 维护最后输入序号，丢弃重复、倒序或超频输入。
- 不信任 client timestamp，只用于诊断和延迟估算。

### Simulation

服务端或 host runtime 使用固定 tick，例如 20Hz 或 30Hz：

- 读取每个 peer 最新输入。
- 更新 velocity、position、cooldown、carry state。
- 执行墙体碰撞、拾取距离、交付距离、危险区伤害。
- 生成 authoritative snapshot。
- 低频事件写入 EventBus 并广播语义结果。

客户端可以做 local prediction，但最终以 authoritative snapshot 校正。

### Replication

第一版 snapshot 足够小，可以按 10-20Hz 广播：

```ts
type ArenaSnapshot = {
  tick: number;
  serverTime: number;
  players: PlayerSnapshot[];
  cores: CoreSnapshot[];
  score: Record<string, number>;
  round: "waiting" | "running" | "ended";
};
```

客户端处理：

- 本地玩家：预测位置，并用 server ack 进行轻量校正。
- 远端玩家：snapshot buffer + interpolation。
- 迟到加入：收到完整 authoritative snapshot 后进入 running view。
- snapshot age、interpolation delay 和 correction magnitude 必须可见。

## UX Shape

首屏应直接是可玩的 arena，不是说明页。

推荐布局：

- 主区域：全屏或大面积 canvas arena。
- 左上角：room、peer、team、score、round timer。
- 右上角：network diagnostics，包含 rtt、snapshot age、input seq、correction、active peers。
- 底部：小型 event feed，显示 pickup、deliver、reject、disconnect。
- 房间控制：保留紧凑的 room input、Host Room、Join、Leave、Reset，不占用玩法区域。

交互：

- WASD / Arrow 移动。
- Space sprint。
- E interact / pickup / deliver。
- UI 文本输入聚焦时 input scope 应阻止 gameplay input。

## Validation Targets

这个 demo 达标时，应能回答以下问题：

- 两个窗口同时移动时，双方都能看到彼此连续移动，而不是按钮式状态跳变。
- 一个客户端伪造过快移动或超远拾取时，host 拒绝，host state 不被污染。
- 玩家离开后，active peer count 下降，arena actor 被移除或标记离线。
- 第二个 room 的玩家、score、core state 与第一个 room 完全隔离。
- 迟到加入能看到当前比分、玩家位置和能量球状态。
- 断开重连后可以恢复为同一个 player slot，或明确作为新 peer 加入；行为必须稳定可见。
- 高频 state 不进入 Save payload，不进入 EventBus 全量日志，不导致 DOM 每 tick 重建。
- Diagnostics 能显示 rtt、snapshot age、input send rate、server tick rate、rejected input count。

## Implementation Waves

### Wave 0: Pure Realtime Domain

Status: Planned.

目标：先把实时玩法核心做成纯函数/小 runtime，不碰浏览器 UI。

任务：

1. 新增 `apps/multiplayer-demo/src/realtime/domain`，定义 arena state、input frame、snapshot、events。
2. 实现 fixed tick simulation：movement、collision、pickup、deliver、cooldown。
3. 实现 authority validation：sequence、rate limit、bounds、schema、role。
4. 添加 deterministic tests，覆盖移动、碰撞、拾取、交付、非法输入和多玩家竞争同一 core。

验收：

- 不启动 Colyseus 也能用测试验证 gameplay 规则。
- 同样 input log 每次产生同样 snapshot。

### Wave 1: Server-Authoritative Colyseus Loop

Status: Planned.

目标：把纯 simulation 接入本地 Colyseus server，形成真实 backend 的实时输入和 snapshot 链路。

任务：

1. 为 realtime arena 创建 app-local Colyseus room host 或扩展现有 local demo server。
2. Browser client join 后分配 player slot。
3. Client 以固定频率发送 `RealtimeInputFrame`。
4. Host 以固定 tick 消费输入并广播 authoritative snapshot。
5. 保留 GameKit envelope 用于低频 event/result/diagnostics。

验收：

- Headless test 可以启动一个 server、两个 clients，持续发送输入 2 秒，并验证双方位置和 score。
- 无效输入不会改变 authoritative state，并产生 rejected diagnostics。

### Wave 2: Canvas Playable Arena

Status: Planned.

目标：把 demo 首屏改成可玩的 arena，而不是按钮控制台。

任务：

1. 新增 canvas presentation，不引入 renderer package 依赖。
2. 添加 input scope：room input 聚焦时 gameplay input 不触发。
3. 渲染玩家、能量球、墙体、relay node、危险区和简单 trail。
4. 添加 compact HUD 和 network panel。
5. 保留 room host/join/reset 控制，但压缩为工具栏。

验收：

- 两个浏览器窗口输入同一 room 后能同时操作不同玩家。
- 页面没有 HTML 字符串拼接；交互 UI 保持 DOM API + `textContent` / `replaceChildren`。
- Canvas 更新不触发 React/DOM 每帧重建。

### Wave 3: Prediction, Interpolation, Diagnostics

Status: Planned.

目标：让 demo 能观察真实多人手感问题，而不是只看到最终状态。

任务：

1. 为本地玩家添加 input prediction 和 server correction。
2. 为远端玩家添加 snapshot interpolation buffer。
3. 添加 artificial latency/jitter/loss 开关，只影响 demo client path。
4. 展示 rtt、snapshot age、input seq ack、correction magnitude、server tick drift。
5. 增加 forged input/debug controls，用于验证 authority。

验收：

- 开启人工延迟后，远端玩家仍平滑移动，本地玩家能被 authority 校正。
- Diagnostics 能解释“为什么抖动、为什么被回滚、为什么输入被拒绝”。

### Wave 4: Hardening And Documentation

Status: Planned.

目标：把实时 demo 变成可长期维护的 multiplayer dogfood。

任务：

1. 更新 `docs/apps/multiplayer-demo.md` 的长期体验设计。
2. 若抽出新的 Colyseus state sync helper，补 `docs/adr/`。
3. 扩展 `multiplayer-demo` headless tests 和 browser smoke。
4. 确认 package README 不把 app-local realtime type 描述成 core 协议。
5. 记录最终验证命令和提交。

验收：

- `corepack pnpm --filter multiplayer-demo test`
- `corepack pnpm --filter multiplayer-demo build`
- `corepack pnpm --filter multiplayer-demo lint`
- `corepack pnpm test`
- `corepack pnpm build`
- `corepack pnpm lint`
- `corepack pnpm format`
- Browser smoke：两个窗口同房间实时移动、不同房间隔离、迟到加入、离开、非法输入拒绝。

## Test Matrix

| Area           | Required tests                                                                 |
| -------------- | ------------------------------------------------------------------------------ |
| Simulation     | deterministic movement, collision, pickup, deliver, cooldown, tie resolution   |
| Authority      | duplicate sequence, backwards sequence, out-of-bounds move, forged pickup      |
| Transport      | two clients input stream, snapshot delivery, active peer cleanup, room isolate |
| Client runtime | interpolation buffer, prediction correction, stale snapshot handling           |
| Browser smoke  | two windows same room, second room isolation, input scope, HUD metrics         |

## Non-Goals

- 不实现公网部署、账号、邀请、matchmaking、排行榜或 NAT traversal。
- 不承诺 rollback netcode、lockstep 或完整 world diff。
- 不把 realtime arena 的玩家、能量球、score、input frame 上推到 `multiplayer-core`。
- 不让 Save 保存 socket、Room handle、input queue、snapshot buffer 或 transient actor prediction state。
- 不把这个 demo 变成 Sandbox 玩法；它仍属于 `apps/multiplayer-demo`。

## Open Decisions

- 高频 state 使用 Colyseus Schema state sync，还是先用 app-local snapshot message stream。
- Server tick 选 20Hz 还是 30Hz；snapshot broadcast 选 10Hz、15Hz 还是 20Hz。
- 第一版是否支持同 peer reconnect 到原 player slot，还是明确作为新 peer 加入。
- Canvas presentation 是否保持纯 DOM/canvas，还是后续 dogfood renderer-core。
- 是否需要在 `@gamekit/multiplayer-colyseus` 增加 app-facing typed state sync helper。
