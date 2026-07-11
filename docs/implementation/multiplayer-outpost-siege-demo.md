# Multiplayer Outpost Siege Demo

Status: Planned on 2026-07-11; implementation has not started.

## Goal

新增一个独立的复杂多人验证应用 `apps/multiplayer-outpost-siege-demo`，用真实、持续、可扩展的游戏负载综合验证 GameKit Multiplayer 的架构能力、体验质量和性能边界。

这个工作流不是继续扩展 Relay Arena，也不是把 Demo 玩法上推成框架协议。Relay Arena 继续承担最小可用 multiplayer baseline、跨 backend envelope conformance 和回归验证；Outpost Siege 专门承担以下更重的系统验证：

- Colyseus Room 自己持有 headless authoritative runtime，不再由某个 browser host peer 决定服务器模拟的存续。
- Browser 通过 App Host 挂载 Multiplayer、Driver、Input、Camera、Renderer 和 DevTools，验证标准组合路径。
- 高频状态使用 app-owned、字段级 Colyseus Schema，而不是把完整 snapshot 编码成单个 JSON carrier。
- 本地玩家 prediction/reconciliation、远端对象 presentation、spawn/despawn、teleport 和 generation change 由底层标准能力处理。
- 在大量玩家、敌人、投射物、建筑和掉落物下测量真实 server tick、Schema patch、网络流量、客户端 frame、GC、队列和长期内存。
- 用 late join、spectator、disconnect、reconnect、explicit leave 和 room close/recreate 验证完整参与者生命周期。

长期设计事实仍以以下文档为准：

- `docs/project-design.md`
- `docs/architecture.md`
- `docs/modules/multiplayer.md`
- `docs/modules/app-host.md`
- `docs/modules/driver.md`
- `docs/modules/devtools.md`
- `docs/modules/physics.md`
- `docs/best-practices.md`
- `docs/adr/0013-standard-authoritative-replication-boundary.md`
- `docs/adr/0014-multiplayer-presentation-temporal-buffer.md`
- `docs/adr/0015-colyseus-schema-authority-carrier.md`

本文件只记录这次工作流的范围、决策门、实施波次和验证证据。实现形成新的长期协议、公共 API 或 package 边界时，必须同步更新对应模块文档并新增 ADR。

## Why A Separate Demo

现有 `apps/multiplayer-demo` 已经适合验证 2-4 个玩家、少量共享对象、两条 authority lane 和基础 prediction/presentation。继续在同一个应用中堆叠 AI 群、建筑、复杂生命周期和负载工具会让最小回归样例失去可读性，也会把 baseline lane 与 provider-specific optimization 混在一起。

因此保留两个职责不同的应用：

| 应用          | 主要职责                                                                                    | 高频同步路径                                           |
| ------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Relay Arena   | 最小可用闭环、envelope conformance、local authority、基础 prediction/presentation 回归      | GameKit envelope 或通用 Schema carrier，单局只能选一条 |
| Outpost Siege | Room-owned authority、字段级 Schema、大量实体、App Host/Driver/DevTools、真实网络和性能门禁 | app-owned Colyseus Schema                              |

Outpost Siege 仍可用 memory/in-process fixture 做确定性测试，但浏览器正式路径不需要再增加一套完整 snapshot runtime toggle。低频语义事实继续使用 GameKit envelope；同一份高频 authority state 不能双写。

## Demo Concept

Demo 名称：`Outpost Siege`。

玩法是一局 2D 俯视角、最多四人的合作防守与撤离游戏。玩家在前线哨站中收集资源、建造炮塔和路障、抵御多波敌人，并在最终阶段启动撤离装置。

这个玩法不是为了内容规模，而是为了自然制造 multiplayer 压力：

