# ADR 0029: Declarative Prediction State Presentation

Status: Accepted on 2026-07-15.

## Context

ADR 0028 把 authority gate、snapshot playback、input sampling、prediction、reconciliation 和逐帧 `present()` 调度收进了 Multiplayer Core，但 prediction buffer 仍要求游戏通过 `presentState` 和 `correctionSmoothing.apply` 回调手写位置 lerp、角度 shortest-path 和 correction offset。结果是普通游戏虽然不再调度 netcode lifecycle，仍可能漏掉某个连续字段、用普通 number lerp 处理角度，或把 correction 平滑实现成跟随移动 target 的错误追赶逻辑。

Outpost Siege 还暴露了另一个时钟缺口：authority Room 使用 20 Hz / 50 ms tick，而客户端分别配置了 30 Hz input sampling 和 33.3 ms prediction step。Latest-input ack 只能确认 authority tick 已采用到某个 sequence，不能把一条 input 自动解释成另一种步长；两个频率的相位差会在每份 snapshot 上形成周期性 correction。

## Decision

Multiplayer Core 提供声明式 predicted-state presentation field：

- 游戏通过 typed field builder 声明 scalar、angle-radians、vector2、vector3、quaternion 或 step 字段的读取和写入映射。Core 根据字段 kind 自动执行逐帧插值；未声明字段保留当前 predicted endpoint 的值。
- Correction 显式选择一个 measurable field 和一组 smoothable fields，并只配置 duration 与 max magnitude。Core 计算 correction magnitude，并把旧 presented target 与初始 corrected target 的 offset 叠加到持续移动的新 target 上逐帧衰减。不同单位不会被隐式混合。
- Angle 使用 shortest-path；vector2/vector3 可声明 snap distance；step 不参与 correction smoothing；quaternion 提供 slerp presentation 和 angular correction measure，但默认不提供未经验证的相对旋转 correction smoothing。
- Core 不递归遍历 state、不解析 string path、不按属性名猜测 number 语义，也不持有 Renderer、Camera、ECS 或 Physics target。游戏仍提供确定性的 `applyInput`、authority state/ack 映射和最终 `applyFrame` writer。
- Managed client replication 在没有显式 `predictionStepMs` 时，从 `inputRateHz` 派生同一 prediction step；每次 catch-up input 使用其真实采样边界 timestamp，而不是把同一 render-frame timestamp 赋给所有补步。需要不同 send rate 与 simulation rate 的特殊 netcode 必须显式配置，并负责定义与 authority ack 一致的 interval 语义。未确认输入由 `maxPredictionLeadInputs` 形成有界窗口，Core 在窗口满时自动暂停新 prediction/send，避免两个同频 timer 的长期微小漂移变成无界领先量。
- 旧的 `presentState`、`measureCorrection` 和 `correctionSmoothing.apply` 保留为 deprecated low-level/custom-netcode escape hatch，但不能与声明式 presentation 同时启用。

Snapshot remote tracks 与 local prediction fields 复用相同的 `Network*` 数值语义，但不共享动态 keyed projector。Remote projector 面向一份 snapshot 中的多个 entity key；local prediction field 面向单个 rollback state 的起点、终点和 correction，二者的生命周期与输出形态不同。

## Consequences

Positive consequences:

- 普通游戏只声明字段和参数，不再调用 interpolation primitive 或实现 correction decay。
- 位置、角度和 correction 的标准语义在不同游戏/backend 间一致，managed runtime 真正覆盖从调度到字段表现的默认路径。
- Prediction step 与 input pacing 默认共用一个时钟，减少配置漂移；不规则 render frame 跨采样边界时仍按真实 boundary timestamp 连续表现。
- Field 数量固定、初始化时编译、逐帧只遍历声明字段；没有 deep reflection、动态 Map 或完整 snapshot walk。Multiplayer prediction benchmark 覆盖声明式路径。

Costs and constraints:

- 游戏仍必须提供可重放的 simulation transition。Multiplayer Core 不能猜测 Rapier 碰撞、角色控制器、dash、teleport 或技能规则；标准单 body 场景可以使用 Physics Core 的 backend-driven transition，复杂角色控制仍需通过可复用 transition 扩展。见 ADR 0030。
- `cloneState` 仍必须隔离会被 field writer 修改的嵌套对象。后续只有 benchmark 证明 clone 成为瓶颈时，才增加 caller-owned target/copy-into 优化。
- 一个 correction metric 不能同时表达像素距离、角度和资源数值；复杂 custom metric 继续使用 low-level escape hatch。

## Rejected Alternatives

### Reflect and interpolate every numeric property

Rejected because number 可能是位置、角度、tick、score、cooldown 或离散枚举值；递归遍历既不安全也放大高频成本。

### Reuse the keyed snapshot projector for local prediction

Rejected because它会为单个 local state 引入不需要的 key/Map 生命周期，而且无法自然表达 correction offset 和 cloned rollback state。

### Keep app callbacks as the standard integration

Rejected because它继续让每个游戏重复实现相同字段数学，并允许“底层已托管但游戏漏接某字段”的回归再次发生。

## References

- ADR 0014: `docs/adr/0014-multiplayer-presentation-temporal-buffer.md`
- ADR 0028: `docs/adr/0028-managed-client-replication-runtime.md`
- Multiplayer module: `docs/modules/multiplayer.md`
