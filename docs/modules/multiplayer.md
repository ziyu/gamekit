# Multiplayer 模块设计

本文档只描述 Multiplayer 的长期模块设计，不记录当前实现状态、阶段计划或 TODO。具体工作流状态放在任务系统、PR 或 `../implementation/`。

## 定位

Multiplayer 负责把成熟多人 backend 接入 GameKit 的稳定组合边界：App Host 管连接服务，GameModule bridge 管 gameplay command、authority decision、低频事实和可观察 diagnostics。它让同一个游戏可以在 Colyseus、Nakama、PartyKit、平台联机 SDK 或测试替身之间切换，而不让 gameplay 代码直接绑定某个网络 SDK。

相关包：

- `@gamekit/multiplayer-core`
- `@gamekit/multiplayer-memory`
- `@gamekit/multiplayer-colyseus`

后端包按 `@gamekit/multiplayer-<backend>` 命名。Memory backend 是测试替身和本地 loopback fixture，不代表生产后端。Colyseus 是首个真实成熟 backend adapter。Nakama、PlayFab、Steam、Epic Online Services、PartyKit、Cloudflare Durable Objects 等托管或平台能力应作为各自 backend adapter 接入，而不是进入 core。

## 设计目标

- 提供 GameKit 侧最小多人 facade：connect / create-or-join / leave / send command / observe snapshot。
- 支持多 backend：Colyseus、Nakama、PartyKit、平台联机服务和测试替身。
- 区分应用级连接服务和游戏会话模块：连接、房间、presence 属于 App Service；命令入站、状态复制、authority gate 属于 GameModule bridge。
- 支持多种权威模型：本地 host、权威 server、协作 peer、观战 client。
- 支持低频事实 trace 和可采样网络 diagnostics。
- 支持 headless server app，服务端可以复用 Data、World、TCA、GAS、Save 和 DevTools。
- 不自研通用 room server、matchmaker、reconnect engine、presence store、transport codec、state sync engine 或 production WebSocket server。
- 不让第三方网络 SDK、socket 对象或 provider-specific payload 泄漏进 core facade、DataType、Save payload 或可复用 gameplay module。

## 非目标

- 不实现完整通用 MMO server、账号系统、社交图谱、商店、排行榜或平台成就。
- 不把 matchmaking、lobby UI、好友列表或邀请 UI 固化为核心协议；core 只保留会话和 presence 的窄协议。
- 不假设所有游戏都需要 rollback netcode、lockstep 或完整 world diff。它们是可选同步策略，不是 core 默认行为。
- 不保存 socket、room handle、第三方 SDK object 或临时网络队列。
- 不把客户端命令视为可信事实。多人线上模式下，权威校验必须发生在 host/server 或明确的 authority policy 中。
- 不把 raw WebSocket adapter 当作首个生产方向；raw transport 只能作为成熟 backend 内部实现或实验。

## 包拆分

```txt
@gamekit/multiplayer-core
  - GameKit MultiplayerFacade / service shape
  - Game command envelope and result protocol
  - Authority policy types
  - Command bridge helpers
  - Trace / diagnostics snapshot
  - Adapter conformance helpers

@gamekit/multiplayer-memory
  - In-process test backend
  - Loopback fixture
  - Deterministic bridge/conformance harness

@gamekit/multiplayer-colyseus
  - Colyseus client adapter
  - Colyseus Room / state / message mapping, including deterministic GameKit session id to provider room id mapping
  - Local Colyseus server harness for tests and standalone demo apps
  - Typed native bridge for app-specific Colyseus server/runtime usage
```

Backend adapter 可以依赖其拥有的第三方 SDK 或 server framework。`@gamekit/multiplayer-core` 不依赖 WebSocket、Colyseus、Nakama、Steam、EOS、Tauri、React、Phaser 或 Node-only socket 库。

## 分层

```txt
App Host service
  -> MultiplayerFacade
  -> MultiplayerBackendAdapter
  -> mature backend SDK / room / provider runtime

GameRuntime module
  -> Multiplayer GameModule bridge
  -> command ingress / egress
  -> authority policy
  -> world snapshot / replicated state contributors
  -> EventBus trace facts
```

MultiplayerFacade 是 App Service，因为它管理连接 facade、room lifecycle summary、backend handle、低频诊断和 provider snapshot。真实 reconnect、matchmaking、presence 和 state sync 由成熟 backend 拥有。Multiplayer GameModule bridge 是 GameModule，因为它需要参与 tick、读取 EventBus、调度命令、写入 World 或读取 gameplay context。

GameRuntime 不直接拥有 socket、room、backend client 或 server handle。App Host 负责创建 MultiplayerFacade，并把它作为 service 注入标准 GameModule helper。

## Multiplayer Facade

建议公共形态：

