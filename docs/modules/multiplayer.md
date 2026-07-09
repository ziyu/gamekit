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
- 支持离线单机和本地测试复用同一条 authority / replication contract；local mode 不需要远程 backend，但不分叉玩法 action/input、tick、snapshot 和 diagnostics 路径。
- 支持多种权威模型：本地 host、权威 server、协作 peer、观战 client。
- 明确区分“已加入多人 session”和“gameplay state 已绑定到权威源”；连接成功不能自动代表游戏状态已同步。
- 提供标准 host/server authoritative action、input、snapshot、patch 和 result 组合边界，避免每个 app 手写多人同步骨架。
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
  - Authority binding and replication helper protocols
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
  - Provider-native capability bridges, such as Schema state sync, reconnect, matchmaker and room metadata diagnostics
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
- Backend adapter 不应把成熟 provider 压扁成纯 GameKit message transport。Colyseus Schema、Nakama match state、平台 session/reconnect 等 provider-native 能力应通过 backend package 的 capability bridge 暴露为受控 opt-in 路径，并同时提供 provider-neutral diagnostics / authority binding summary。
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
- `game.action`
- `game.input`
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

Capabilities 应区分两类能力：

- Core baseline capability：GameKit envelope、session/peer summary、authority binding、command/action/input/snapshot/patch/result helper 和 provider-neutral diagnostics。这些能力支撑跨 backend 的最小可用体验。
- Provider-native capability：Colyseus Schema state sync、Nakama match state、provider reconnect token、matchmaker、room metadata、load test 或平台联机特性。这些能力由 backend package 拥有，通过 typed native bridge 或 provider-specific adapter mapping 提供给显式选择该 backend 的 app/server/tooling。

完整可用的生产级多人能力通常需要同时使用这两层。Core baseline 负责防止伪多人和保持可替换边界；provider-native bridge 负责发挥成熟 backend 已经提供的高价值能力。GameKit 不把 provider-native 类型上推到 core，但也不能在 adapter 中把它们丢失。

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
- 离线单机使用 `local` authority mode。它可以在同一进程内运行 authority loop，但仍应经过同一 action/input、validation、tick boundary 和 snapshot/apply contract。

## Authority Binding

Multiplayer 必须显式表达 gameplay state 的权威来源。`connected`、`joined` 或 peer count 只能说明连接和 presence 已建立，不能说明一局游戏的 state 已经共享。

长期公共语义：

```ts
export type MultiplayerAuthorityBindingStatus =
  | "unbound"
  | "binding"
  | "bound"
  | "resyncing"
  | "rejected"
  | "closed";

export type MultiplayerAuthorityBinding = {
  sessionId: string;
  mode: MultiplayerAuthorityMode;
  status: MultiplayerAuthorityBindingStatus;
  authorityPeerId?: string;
  localPlayerId?: string;
  tick?: number;
  snapshotVersion?: string;
  reason?: string;
};
```

绑定规则：

- App/lobby/server host 显式创建或加入 session；GameModule 不隐式创建 room。
- 权威端可以是 host peer、dedicated server peer 或 provider server runtime。客户端必须知道当前接受哪个 authority endpoint 的 snapshot、patch 和 result。
- 离线单机也建立 authority binding，通常是 `mode: "local"`、`status: "bound"`、本地 player id 和本地 authority endpoint。它不需要 provider room、socket 或 remote presence，但仍使用同一 gameplay state contract。
- 客户端在 `bound` 前不能把 local simulation 当作联网 gameplay state；只能显示等待同步、观战、离线练习或本地预测缓存。
- Snapshot、patch 和 command result 默认只接受绑定 authority endpoint 的消息；来自其他 peer 的 state 写入必须被拒绝并进入 diagnostics。
- `peer.id` 到 `playerId`、slot、team、spectator 或 next-round participant 的映射必须由 authority binding 或权威 snapshot 声明，不能由 UI 临时推断。
- Leave、disconnect、reconnect、late join 和 room reset 必须更新 authority binding；旧 snapshot buffer、input queue 和 prediction cache 不能跨 binding 复用。