- 玩家持续移动和瞄准，验证 latest-input coalescing、本地 prediction 和远端 interpolation。
- 射击、冲刺、技能、建造和交互是离散 action，验证 bounded FIFO、validation、ack 和 rejection。
- 敌人、投射物、建筑和掉落物由 server authority 创建、更新和销毁，验证动态 replication。
- 击退、受伤、复活和传送会触发不同强度的 reconciliation 或 snap。
- 共享资源、占位建造和唯一掉落物会产生竞争，必须由 authority 决定结果。
- 大量同类实体适合测量 serialization、patch size、presentation projection、renderer update 和 GC。
- 波次间隙、进行中加入、旁观和重连可以验证参与者策略，而不需要虚构额外流程。

## Game Loop

建议 session lifecycle：

```txt
room setup
  -> lobby
  -> loading
  -> countdown
  -> wave
  -> intermission
  -> wave / boss
  -> extraction
  -> results
  -> rematch or room close
```

第一版完整局包含：

- 1 个 lobby 和 ready check。
- 3 个普通 wave，每个 wave 增加敌人数和出生频率。
- 2 个 intermission，用于拾取、建造和补给。
- 1 个 boss 或高压最终 wave。
- 1 个有明确倒计时和范围目标的 extraction。
- 胜利、失败、个人统计、团队统计和 rematch。

建议玩法对象上限以可配置 profile 表达，不在 gameplay 代码中散落常量：

| 对象           | 常规 profile | 单房压力 profile |
| -------------- | -----------: | ---------------: |
| Active players |            4 |                4 |
| Spectators     |            2 |               12 |
| Enemies        |          250 |            1,000 |
| Projectiles    |          300 |            1,500 |
| Buildables     |           64 |              256 |
| Pickups        |          128 |              512 |

第一版视觉和规则应保持克制。对象数量、生命周期和同步模式比地图、美术数量或技能树深度更重要。

## Functional Scope

### Required Gameplay

- 玩家移动、瞄准、主武器射击和冲刺。
- 至少一种需要 server validation 的主动技能。
- 炮塔和路障建造，包含资源、冷却、占位和范围检查。
- 至少两种 server-owned 敌人行为和一种 boss 行为。
- 投射物、命中、伤害、击退、死亡和复活。
- 共享资源、掉落物竞争和团队目标进度。
- lobby、ready、start、wave、results 和 rematch 完整闭环。

### Required Multiplayer Behavior

- 1-4 个 active players 加入同一 room。
- Room 创建者只是 party leader，不是网络 authority，也不持有 server simulation。
- 进行中的新 participant 默认进入 spectator/next-round，不直接成为当前 wave 玩家。
- transient disconnect 保留 seat；provider reconnect 成功后恢复原 peer/player binding。
- explicit leave 与 transport disconnect 是不同事实，具体保留/移除策略由 app 配置 multiplayer-core participant policy。
- Room close、普通 leave、disconnect timeout 和同名 session recreate 分别有测试。
- 非 authority source、重复/倒序 sequence、NaN/Infinity、超大 payload、越权 action 和过频输入被拒绝并可诊断。

### Explicit Non-goals

- 账号、好友、邀请、排行榜、商店和公网部署。
- 生产 matchmaking 或跨 region 调度。
- 通用 rollback/lockstep netcode。
- client authority projectile、伤害或 AI。
- 复杂装备、长期养成、Save 或内容生产管线。
- 为 Demo 自研完整物理引擎、网络协议或 ECS。
- 在第一版就把 AOI、replication contributor 或玩法 Schema 抽成通用 core API。

## Runtime Architecture

```txt
Browser
  App Host
    Phaser Driver
      Renderer / Input source / Camera adapter / Assets
    Multiplayer standard service
    Client GameRuntime + standard multiplayer GameModule
    Prediction + reconciliation + presentation projection
    DevTools sources
                |
                | input state / discrete actions
                | low-frequency semantic envelopes
                | app-specific Schema patches
                v
Colyseus server
  OutpostSiegeRoom
    headless App Host
    server GameRuntime + World
    fixed-step authority loop
    gameplay validation / AI / combat / building
    replication projection
    app-owned Colyseus Schema
    room diagnostics
```

### Browser Ownership