```ts
export type MultiplayerFacade = {
  id: string;
  backendId: string;
  phase: MultiplayerPhase;

  createOrJoinSession(request: MultiplayerSessionRequest): Promise<MultiplayerSession>;
  leaveSession(reason?: string): Promise<void>;
  reconnect?(request?: ReconnectSessionRequest): Promise<MultiplayerSession>;

  send(message: MultiplayerOutgoingMessage): Promise<void>;
  subscribe(listener: MultiplayerMessageListener): () => void;

  peers(): MultiplayerPeer[];
  localPeer(): MultiplayerPeer | undefined;
  session(): MultiplayerSession | undefined;
  snapshot(): MultiplayerSnapshot;
  dispose(): Promise<void> | void;
};
```

生命周期语义：

- `createOrJoinSession()` 由 app、lobby UI、测试夹具或 server host 调用，不由 gameplay system 隐式调用。
- `send()` 发送的是 GameKit multiplayer envelope，不发送 backend 私有对象。
- `subscribe()` 只接收归一化消息；backend adapter 内部负责把 Colyseus Room message、Nakama socket event 或其他 provider event 转成稳定协议。
- `snapshot()` 返回低频诊断摘要，不包含完整敏感 payload、认证 token 或 socket 私有句柄。
- `dispose()` 释放订阅、连接 facade 和 backend runtime handle；真实 provider cleanup 由 adapter 委托给对应 SDK。

## Backend Adapter

Backend Adapter 把具体成熟多人后端映射为 GameKit 稳定 facade。

```ts
export type MultiplayerBackendAdapter = {
  id: string;
  kind: string;
  capabilities: MultiplayerBackendCapabilities;

  connect(ctx: MultiplayerBackendConnectContext): Promise<MultiplayerBackendConnection>;
  native?(): unknown;
  snapshot(): MultiplayerBackendSnapshot;
};

export type MultiplayerBackendConnection = {
  createOrJoinSession(request: MultiplayerSessionRequest): Promise<MultiplayerSession>;
  leaveSession(reason?: string): Promise<void>;
  send(message: MultiplayerOutgoingMessage): Promise<void>;
  subscribe(listener: MultiplayerBackendListener): () => void;
  close(reason?: string): Promise<void> | void;
  snapshot(): MultiplayerConnectionSnapshot;
};
```

边界规则：

- Backend Adapter 拥有第三方 SDK、socket、room、server worker、matchmaker、state sync 或平台联机 runtime。
- Core 只理解 adapter capabilities、session summary、peer summary、semantic message、diagnostics 和 native boundary，不理解 provider-specific API。
- backend-specific package 可以导出 typed native bridge，供 app-specific lobby、平台工具或 server orchestration 使用；这些类型不能进入 core facade、DataType、Save payload 或可复用 gameplay module。
- 同一个后端连接只由一个 MultiplayerFacade 拥有。GameModule 不直接保存 backend connection。

## Session / Peer

```ts
export type MultiplayerSession = {
  id: string;
  kind: "local" | "private" | "public" | "matchmade" | string;
  authority: MultiplayerAuthorityMode;
  status: "creating" | "open" | "starting" | "running" | "closed";
  peers: MultiplayerPeer[];
  metadata?: Record<string, unknown>;
};

export type MultiplayerPeer = {
  id: string;
  displayName?: string;
  role?: "host" | "server" | "client" | "spectator" | string;
  status: "joining" | "connected" | "ready" | "disconnected" | "left";
  playerId?: string;
  metadata?: Record<string, unknown>;
};
```

`peer.id` 是一次 multiplayer session 内的稳定网络参与者 id；`playerId` 可以映射到游戏自己的 profile、platform account 或 save identity。账号、好友、权限和社交关系不进入 multiplayer-core 顶层协议，由 app/platform/account service 或具体 backend native bridge 处理。

## Message Envelope

GameKit 侧语义消息必须可序列化、可追踪、可版本化。Provider 可以有自己的 message、state patch 或 binary frame；adapter 只把 GameKit bridge 需要的语义消息和 summary 暴露出来。

```ts
export type MultiplayerMessageEnvelope<TPayload = unknown> = {
  id: string;
  sessionId: string;
  channel: MultiplayerChannelId;
  kind: MultiplayerMessageKind;
  sourcePeerId: string;
  targetPeerIds?: string[];
  sequence?: number;
  tick?: number;
  schemaVersion?: string;
  correlationId?: string;
  timestamp: number;
  payload: TPayload;
};
```

常见 `kind`：

- `peer.presence`
- `session.control`
- `game.command`
- `game.command.result`
- `game.snapshot`
- `game.patch`
- `game.event`
- `debug.trace`

Channel 表达可靠性和顺序语义：