## Standard Authoritative Replication

Multiplayer core 不定义具体游戏玩法类型，但应提供标准权威复制组合边界，让 app 只填入自己的 payload schema、simulation 和 presentation。

推荐流程：

```txt
client action / input
→ envelope helper with session, peer, player, sequence, tick
→ authority endpoint
→ decode / schema / size / source validation
→ fixed tick or command boundary
→ app-owned simulation
→ authoritative snapshot / patch / result
→ client receiver source gate
→ presentation, prediction or interpolation
```

标准 helper 的职责：

- 为 action/input/snapshot/patch/result 提供 provider-neutral envelope、schema version、sequence、tick、correlation id 和 redaction hook。
- 为 local authority 提供 in-process delivery，使 offline singleplayer、unit test 和 local preview 可以复用同一 reducer/simulation/snapshot receiver，而不是创建第二套单机入口。
- 在 host/server side 维护 input queue、last accepted sequence、rejected reason、tick boundary 和 snapshot broadcaster 的通用骨架。
- 在 client side 维护 authority source gate、snapshot age、last applied tick、resync state 和 rejected non-authority payload diagnostics。
- 提供 snapshot presentation timing + declared track toolkit：core 维护按 tick/server time 排序的短期 snapshot playback、render delay/jitter window、under-run clamp、presentation FPS、sample status、stale/drop diagnostics、类型化插值原语和 `Network*` presentation track 投影；游戏自己声明可表现字段、track key、snap/reset policy，以及如何把底层算好的 presented value 写入 render-only snapshot。
- 提供 peer/player binding utilities，避免重复实现 duplicate peer、late join、disconnect 和 reconnect 映射。
- 提供 conformance tests，验证多 client 不会各自本地开局、非 authority snapshot 不会被应用、不同 session state 隔离、离开 peer 不继续阻塞 ready/start。

标准 helper 不拥有具体玩法：

- 游戏仍然定义 input frame、action type、simulation、collision、score、round lifecycle、snapshot shape 和 validation policy。
- Local authority 不等于绕过 multiplayer contract。它只是把 transport 替换为 in-process delivery，玩法 state 仍由 authority loop 推进，并通过 snapshot/patch/result 驱动 presentation。
- Provider-native state sync 仍可使用，例如 Colyseus Schema；但必须声明它是否是 authority source，并通过 typed native bridge 或 adapter mapping 暴露 provider-neutral diagnostics。
- Client prediction、reconciliation 和 interpolation 是表现层或可回滚缓存，不是 authority state。
- Backend adapter 不应 hard-code 具体游戏 interpolation。Colyseus、Nakama 等 provider 可以提供 state sync、server tick 和 snapshot/version source；GameKit core 提供 provider-neutral presentation timing、declared `Network*` track projection 与低成本 interpolation primitives；游戏或 demo 负责声明字段映射和 snap policy。

## Snapshot Presentation / Interpolation

Authoritative snapshot 通常以固定 tick 或 provider state update 到达，频率和 jitter 都不同于 renderer frame。Multiplayer 的 presentation 层必须把“权威状态”和“显示状态”分开：renderer 可以消费插值后的 render-only snapshot，但不能把 presented position、display rotation、预测缓存或平滑状态写回 authority state。

长期边界：