- App Host 统一拥有 Multiplayer service、Phaser Driver、Renderer、Input、Camera、DevTools 和 dispose lifecycle。
- Phaser runtime 只能由 Driver 创建和持有；renderer/input/camera adapter 绑定 Driver slice，不能各自创建 Phaser runtime。
- Browser gameplay 只发送归一化 input/action，只消费 provider-neutral authoritative view 和 presentation value。
- UI 不读取 Colyseus `Room`、`Client`、raw Schema 或 socket handle。
- React/DOM 只消费节流后的 lobby、score、health、diagnostics 和 results summary；高频 transform 不驱动 DOM render。

### Server Ownership

- 每个 `OutpostSiegeRoom` 拥有一个 headless App Host，由它统一管理 server GameRuntime、Multiplayer module、diagnostics 和 dispose lifecycle。
- Room 创建时启动 authority runtime，最后一个保留 participant/seat 释放且 room policy 决定关闭时统一 dispose。
- Fixed-step simulation、AI、碰撞、伤害、生成销毁和结果判定只在 server runtime 运行。
- Browser party leader 可以请求开始、rematch 或 close room，但不能因此取得 authority write capability。
- Room state 与 provider connection handle 不进入 gameplay world 或 Save boundary。

### Physics Integration

Outpost Siege 使用 `@gamekit/physics-core` 作为稳定 facade，并通过 `@gamekit/physics-rapier2d` 创建可 headless 运行的 server authority scene。Physics scene 由 server GameRuntime 中的标准 Physics GameModule 持有和推进，不进入 App Host standard service，也不依赖 browser Phaser Driver lifecycle。

Browser prediction 只能通过 backend-neutral movement/physics contract 复用必要规则，不能直接 import Rapier native type。Phaser physics 不能成为 server authority；Renderer 只消费 authority/presentation transform，不能反向决定 gameplay collision。

## Authority And Data Flow

权威数据至少分成五层，不能复用同一个可变对象跨层写入：

```txt
server gameplay world
  -> app-owned replication projection
  -> Colyseus Schema patch
  -> client authoritative shadow
  -> prediction / presentation values
  -> renderer target state
```

- Server world 是规则事实源，包含内部 AI、碰撞、cooldown 和临时索引。
- Replication projection 只包含客户端需要的字段，不暴露 server-only 状态。
- Client authoritative shadow 只接受当前 room/source/version 的合法更新。
- 本地预测状态可以提前响应输入，但 reconciliation 不能回写 authoritative shadow。
- Presented state 只用于渲染，不能进入 gameplay rule、command validation 或下一次 prediction base。

### Input Contract

Continuous input 使用 latest-state contract：

- movement axes、aim direction 和 held-fire state 每个 peer 只保留最新值。
- Browser 每帧采样，但按可配置频率发送，初始建议 30Hz。
- Server 在固定 tick 上读取最新 input，默认 authority tick 建议 20Hz，基线后再决定是否提高到 30Hz。
- Input 带 sequence/epoch；重复、倒序、过大跳变和旧 epoch 被拒绝。
- neutral/release、timeout 和 disconnect 都必须清空持续输入，避免角色继续移动或射击。

Discrete action 使用 bounded FIFO：

- dash、ability、build、interact、ready、start 和 rematch 每份只消费一次。
- 每 peer 和每 room 都有容量、每 tick 消费上限和 overflow policy。
- Accepted/rejected/overflow/coalesced/expired 必须进入低成本 diagnostics。
- `createMultiplayerModule()` 的通用 command queue 在进入本 Demo 高频路径前，必须改为 bounded deque/ring buffer，或明确证明它只承载低频 control fact；不能把当前无界 `Array.shift()` 队列用于战斗 action。

## Provider-native Schema Boundary

ADR 0015 的通用 Schema carrier 继续作为 baseline 和迁移工具，但 Outpost Siege 的高频状态使用 app-owned 字段级 Schema。

边界要求：

