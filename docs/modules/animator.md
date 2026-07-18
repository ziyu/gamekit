# Animator Core 模块设计

## 定位

Animator Core 是 session-scoped presentation Game Module toolkit，负责把 gameplay semantic state 与 cue 转换为稳定动画状态、transition 和 backend-neutral playback command。

相关包：

- `@gamekit/animator-core`
- 具体 backend 实现由 `@gamekit/renderer-*` 或 `@gamekit/driver-*` 提供 runtime slice。

Animator Core 不解码纹理、骨骼或模型，不创建 Phaser AnimationManager、Three AnimationMixer 或 renderer object。外部 runtime 仍由 Driver 单一持有。

## 核心职责

- Animator graph、parameter、state、layer、transition 与 one-shot runtime。
- entity/controller lifecycle、playback snapshot 和有界 marker stream。
- locomotion continuous state 与 action one-shot 的优先级、打断和恢复。
- authority gameplay phase 到表现 playback phase 的映射。
- backend adapter command、trace、diagnostics 和 conformance。

非职责：

- gameplay timing、伤害、能力是否合法或 Physics transform。
- 资源加载与 atlas 解码。
- UI tween、camera motion、particle simulation 或 audio mixing。
- backend 专属 shader、skeleton constraint 或 animation editor。

## Data Definitions

```ts
export type AnimationClipDefinition = {
  id: string;
  asset: AssetRef;
  backendClip?: string;
  durationMs: number;
  loop?: boolean;
  markers?: Array<{ id: string; timeMs: number; tags?: string[] }>;
};

export type AnimatorGraphDefinition = {
  id: string;
  parameters: AnimatorParameterDefinition[];
  layers: AnimatorLayerDefinition[];
};

export type AnimatorBindingDefinition = {
  id: string;
  graph: DataRef<"animator.graph">;
  clips: Record<string, DataRef<"animation.clip">>;
  target?: string | string[];
};
```

Clip definition 描述语义和资源引用，不携带 Phaser frame object 或 Three AnimationClip native handle。Backend adapter 负责把 clip id 绑定到 native animation。

## Animator Parameters

Controller 输入使用少量可复用参数：

- continuous：`speed`、`direction`、`aim-angle`、`vertical-velocity`。
- boolean/tag：`grounded`、`moving`、`downed`、`dead`、`shocked`。
- discrete trigger：`fire`、`reload`、`dash`、`cast`、`hit-react`、`revive`。
- gameplay phase：`execution-id`、`ability-id`、`phase`、`phase-start-time`。

参数由 app presentation mapping 产生。Animator Core 不固定角色职业、武器名或八方向规则。

## Graph 与 Layer

典型角色图包含：

- Base locomotion layer：idle/run/downed/dead。
- Upper/action layer：aim/fire/reload/cast/interact。
- Reaction layer：hit/stagger/shield-break。
- Additive/effect layer：status pulse、weapon heat 或受控 overlay。

Layer 明确 priority、blend/replace policy、mask target 和 interrupt group。One-shot 必须声明：

- 可否被更高优先级动作打断。
- 被打断后回到哪个 stable state。
- 重复 trigger 是 ignore、restart、queue-one 还是 merge。
- 最大排队长度；默认不允许无界 action queue。

## Gameplay Timing 边界

Ability execution phase 是权威时间源。动画根据 `preparing/active/recovering` 选择 clip 并映射 normalized phase：

```txt
authority execution phase
  -> replicated semantic state
  -> animator controller phase mapping
  -> backend clip/time command
  -> presentation marker
```

Animation marker 只驱动脚步、弹壳、枪口闪光、衣物等表现。伤害、投射物生成、cost commit、无敌窗口和冷却不能等待 renderer marker。

本地预测可以立即播放 locomotion、aim 和已声明的可预测 action anticipation；authority rejection 通过 cancel/recover transition 收敛。远端客户端根据 authority phase start time 恢复 clip 相位，不从第一帧重播已经发生一半的动作。

## Backend Adapter

```ts
export type AnimationPlaybackAdapter = {
  bind(controllerId: string, binding: AnimatorBindingDefinition, renderObjectId: string): void;
  apply(controllerId: string, frame: AnimationPlaybackFrame): void;
  unbind(controllerId: string): void;
  snapshot(): AnimationPlaybackAdapterSnapshot;
};
```

Phaser backend 由共享 Driver/Renderer runtime 创建 animation、控制 Sprite playback 并解析 atlas/spritesheet frames。Three backend 使用 AnimationMixer/Action。Adapter 不拥有 gameplay controller state。

Renderer Core 继续只提供 object lifecycle、node target 和 command envelope；Animator Core 不把所有 clip/mixer 功能塞进 Renderer Core。

## Multiplayer、Save 与 Reset

- 网络复制 gameplay semantic phase、必要的 locomotion parameter 和 cue sequence，不复制 native frame index。
- Local/remote transform 仍由 Multiplayer/Physics presentation 管理，Animator 只读取最终 presentation velocity/facing。
- late join 从当前 stable state 与 active execution phase 构建 controller，不重播旧 marker。
- binding generation、session reset、entity despawn 和 render object replacement 都必须清理 one-shot queue、marker watermark 和 native binding。
- 普通 Save 不保存瞬时播放帧；需要跨 checkpoint 继续的 ability execution 由 GAS 保存，加载后 Animator 从 gameplay phase 重建。

## 性能

- Graph 在 Data load 时编译，运行时使用数字 state/transition index，不逐帧解析字符串表达式。
- Controller 按 dirty parameter 或 active transition 更新；静止且无 one-shot 的 controller 不写 backend。
- 同一帧对 renderer 的更新批量提交，支持 caller-owned frame buffer。
- Marker、trace 和 queued one-shot 均有界。
- benchmark 覆盖 500 active / 1,000 mostly-idle controller、state churn、late-join rebuild 和 dispose retained state。

## 最佳实践

### 模块集成

- App composition 创建一个 AnimationPlaybackAdapter runtime slice，并把它与 DataRegistry、presentation state reader 注入 `createAnimatorModule(...)`。
- Driver 先 boot 并加载 clip asset，再绑定 Animator controller；GameRuntime dispose 先解绑 controller，再销毁 Driver。
- 每个 adapter 运行 graph/playback conformance，再补 Phaser/Three clip、marker 和 resource lifecycle 测试。

### 模块使用

- Gameplay 只发布 semantic phase/tag/cue，不持有 Animator controller 或 native clip。
- Presentation mapping 可以按游戏定义八方向、武器姿态和 layer mask，但不能修改 authority state。
- 高频 locomotion 参数直接从 presentation frame 批量写入，不经 EventBus 或 React。
- 粒子、音频、camera 和 UI 可以消费相同 cue correlation，但各自管理资源与生命周期。