- Core 提供 temporal snapshot playback 和 declared track projection，而不是完整对象图插值器。Playback 接收带 `tick`、`serverTime` 或 provider version 的 authoritative snapshot，维护 render sampling clock、interpolation delay/jitter window、under-run clamp、presentation FPS，并采样出 `previous`、`next`、`alpha`、`status`、snapshot age、delay、dropped/stale count 等信息。遵循标准架构的游戏默认应使用 core playback、`createSnapshotPresentationProjector()` 或 App Host standard multiplayer presentation binding，而不是在 app 里重新实现播放时钟或每帧临时插值容器。
- Core 提供少量类型化、可组合、低分配的 interpolation primitives 和 `Network*` presentation track，例如 scalar、angle、vector2、vector3、quaternion/slerp 和 step/snap value。相关公共数据形状使用 `Network*` 命名，表示网络 snapshot / presentation value 的结构约束，不作为 GameKit 全局数学类型。Core 根据游戏声明的 track key 和 selector 输出 typed presented value；core 不递归遍历任意 snapshot object，不猜测字段语义，也不自动插值 boolean、enum、inventory、score、phase 或事件。高频路径应优先使用 `selectInto(writer)` 声明 track，并用 `vector2Into`、`vector3Into`、`quaternionInto` 等 direct-write getter 写入 caller-owned render target。
- 游戏或 app presentation 层拥有 track declaration 和最终写入：声明哪些 entity/field 可以插值、使用什么 primitive、什么时候 snap、什么时候允许短暂 extrapolate、什么时候因为 teleport、phase change、authority binding change、snapshot version change 或 resync 直接 reset，以及如何把底层算好的 presented value 写入 render-only snapshot 或 renderer object。
- 本地玩家 prediction / server reconciliation 与远端 entity interpolation 分开建模。Prediction 可以复用同一个 authoritative snapshot receiver 和 diagnostics，但不应被塞进 backend adapter 或通用 snapshot buffer 内部。
- Local/offline authority 也走同一 presentation contract。它可以使用更小或为零的 render delay，但不能绕过 snapshot/apply/presentation 路径去直接读写另一份单机显示状态。
- Backend adapter 只提供 provider-neutral snapshot/version/tick summary、source gate 和 provider-native capability bridge。Colyseus Schema、Nakama match state 等 provider-native state sync 可以成为 authoritative source，但 presentation policy 仍由 GameKit presentation layer 和游戏 track projection 决定。

性能约束：

- 不提供 deep generic interpolation、schema reflection 或按 frame 遍历整棵 gameplay snapshot 的默认实现。
- Track 数量、字段类型和 allocation 行为必须由调用方通过 declaration 显式控制；高频路径优先复用 projector、buffer、scratch object 或 renderer-specific write target。`presentSnapshotTracks()` 只作为小工具/测试的一次性便利用法，大规模 runtime loop 使用 reusable projector。
- Diagnostics 采样低频摘要，默认不展开完整高频 payload。

## Provider-Native Capability Bridge

成熟 backend 的强能力不进入 `multiplayer-core`，但 backend package 必须为完整可用场景保留受控接入口。典型能力包括：

- Provider-native state sync：Colyseus Schema、Nakama match state 或其他服务端状态同步。它可以作为 authority snapshot/patch 的来源，但必须通过 authority binding 标记 source、tick/version、resync 状态和 diagnostics。
- Reconnect / seat reservation：provider 可以持有 reconnect token、reservation、session resume hint。GameKit summary 只能暴露脱敏状态、过期时间和 slot/player binding 结果，不能保存 secret。
- Matchmaking / room listing / room metadata：provider 可以负责筛选、排队、分配区域和 room metadata。GameKit core 只消费最终 session summary，不定义完整 matchmaking UI 或社交模型。
- Provider diagnostics：load、transport、ping、drop、reconnect、room close reason 和 provider state size 可以通过 backend diagnostics 暴露。默认 diagnostics 必须脱敏，高频 payload 展开需要显式 opt-in。
- Native server/runtime bridge：app-specific server、工具或 DevTools plugin 可以显式导入 backend package 的 native bridge 使用 provider SDK 类型；可复用 gameplay module、DataType、Save 和 core facade 不能依赖这些类型。

接入规则：