```ts
export type MultiplayerChannel = {
  id: string;
  reliability: "reliable" | "unreliable";
  ordering: "ordered" | "unordered";
  priority?: number;
  maxPayloadBytes?: number;
};
```

Adapter 应在 capabilities 中如实声明 provider 能力。调用方不能假设所有 backend 都支持低延迟不可靠 datagram、server-authoritative tick、state sync、matchmaking 或 reconnect。

## Authority

Multiplayer core 只定义 GameKit 侧 authority decision，不把具体玩法校验或 provider-specific access control 写进核心。

```ts
export type MultiplayerAuthorityMode =
  | "local"
  | "host-authoritative"
  | "server-authoritative"
  | "peer-cooperative"
  | "spectator";

export type MultiplayerAuthorityDecision =
  | { allowed: true; reason?: string }
  | { allowed: false; code: string; reason: string };
```

原则：

- 客户端发送的是请求、输入或命令，不是最终事实。
- 权威 host/server 决定命令是否接受、何时执行、如何广播结果。
- 可复用 gameplay module 只依赖 authority decision 和 command result，不依赖 provider-specific room state。
- 单机、本地联机和测试可以使用宽松 policy；线上对抗或经济相关玩法必须使用 server-authoritative policy。

## GameModule Bridge

Multiplayer GameModule bridge 把 App Service 的连接事实接入 GameRuntime：

```txt
backend message
→ MultiplayerFacade
→ GameModule bridge
→ decode game command / snapshot / patch
→ authority policy
→ command queue / system / EventBus
→ accepted result / replicated patch
→ MultiplayerFacade.send(...)
```

职责：

- 订阅 MultiplayerFacade 消息。
- 把 `game.command` 放入确定性队列，并在 tick 边界处理。
- 根据 authority policy 接受、拒绝或转发命令。
- 触发 EventBus 低频事实，例如 `multiplayer.command.accepted`、`multiplayer.peer.disconnected`。
- 调用可插拔 replication contributor 捕获 snapshot 或 patch。
- 在 GameRuntime dispose 时清理订阅、队列和 trace buffer。

GameModule bridge 不负责创建连接、不弹出 lobby UI、不读取浏览器 URL、不直接调用 backend SDK。

## Replication

Multiplayer 不强制单一同步模型。成熟 backend 可以拥有自己的 state sync，例如 Colyseus Schema；GameKit 只在需要把 World/TCA/GAS/Camera 等状态接入 GameKit diagnostics、Save 或 provider-neutral summary 时使用 contributor。

```ts
export type MultiplayerReplicationContributor<TSnapshot = unknown, TPatch = unknown> = {
  id: string;
  version: string;
  order?: number;
  captureSnapshot(ctx: MultiplayerSnapshotContext): TSnapshot | undefined;
  capturePatch?(ctx: MultiplayerPatchContext): TPatch | undefined;
  applySnapshot?(snapshot: TSnapshot, ctx: MultiplayerApplyContext): void;
  applyPatch?(patch: TPatch, ctx: MultiplayerApplyContext): void;
};
```

长期可支持的 GameKit 层策略：

- command relay：只同步玩家命令，由权威端执行后广播结果。
- state summary：低频发送稳定 summary，用于 DevTools、观战摘要或重连后的应用层校验。
- provider state mapping：把 Colyseus Schema、Nakama match state 或其他 provider state 映射成 GameKit summary。
- deterministic lockstep：只同步输入/命令和 tick，要求游戏自己保证确定性。
- rollback：由具体游戏或后续专用 toolkit 提供；core 只保留 tick、sequence、snapshot 和 authority 入口。

World、GAS、TCA、Camera 或游戏自定义模块可以各自提供 contributor。Multiplayer core 不直接理解 Koota object、Phaser object、React state、Colyseus Schema class 或具体游戏组件。

## 与 App Host 的关系

App Host 可以把 MultiplayerFacade 作为标准可选服务：

```txt
platform / config / auth
→ multiplayer backend adapter, such as Colyseus
→ multiplayer facade service
→ game service installs multiplayer GameModule bridge
→ devtools source observes multiplayer facade
```

标准组合中，`services.multiplayer` 暴露连接 facade；`profile.standard.game.standardModules.multiplayer` 安装 GameModule bridge，把入站 command 放到 GameRuntime tick 边界处理。二者必须保持分离：App Host service 管 provider connection lifecycle，GameModule bridge 管 gameplay command lifecycle。

典型依赖：

- Platform / config 提供 endpoint、room name、region、environment 和权限信息。
- App/account service 提供 player identity 或 access token；Multiplayer core 不长期保存 secret。
- Data 可以提供命令 schema、replication profile 或 game mode definition。
- Save 可以保存可恢复的长期玩家映射或 replay metadata，但不保存 live connection。
- DevTools 观察 session、peer、message summary、latency、provider reconnect 和 command result。

