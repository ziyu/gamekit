# Character Controller 模块

## 定位

`@gamekit/character-controller` 是可选 gameplay toolkit，把玩家或 AI 的 world-space 语义意图转换为 backend-neutral Physics
patch/command，并维护可 checkpoint 的角色 motor state。它不读取输入设备、Camera、Renderer、AI blackboard 或 Multiplayer，
也不决定攻击、伤害、淘汰和胜负。

Physics Core 继续拥有 body/query/command/checkpoint 协议和 solver adapter；Character Controller 只拥有 locomotion policy。Rapier、
Phaser、Three 或其他 native controller 类型不能进入本包公共 API。

## 包边界

```txt
character-controller → core / data / physics-core
arena / physics lab → character-controller + physics backend
character-controller -X→ input / camera / renderer / ai / multiplayer / rapier
```

首轮公共能力分为三层：

- `CharacterControlIntent`：玩家和 AI 共用的 move/facing/jump/dive 语义输入与稳定 sequence。
- Pure motor：读取已编译 definition、上一状态、Physics body state 和本 tick 稳定环境观测，输出下一状态、body patch/command、
  diagnostics 与有界 trace。
- Runtime strategy/helper：负责 ground/ceiling/step query、稳定排序、Physics 提交和 lifecycle；该层在后续工作包实现，不能由
  app 重建另一套 timer/state machine。

## Definition 与 Data

公共 DataType 为 `character.motor`。Definition 声明 capsule 尺寸、ground/air speed 与 acceleration、坡度、台阶、probe/snap、
jump/coyote/buffer、dive/recovery/cooldown、platform inheritance、stagger/recovery control scale 和 facing rate。

业务启动时必须通过 `compileCharacterMotorDefinition(...)` 验证并冻结 profile；fixed tick 热路径只消费编译结果，不能逐 tick 查询
DataRegistry、解析字符串或容忍 NaN/Infinity。App 可以在编译前组合 carry/surface/stage modifier，但不能复制 motor transition。

## Pure Motor 契约

`stepCharacterMotor(...)` 必须满足：

- 只读取参数，不读取 wall clock、全局 registry 或 native runtime，不提交 EventBus、Audio、Renderer、Camera、GAS/Combat 副作用。
- 相同 definition/state/intent/body/observation/tick/delta 产生相同 command 与 state signature。
- diagonal move 归一化；ground/air acceleration 与 braking 有界，不把 external impulse 在下一 tick 直接清零。
- ground normal 决定 walkable slope；过陡面不刷新 ground。Step 只有高度、clearance 和 landing slope 全部通过才输出位置 patch。
- platform velocity 先限幅，支撑期间作为相对速度参考；离地只保留 definition 声明的 departure fraction。
- jumpPressed 进入有界 buffer，ground/coyote 有效时按 sequence 只消费一次；held jump、ceiling 和 timer 都由 fixed delta 推进。
- dive 按 sequence 只提交一次 impulse，并经过 duration、recovery、cooldown；stagger 同样通过确定性 timer 进入 recovery。
- `CharacterMotorState` 只保存 backend-neutral 重演字段；query hit/native handle/input device/animation time 不进入 checkpoint。

环境观测是 query/runtime strategy 交给 pure motor 的稳定事实，不是新的 Physics 状态源。Strategy 必须忽略 self collider、使用 stable
closest/sort 规则，并把 query/rejection 数写入 diagnostics。Authority 与 prediction 必须在相同 tick 使用等价观测。

## Diagnostics 与重演

每次 transition 返回 mode、ground/body/surface、坡度、timer、last consumed sequence、query/rejection、command count 和最多 16 条
语义 trace。`characterMotorStateSignature(...)` 与 `characterMotorCommandSignature(...)` 用于测试、checkpoint hash 和 replay 对照；
它们不是网络 wire format。

Motor state 的 capture/restore/reset/dispose 由标准 runtime 和 Multiplayer rollback contributor 管理。Physics island 与 motor 必须同 tick
恢复；generation、membership 或 definition version 改变时安装完整 baseline，不能跨 stage 继承 timer。

## 集成最佳实践

- App composition 先把 keyboard/gamepad/camera-relative 输入映射成 world-space intent；AI task 写入同构 intent。
- Authority/prediction runtime 在 fixed tick 前完成 query observation，运行 pure motor，按稳定顺序提交 patch/command，再推进 Physics。
- Backend-specific strategy 只映射 probe/step/ground resolution，不拥有 gameplay timer、dive、stagger 或公共 state。
- 新 backend 声明支持前，必须通过 shared motor fixture；Arena 之外至少保留 Physics 3D Lab controller course 作为第二真实 fixture。

## 使用最佳实践

- 业务代码只选择编译后的 profile、写 intent、读取公开 mode/diagnostics；不要直接设置 native velocity 或维护 coyote/dive timer。
- External hit 先通过 Physics body command 提交冲量，再把 bounded stagger duration 作为 motor observation；damage/KO 仍归 Combat/Arena。
- Animation、Audio、Camera 和 UI 只消费 motor semantic state/fact，不能用 marker 或完成回调解锁 gameplay。
- 淘汰成员停止接收 intent，并由 owner 清理 Physics member 和 motor state；不要 teleport 回出生点模拟淘汰。

## 非目标

首轮不承诺 ragdoll、攀爬、游泳、载具、root motion 或所有 2D backend 的同构 step semantics。这些能力需要独立使用证据、窄
strategy 和 ADR，不能膨胀 pure motor 基础协议。

决策背景见 [`ADR 0052`](../adr/0052-reusable-character-controller-toolkit.md)。