- Provider-native state sync 与 GameKit envelope snapshot/patch 不能双写同一份 authority state。一个 app 必须声明当前 authoritative path，并把另一条路径降级为 diagnostics、summary 或迁移通道。
- Backend package 可以提供 provider-specific helper，例如 Colyseus Schema authority bridge；helper 输出应能连接到 GameKit authority binding、receiver diagnostics 和 conformance tests。
- 如果一个 provider 支持核心 baseline 之外的能力，adapter capabilities 应明确声明支持等级和限制；调用方必须按 capability 检测启用，而不是假设所有 backend 等价。
- 完整 backend adapter 测试除 core conformance 外，还应覆盖 provider-native bridge 的 source gate、resync、reconnect cleanup、room isolation、redaction 和 dispose。

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
- 建立 authority binding，并把 action/input/snapshot/patch/result 交给标准权威复制 helper 或 app-provided replication strategy。
- 拒绝非绑定 authority source 的 snapshot/patch/result，并记录 diagnostics。
- 触发 EventBus 低频事实，例如 `multiplayer.command.accepted`、`multiplayer.peer.disconnected`。
- 调用可插拔 replication contributor 捕获 snapshot 或 patch。
- 在 GameRuntime dispose 时清理订阅、队列和 trace buffer。

GameModule bridge 不负责创建连接、不弹出 lobby UI、不读取浏览器 URL、不直接调用 backend SDK。

## Replication

Multiplayer 不强制单一同步模型。成熟 backend 可以拥有自己的 state sync，例如 Colyseus Schema；GameKit 只在需要把 World/TCA/GAS/Camera 等状态接入 GameKit diagnostics、Save 或 provider-neutral summary 时使用 contributor。无论使用哪种同步模型，都必须先明确 authority binding，否则客户端不能应用 gameplay state。

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

- local authoritative loop：单机/offline 在同一进程内运行 authority loop，复用 action/input、validation、tick 和 snapshot/apply contract。
- command relay：只同步玩家命令，由权威端执行后广播结果。
- authoritative snapshot stream：权威端按固定 tick 或节流频率广播完整/分区 snapshot，客户端只应用绑定 authority source 的 snapshot。
- authoritative patch stream：权威端广播可版本化 patch，客户端按 tick/version 顺序应用并可请求 resync。
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
- Offline profile 可以用 local authority binding 启动同一套 GameModule bridge；不需要注册远程 backend service，但 diagnostics 仍应能说明当前是 local authority。

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
- 当前 authority binding 状态、authority peer/server、local player/slot、last applied tick 和 snapshot source。
- 本地 peer 与其他 peer 的 presence 状态。
- 最近连接、重连、断线、房间关闭原因。
- message 计数、队列长度、延迟摘要、丢弃/拒绝原因。
- command accept / reject / forward / apply 链路。
- snapshot / patch 的版本、大小、source gate、contributor、age 和应用结果。

默认 diagnostics 不记录完整 payload，不记录 secret，不把每帧网络包推入 React UI。深度 payload 展开必须由测试夹具或 DevTools 显式开启，并提供 redaction 策略。

## 安全边界

- 所有 remote payload 都按不可信输入处理，必须经过 schema/version/size 校验。
- 权威端必须重新验证 command 的玩家、tick、目标、资源消耗、冷却、位置和 DataRef。
- 客户端只能把绑定 authority endpoint 发来的 snapshot、patch 和 result 应用到联网 gameplay state。
- `connected`、`joined`、`peer count > 1` 或 presence message 不能作为 gameplay state 已同步的安全条件。
- `local` authority endpoint 是正式权威源；它可以没有网络连接，但仍必须经过同一 payload schema、tick boundary、snapshot/apply 和 diagnostics 路径。
- Runtime phase、session 和 peer 访问器必须反映 backend connection 的最新 snapshot；UI 权限不能依赖 stale `in-session` 缓存。
- backend adapter 不应把 access token、room secret、平台账号私有字段放入普通 snapshot、EventBus 或 Save。
- Client prediction 只能作为表现层或可回滚状态，不作为权威事实保存。
- 本地 memory backend 不代表生产安全模型；Colyseus/Nakama 等成熟 backend 仍需要按具体游戏设计 server-side validation。

## 反模式