## 与 Input / TCA / GAS 的关系

推荐流程：

```txt
Input Action
→ local command
→ Multiplayer command bridge
→ authority policy / server validation
→ GameRuntime system or EventBus fact
→ TCA / GAS responds
→ replication result
```

Input 不直接发 socket frame；TCA/GAS 不直接读取 backend room；server validation 不写在 client-only UI 中。

## 与 Save 的关系

普通进度存档不保存 live multiplayer connection。可保存的内容应限制在长期事实：

- 本地 playerId 到游戏角色或 profile 的映射。
- session resumability metadata，例如 backend session id 或 reconnect hint，且不包含 secret token。
- replay / match record 的稳定 metadata。
- contributor snapshot 中明确声明可恢复的 gameplay 状态。

临时 presence、ping、未确认消息、socket handle、SDK room object 和认证 token 不进入 Save payload。

## Diagnostics

Multiplayer diagnostics 应回答：

- 当前 backend、session、phase 和 authority mode。
- 本地 peer 与其他 peer 的 presence 状态。
- 最近连接、重连、断线、房间关闭原因。
- message 计数、队列长度、延迟摘要、丢弃/拒绝原因。
- command accept / reject / forward / apply 链路。
- snapshot / patch 的版本、大小、contributor 和应用结果。

默认 diagnostics 不记录完整 payload，不记录 secret，不把每帧网络包推入 React UI。深度 payload 展开必须由测试夹具或 DevTools 显式开启，并提供 redaction 策略。

## 安全边界

- 所有 remote payload 都按不可信输入处理，必须经过 schema/version/size 校验。
- 权威端必须重新验证 command 的玩家、tick、目标、资源消耗、冷却、位置和 DataRef。
- backend adapter 不应把 access token、room secret、平台账号私有字段放入普通 snapshot、EventBus 或 Save。
- Client prediction 只能作为表现层或可回滚状态，不作为权威事实保存。
- 本地 memory backend 不代表生产安全模型；Colyseus/Nakama 等成熟 backend 仍需要按具体游戏设计 server-side validation。

## 反模式

- Gameplay system 直接 import Colyseus/Nakama/Steam SDK。
- GameRuntime 保存 socket、room、connection 或 provider-specific client。
- GameKit core 重新实现 Colyseus 已经负责的 room、matchmaker、reconnect、presence 或 state sync。
- Renderer/Input/UI 直接发送网络包并修改 world。
- 把 `peer.connected`、ping 或 pointer move 这类高频/临时状态当作长期玩法事实保存。
- Save payload 内保存 access token、room handle 或 provider SDK object。
- Client 直接广播 `world.patch` 并让其他 client 无校验应用到权威状态。
- Multiplayer core 维护一个无限扩展的 backend capability catalog，试图包装每个服务商的全部能力。
- 为了“统一”而把 Colyseus Schema、Nakama match state 或 provider account model 抽象成一套过大的 GameKit 自研多人模型。

## 最佳实践

### 模块集成

- App Host 负责 MultiplayerFacade lifecycle；GameRuntime 只通过 GameModule bridge 消费连接事实。
- Backend adapter 必须通过 core conformance tests，至少覆盖 connect、create-or-join/leave、peer summary、message routing、disconnect、dispose 和 snapshot。
- 优先接入成熟多人 backend，再按需补 provider adapter。不要从 raw WebSocket 开始扩展 GameKit 自己的多人核心。
- 需要按 GameKit session id 加入指定 room 的 adapter，必须保证不同 backend 实例能解析到同一个 provider room；fallback 不能加入同 room type 下的任意可用房间。
- Headless server app 应优先复用同一套 GameRuntime、Data、World、TCA/GAS、Save 和 DevTools 协议，只替换 renderer/input/UI 为空或测试实现。
- 新增 provider backend 时，先实现 core session/message/diagnostic 协议；provider-specific matchmaking、好友、邀请、房间属性和原生控制通过 typed native bridge 或 app-specific service 扩展。
- 多人协议变更必须同时考虑 Data schema、Save compatibility、DevTools redaction 和 server/client 版本协商。

### 模块使用

- 游戏代码发送语义命令，不发送 backend frame。命令应小、可序列化、可验证，并能关联 tick、peer、player 和 correlation id。
- 线上权威玩法默认使用 host/server validation；客户端预测只影响本地表现，不直接写入长期权威状态。
- 复制状态按 contributor 分区，避免把完整 world、renderer object tree、React state 或 adapter cache 作为默认同步单位。
- EventBus 只记录多人低频事实，不广播每个网络包或每帧状态 patch。
- DevTools 中查看 payload 时要默认脱敏，尤其是 token、账号标识、IP、邀请 code 和私有房间 metadata。