- Schema class 和 gameplay-to-schema mapping 位于 app server 边界，不进入 `multiplayer-core`。
- `multiplayer-colyseus` 提供可扩展的 typed native state mapping hook，负责把 provider update 转成 provider-neutral authority update metadata 和 app-local value。
- Browser gameplay、presentation 和 UI 不 import `@colyseus/schema` 类型。
- Schema entity 使用稳定 `entityId + generation`，避免 despawn 后复用 id 时旧 patch、旧 track 或旧 prediction 污染新实体。
- 初次加入获得完整当前状态；之后只应用单调 provider version 的增量 patch。
- spawn/despawn、room reset、schema version mismatch 和 resync 都有明确状态机与 diagnostics。
- Schema patch callback 不直接逐对象更新 renderer；先更新 authoritative shadow，再由 presentation frame 批量投影到复用的 renderer target。

第一版同步全量可见实体，以得到诚实基线。AOI/interest management 在性能证据证明需要后再实现，先保持 app/server-specific；只有出现第二个稳定使用场景后，才评估 replication contributor 或 partition primitive 是否下沉 core。

## Prediction And Presentation

Demo 上层不能拥有 `interpolatePosition()`、手写 snapshot buffer 或每帧 clone 完整 snapshot。它只声明哪些字段使用哪种 presentation/prediction policy，并在 render frame 读取底层维护的 presented values。

建议策略：

| 对象/字段                          | 本地玩家                                     | 其他客户端                                      |
| ---------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| Player position/velocity           | input prediction + reconciliation            | interpolation                                   |
| Aim/rotation                       | immediate local value + authority correction | angle interpolation                             |
| Dash                               | immediate local start，server 可拒绝/校正    | authority event + interpolation                 |
| Enemy transform                    | 不预测                                       | interpolation，必要时短时 bounded extrapolation |
| Projectile transform               | 本地仅即时播放开火表现                       | server-owned presentation                       |
| Health/resource                    | authority value，可做 UI tween               | authority value                                 |
| Teleport/respawn/generation change | snap/reset prediction history                | snap/reset presentation track                   |

需要观测：

- local input-to-present latency。
- remote presentation delay 和 adaptive interpolation delay。
- correction count、distance、peak 和 cause。
- buffer depth、underflow、overflow、stale sample、snap/reset 和 dropped update。
- presentation frame CPU time、active track count 和 allocation rate。

## Participant Lifecycle Policy

Demo policy 是 app 配置，不是 core 写死规则。第一版建议：

- Lobby explicit leave：立即移除 player 和 seat。
- Running explicit leave：标记 abandoned，停止输入并释放携带物；seat 立即释放，actor 按 gameplay rule 安全 despawn。
- Transport disconnect：标记 disconnected，清空输入，保留 seat 15 秒并冻结或交给简单 server bot。
- Provider reconnect：在 grace period 内恢复同一 stable peer/player binding、input epoch 和 authority stream，不重放旧 action。
- Grace timeout：转为 abandoned，执行与 running explicit leave 相同的 app policy。
- Late join：进入 spectator/next-round；下一次 lobby/rematch 晋升 active player。
- Room leader disconnect：只影响 leader 权限；server authority 继续运行，并按 app policy 转移 leader。
- Last participant leave：Room 可以立即关闭或等待短 idle timeout，策略由 server profile 配置。

测试必须区分 explicit leave、network disconnect、provider reconnect、new join 和 page refresh，不能只观察 active peer count。

## Diagnostics Contract

浏览器 DevTools 与 headless benchmark 至少暴露：

### Client

- render FPS、frame time p50/p95/p99。
- presentation frame time、track count、buffer depth 和 adaptive delay。
- input sample/send rate、latest sequence、coalesced 和 timeout。
- prediction history size、ack sequence、correction count/distance/peak。
- applied/rejected/stale Schema update、snapshot age 和 resync count。
- bytes/sec in/out、patch bytes p50/p95/p99 和 message count。
- rendered/replicated/culled entity count。

### Room/server