- Gameplay system 直接 import Colyseus/Nakama/Steam SDK。
- GameRuntime 保存 socket、room、connection 或 provider-specific client。
- GameKit core 重新实现 Colyseus 已经负责的 room、matchmaker、reconnect、presence 或 state sync。
- Renderer/Input/UI 直接发送网络包并修改 world。
- UI 用 peer count 或 joined 状态判断“多人已跑通”，但 gameplay state 仍由每个客户端本地 simulation 独立推进。
- 为离线单机写一套独立 gameplay runtime，和 host/server authoritative runtime 各自维护 action、input、tick、snapshot 或 UI state。
- 浏览器 client 在联网 session 中直接 start/ready/tick 本地 authoritative state，而没有通过 host/server authority binding。
- Client 接受任意 peer 广播的 `game.snapshot` 或 `game.patch` 并覆盖本地联网状态。
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
- `host-authoritative` backend adapter 必须定义 authority host 离开后的 room lifecycle：默认关闭该 room 并断开剩余 client，除非明确实现 host migration 并更新 authority binding。
- Headless server app 应优先复用同一套 GameRuntime、Data、World、TCA/GAS、Save 和 DevTools 协议，只替换 renderer/input/UI 为空或测试实现。
- 新增 provider backend 时，先实现 core session/message/diagnostic 协议；provider-specific matchmaking、好友、邀请、房间属性和原生控制通过 typed native bridge 或 app-specific service 扩展。
- 多人协议变更必须同时考虑 Data schema、Save compatibility、DevTools redaction 和 server/client 版本协商。
- 接入 realtime game demo 或真实游戏时，优先使用 multiplayer core 的 authority binding / replication helper；只有 provider-native state sync 或特殊 netcode 需求明确时，才通过 typed native bridge 替换默认复制策略。
- 离线单机、local preview 和 multiplayer room 应共享 gameplay orchestration；差异应收敛为 authority endpoint 和 transport/delivery adapter，而不是分叉玩法代码。
- 多客户端 headless test 不能只断言 peer count；必须断言同一 lifecycle、input 或 snapshot 来自同一个 authority state。
- 改动多人高频路径时运行并按需扩展 `bench:multiplayer`。模块级 benchmark 应覆盖 envelope normalization、authority receiver source gate、host/local authority loop、snapshot playback 和 presentation projection；provider-native backend 可在对应 adapter 包中补独立 benchmark。

### 模块使用

- 游戏代码发送语义命令，不发送 backend frame。命令应小、可序列化、可验证，并能关联 tick、peer、player 和 correlation id。
- 线上权威玩法默认使用 host/server validation；客户端预测只影响本地表现，不直接写入长期权威状态。
- 使用 core snapshot playback、declared `Network*` presentation tracks 或明确的 presentation cache 连接 authoritative snapshot 和 renderer frame；通过 App Host standard multiplayer module 启动的游戏，应优先把 latest authoritative snapshot source、track declaration 和 apply hook 挂到 module presentation binding，让底层随 GameRuntime tick 自动推进 playback 并产出 typed presented values。不要让 renderer 直接按低频网络 tick 跳变，不要在 app 层重复实现通用 playback clock，也不要把 presented position 写回 authority state。
- UI 和 gameplay 代码应读取 authority binding / last authoritative snapshot 来决定是否显示联网游戏状态；未绑定时只能显示连接中、观战、离线练习或等待同步。
- 单机 UI 也应读取 local authoritative snapshot，而不是直接读写另一份 mutable gameplay state。
- 本地 simulation 在联网模式中只能作为 prediction/interpolation cache，必须能被 authority snapshot 校正或丢弃。
- 复制状态按 contributor 分区，避免把完整 world、renderer object tree、React state 或 adapter cache 作为默认同步单位。
- EventBus 只记录多人低频事实，不广播每个网络包或每帧状态 patch。
- DevTools 中查看 payload 时要默认脱敏，尤其是 token、账号标识、IP、邀请 code 和私有房间 metadata。
