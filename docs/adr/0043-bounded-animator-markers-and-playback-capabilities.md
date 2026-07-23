# ADR 0043: Bounded Animator Markers and Playback Capabilities

Status: Accepted on 2026-07-23.

## Context

Animator marker 是纯表现事件，但 looping clip 在浏览器后台暂停、断点调试或 runtime clock 大幅前跳后，可能跨越大量历史循环。只限制 marker 去重历史不能限制单次 update 的遍历、分配、EventBus 发布和 trace 成本。无界补发会让一个表现系统阻塞同一帧的 gameplay presentation。

Marker 通过 callback、EventBus 和 trace 进入旁路观察者。若任一 EventBus listener 抛错并逃逸，controller state 已经推进而 adapter batch 尚未 flush，semantic state 与 native playback 会发生分叉。

Playback layer DTO 同时声明 `weight` 和 `replace/additive` mode，但并非所有 native backend 都支持混合。Phaser Sprite AnimationState 每个目标只能执行一个 clip，静默忽略 weight 或 additive 会让 backend 声称执行了实际不存在的语义。

## Decision

### Marker catch-up 使用双重上限

- `markerHistoryLimit` 只限制 generation/playback marker key 的去重历史。
- `maxMarkerEventsPerControllerUpdate` 限制单个 controller 每次 update 可发布的 marker，默认值为 64，可以配置为非负整数。
- 超过上限时保留时间上最近的 marker，再恢复为时间顺序发布；较旧的 presentation marker 被截断且不会在后续帧补发。
- 截断产生 `animator.marker_catch_up_truncated` diagnostic。Gameplay timing、伤害、cost、projectile 或 cooldown 不能依赖 marker，因此丢弃历史表现 marker 不改变 authority 结果。

Marker range 查询从最新 cycle 反向收集到上限，不遍历所有被跳过的历史循环。总成本由 controller 数量、配置上限、clip marker 数量和有界去重历史共同约束。

### Marker observer failure 与 playback flush 隔离

- `onMarker`、`onMarkerError`、EventBus marker listener 和 trace observer 都是 presentation 旁路。
- EventBus listener 异常由 Animator composition 捕获，通知 `onMarkerError` 并记录 `animator.marker_event_bus_listener_failed` diagnostic。
- listener 失败不能阻止剩余 controller 更新或本帧 adapter batch flush。

### Playback capability 必须执行或原子拒绝

- Backend 支持 weighted/additive layer 时必须执行 frame 中声明的语义。
- Backend 不支持某项 layer capability 时，必须在该 frame 发生任何 native mutation 前抛出明确错误，不能静默忽略或部分执行。
- Phaser animation playback 只接受 `weight: 1`、`mode: "replace"`。并行 Phaser 动画使用独立 RenderNode target；真正的 weighted/additive blending 交给支持 mixer/action blend 的 backend。

## Consequences

Positive consequences:

- 大幅 clock jump 不再按历史循环无界分配和广播 marker。
- 观察者故障不会造成 controller 与 native playback 分叉。
- Adapter capability 与真实 backend 能力一致，不再产生静默语义降级。
- `maxMarkerEventsPerControllerUpdate` 给不同游戏提供明确的 presentation 成本预算。

Costs and constraints:

- 长时间暂停后，较旧的脚步、弹壳等 presentation marker 会被丢弃；调用方只能依赖当前 snapshot 和最近 marker 恢复表现。
- Phaser 内容不能在同一 native target 上声明 weighted/additive layer；内容需要拆分 RenderNode 或选择支持混合的 backend。
- 新 adapter 的 conformance 必须同时覆盖受支持 layer 语义和不支持 capability 的原子拒绝行为。

## Rejected Alternatives

### Emit every historical marker

Rejected because retention capacity does not bound range traversal, event allocation or subscriber work.

### Silently ignore unsupported layer fields

Rejected because playback snapshot would report semantics that native output did not execute.

### Approximate Phaser weight with object alpha

Rejected because alpha changes the whole RenderObject appearance and is not clip blending or additive animation.