- simulation tick p50/p95/p99、missed/overrun tick 和 accumulated lag。
- input/action queue current/peak/overflow/coalesced/expired。
- AI、physics/collision、gameplay rules、replication projection 和 Schema encode/patch 分阶段耗时。
- connected/active/spectator/disconnected/reserved participant count。
- world/replicated entity count、spawn/despawn rate。
- bytes/sec per client/per room、patch size、broadcast count。
- process heap、room retained heap estimate、GC pause 和 event-loop lag。

Diagnostics 只保存固定窗口聚合值和 bounded recent samples，不保留完整 payload、逐 tick world clone、socket handle、token 或无限 event history。

## Performance Profiles And Gates

性能测试必须把 server throughput、单房 simulation、网络、client presentation 和 renderer 分开测量；不能只在一台机器同时打开多个可视浏览器后用肉眼判断。

### Functional Profile

- 4 active browser clients。
- 250 enemies、300 projectiles、64 buildables、128 pickups 的峰值配置。
- 20Hz authority tick，10-20Hz replication，60Hz/120Hz presentation。
- 1080p 下 client frame p95 不超过 16.7ms，且没有持续 frame degradation。
- Server tick p95 不超过 25ms，不能连续耗尽 50ms tick budget。
- 所有 queue/buffer 都有稳定上限，10 分钟运行后不持续增长。

### Single-room Stress Profile

- 4 active headless clients、12 spectators。
- 1,000 enemies、1,500 projectiles、256 buildables、512 pickups 的短时峰值。
- 记录 simulation、replication、Schema patch、bytes/client 和 memory，不要求保持完整视觉质量。
- Server tick p95 必须保持在配置 tick budget 内；如果超出，报告首先失效的阶段，而不是静默降速。

### Multi-room Throughput Profile

- 独立 load process 启动 8 个 room，每 room 4 个 bot client。
- 每个 room 使用常规 profile 的缩减实体规模，避免把单房极限与多房吞吐混为一个数字。
- 记录 room create/dispose churn、event-loop lag、总带宽、process heap 和 tick fairness。
- 任一 room 的拥塞不能让其他 room queue 无界增长。

### Soak Profile

- 常规 profile 连续运行至少 60 分钟。
- 每分钟执行可重复的 join/leave/disconnect/reconnect、build/destroy 和 wave reset。
- 预热后 retained heap 应进入稳定区间；最后 30 分钟不能呈持续单调增长。
- Active tracks、entity registry、peer binding、listener、timer、action queue 和 Schema collection 在 despawn/leave/room dispose 后回到预期基线。

网络 bandwidth 的硬预算不在文档阶段猜测。Wave 2 先记录 field-level Schema 的 p50/p95/p99 和 bytes/sec 基线，再把实测预算写入 benchmark budget；之后 CI 只做稳定、可重复的粗粒度 regression gate，完整压力测试由手动或定时任务运行。

## Network Fault Matrix

真实集成测试至少覆盖：

|    RTT | Jitter | Loss/disconnect    | 预期                                                       |
| -----: | -----: | ------------------ | ---------------------------------------------------------- |
| 0-10ms |    0ms | none               | 本地 prediction 无可见周期性跳变                           |
|   80ms |   30ms | none               | 远端保持连续，本地 correction 有界                         |
|  150ms |   80ms | transient delay    | adaptive delay 有上限，buffer 不持续膨胀                   |
|   80ms |   30ms | forced disconnect  | seat reservation 和 reconnect policy 正确                  |
|    any |    any | repeated reconnect | listener、peer binding、prediction history 和 track 不泄漏 |

Colyseus 基于可靠连接时，不能用伪造 packet loss 的应用层消息丢弃来宣称验证了 provider transport。故障注入应通过独立 network proxy、provider connection close 或明确标注的 app-level test seam 完成，并在报告中区分类型。

## Test Strategy

### Domain Unit Tests

