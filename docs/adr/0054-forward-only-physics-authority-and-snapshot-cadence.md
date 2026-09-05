# ADR 0054：Forward-only Physics Authority 与 Snapshot Cadence

## 状态

Accepted

## 背景

多人 Physics Arena 的客户端需要完整 rollback history，服务器 authority 只向前推进。此前两端共用逐 tick checkpoint
策略，服务器在永不调用 reconcile 的情况下仍反复捕获 Rapier 全场景快照；应用还要在 authority tick 外自行判断 20 Hz
发布周期，容易重复 capture、遗漏 diagnostics 或让不同游戏重新实现 cadence。

Prediction island 的 auxiliary command 还一律通过 `structuredClone` 复制。该默认值安全但会让已知、窄且高频的 Character
Motor command 每次排队和执行都承担通用序列化成本。

## 决策

`createPhysicsPredictionIsland(...)` 增加 `historyMode`：

- `rollback` 是默认值，逐 tick 保存完整 solver + auxiliary checkpoint，供客户端 reconcile、late command replay 和 hard
  correction 使用。
- `initial-only` 只保留 generation/reset baseline，逐 tick 修剪已消费 command。它只允许 forward-only authority、离线
  authoritative simulation 或不提供 rewind 的 fixture 使用；不能在需要 reconcile 的客户端启用。

Auxiliary contributor 可以提供可选 `cloneCommand(command)`。Core 在 queue ownership transfer 与 apply isolation 两处调用它；未
提供时继续使用 `structuredClone`。自定义 clone 必须返回独立的完整 command，不能共享会被调用方或 contributor 修改的嵌套值。

Multiplayer authority host loop 增加 `snapshotIntervalTicks`，默认 `1`。Commit tick 始终推进 simulation/diagnostics，只在 cadence
到期时 capture/publish；显式 `broadcastSnapshot()` 不受 cadence 限制，用于 initial sync、late join 或运维 resync。应用不能在
loop 外再维护同义 modulo gate，也不能在一个 tick 同时做“诊断 capture”和“发布 capture”。

综合性能门禁使用当前 JS 主线程 CPU 时间约束同步 authority/replay 工作，并同时报告 wall-clock p95/max。前者排除共享开发机
被其他进程抢占造成的伪回归，后者保留调度/GC 尖峰证据；真实玩家帧预算仍必须在浏览器以 wall-clock 验收。

## 后果

- 服务器 authority 的 history 固定为一个 baseline，command 不随比赛时长增长。
- 客户端默认行为不变；误把 `initial-only` 用于 reconcile 会得到明确 history overflow，而不是静默近似。
- Snapshot cadence 成为 provider-neutral authority 协议，Arena、Outpost 或新游戏只声明频率和 publisher。
- 自定义 command clone 是性能 escape hatch，必须有隔离测试；通用 opaque payload 继续走安全默认值。
- 性能报告同时保留 CPU hard gate 与 wall diagnostic，任何预算变化仍需真实 profile、解释和 review。