- 固定 seed、固定 tick 下 wave、AI、combat、building 和 result 可重复。
- 不依赖 renderer、socket 或 wall clock。
- 非法 input/action 不改变 authoritative world。
- entity generation、spawn/despawn 和 reset 不复用旧 transient state。

### Core And Adapter Tests

- bounded input/action queue 和 overflow diagnostics。
- app-owned native Schema mapping、version/source/schema gate 和 resync。
- prediction ack/replay/reset；presentation interpolation/snap/despawn。
- provider reconnect capability 与 stable peer binding。
- dispose 后 listener、timer、queue 和 track 全部释放。

### Real Colyseus Integration

- 真实 server + 1/2/4 headless clients 完成一局。
- late join、spectator、disconnect、reconnect、explicit leave 和 room recreate。
- 同 room 共享权威状态，不同 room 完全隔离。
- 非 authority client 不能写 Schema authority state。
- 初始完整同步后只接受合法增量 version。

### Browser E2E

- App Host 正确创建和释放 Driver、Multiplayer service、GameRuntime 和 DevTools。
- 本地玩家即时响应且 reconciliation 无周期性跳变。
- 远端玩家、敌人和投射物连续呈现。
- UI focus/input scope 不误触 gameplay action。
- 60Hz 和 120Hz 显示下 presentation clock、FPS 和 frame diagnostics 正确。
- Desktop 和 mobile-sized viewport 不出现 UI overlap；mobile 只要求观战/diagnostics 可用，不要求完整操作体验。

### Benchmark And Soak

- 扩展现有 `bench:multiplayer`，在同一顶层入口下区分 core microbenchmark、Outpost Siege room benchmark 和 client presentation benchmark。
- 独立 soak 命令不进入每次普通 test；CI 使用缩短版稳定性检查。
- Benchmark 输出机器、Node/browser、tick/replication 配置、实体 profile 和样本数，避免只提交脱离环境的单个 FPS 数字。

## Implementation Waves

### Wave 0: Workflow Baseline And Decisions

Status: Planned.

1. 关闭或归档已完成的旧 Demo 工作流，把未完成的 App Host/DevTools 综合验证迁移到本文件。
2. 固定 Relay Arena 当前 test、benchmark、Schema bytes 和真实浏览器表现作为基线。
3. 新增 ADR：Room-owned authority lifecycle 与 browser party leader 分离。
4. 新增 ADR：app-owned Colyseus Schema mapping extension boundary。
5. 固定 `physics-core + physics-rapier2d` 的 headless server profile、World sync 顺序和 benchmark diagnostics。
6. 定义功能、单房压力、多房吞吐和 soak profile 的机器可读配置。

完成标准：没有 gameplay 代码，所有高影响边界有文档结论，基线数据可重复获得。

### Wave 1: Room-owned Vertical Slice

Status: Planned.

1. 创建独立 app 和 `OutpostSiegeRoom`。
2. Room 持有 headless App Host/GameRuntime 和固定 tick authority loop。
3. Browser 使用 configured App Host、Phaser Driver、Input、Camera、Renderer 和 multiplayer standard service。
4. 跑通 lobby、ready、countdown、四玩家 movement/aim 和 room close。
5. 输入走 bounded latest-state；start/ready 走 bounded action FIFO。

完成标准：关闭创建者浏览器不会销毁仍有 participant 的 authority simulation；四个浏览器看到同一 server state。

### Wave 2: Field-level Schema And Observability

Status: Planned.

1. 实现 app-owned player/enemy/projectile/buildable/pickup Schema collections。
2. 实现 stable entity id、generation、spawn/despawn、initial sync 和 resync。
3. 增加 app-specific native state mapping hook，保持 gameplay/provider-neutral。
4. 接入 bytes、patch size、encode/apply time、entity count 和 queue diagnostics。
5. 建立第一版真实网络 bandwidth/performance budget。

完成标准：高频状态不再编码成完整 JSON carrier；浏览器不 import Schema 类型；初始同步和增量 patch 都有真实 Colyseus integration test。

### Wave 3: Prediction, Presentation And Combat

Status: Planned.

1. 本地 movement/aim prediction、server ack 和 bounded reconciliation。
2. 远端 player/enemy/projectile presentation track declaration 和底层自动 frame update。
3. 完成 shooting、dash、ability、damage、knockback、death、respawn 和 teleport reset。
4. 完成 buildable、pickup 和共享资源竞争。
5. 暴露 correction、presentation delay、track/buffer 和 frame cost diagnostics。

完成标准：Demo 上层没有手写 interpolation loop；本地输入即时响应，远端连续，snap/reset 不留下旧 history。

### Wave 4: Complete Game And Participant Lifecycle

Status: Planned.

1. 完成 wave、intermission、boss、extraction、results 和 rematch。
2. 完成 spectator/next-round、explicit leave、disconnect grace、provider reconnect 和 timeout policy。
3. 完成 leader transfer、last-participant idle close 和同名 session recreate。
4. 覆盖 authority abuse、payload validation 和 action rate limit。

完成标准：四人可以完成一局；生命周期矩阵通过真实 Colyseus test，不用 UI 状态猜测结果。

### Wave 5: Load, Soak And Interest Management

Status: Planned.

1. 实现 headless bot client 和独立多进程 load harness。
2. 运行 functional、single-room、multi-room 和 60-minute soak profile。
3. 增加网络故障注入与 reconnect churn。
4. 根据数据优化 hot path、allocation、update frequency 和 renderer projection。
5. 只有全量可见实体实测不满足预算时，才实现 app-specific AOI/interest management。

完成标准：所有 queue/buffer 有界，内存进入平台期，tick/frame/patch/bytes 报告可复现，性能退化能定位到具体阶段。

### Wave 6: Framework Extraction And Closure

Status: Planned.

1. 审查 Demo 中哪些能力属于 app，哪些形成了第二个稳定通用场景。
2. 只下沉已经被真实压力验证的 Schema mapping、replication partition、queue 或 diagnostics primitive。
3. 更新模块长期文档、最佳实践、ADR、benchmark budget 和 release changeset。
4. 完成 package test/build/lint/format、browser E2E、benchmark 和 soak 证据。
5. 将本工作流标记 Closed，并把临时状态从长期文档移除。

完成标准：Demo 不维护平行 multiplayer framework；底层 API 有测试、文档和至少一个真实应用消费；未完成 stretch goal 明确迁移到独立工作流。

## Completion Gate

只有同时满足以下条件，才能称为综合验证完成：

- Room-owned server authority 不依赖 browser host 存活。
- Browser 正式走 App Host + standard Multiplayer service/GameModule + Driver 路径。
- 高频状态使用字段级 Schema，core、gameplay 和 UI 不依赖 provider 类型。
- Prediction/presentation 由底层标准能力运行，上层只声明 policy 并读取 presented value。
- 四玩家可以完成完整一局，late join/leave/disconnect/reconnect/rematch 行为稳定。
- 真实 Colyseus integration、browser E2E、负载和 60 分钟 soak 都有证据。
- Tick、frame、patch、bandwidth、queue、correction、GC 和 memory 都可观测。
- 所有高频队列、buffer、track、listener 和 entity registry 有界且可释放。
- 实测性能预算进入 `bench:multiplayer` regression gate，而不是只留在人工报告。
- 通用结论已经迁移到长期模块文档/ADR，本文件状态关闭。

## Open Decisions For Wave 0

- Authority tick 和 Schema replication rate 的默认组合：先比较 20/15Hz 与 30/20Hz。
- Projectile 是逐实体复制、事件 + client presentation，还是按数量分层；必须先实测再决定。
- Disconnect grace 期间 actor 是冻结、无输入停留还是由 server bot 接管。
- Colyseus app-specific Schema mapping 由 package extension hook 还是 app-local adapter 实现；必须保证 browser gameplay 不依赖 provider 类型。
- AOI 是否需要 provider-native filtering；Wave 2 全量同步基线之前不决定。
