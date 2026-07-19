# AI Core 模块设计

## 定位

AI Core 是可选的 Game Module toolkit，负责高层感知记忆、utility 决策、task lifecycle、预算调度和 trace。它让 AI 通过与玩家相同的 gameplay intent、GAS 和 Combat 边界行动，而不是直接改写结果。

相关包：

- `@gamekit/ai-core`

AI Core 不拥有 World entity、Physics body、navigation backend、GAS actor 或 encounter director。游戏通过 binding 和 definition 注册具体感知、consideration、goal 与 task executor。

## 分层

```txt
World / Physics / gameplay facts
  -> perception sampler
  -> bounded memory + blackboard
  -> utility goal selector
  -> interruptible task executor
  -> movement / aim / ability / interaction intent
  -> app gameplay systems
```

感知与决策不需要每帧运行。Task executor 可以每 tick 推进短状态，但复杂评分、目标搜索和路径请求必须按 scheduler budget 错峰。

## Agent 与 Binding

```ts
export type AiAgentBinding = {
  agentId: string;
  entityId?: EntityId;
  actorId?: string;
  definitionId: string;
};

export type AiAgentDefinition = {
  id: string;
  sensors: DataRef<"ai.sensor">[];
  goals: DataRef<"ai.goal">[];
  decisionIntervalMs: number;
  memoryLimit: number;
  schedulerClass?: string;
};
```

AI id、EntityId 与 ActorId 是不同 identity。AI module 显式 bind/unbind，并在 entity despawn、actor removal、save restore 和 session dispose 时清理 mapping。

## Perception 与 Memory

Sensor 通过注册 definition 读取窄 facade：

- PhysicsQueries：视线、范围和遮挡候选。
- World query/read model：位置、类别和热状态。
- gameplay fact reader：目标、结构、队伍和 encounter state。

感知结果归一化为稳定 fact：

```ts
export type AiPerceptionFact = {
  key: string;
  subjectId?: string;
  position?: { x: number; y: number; z?: number };
  value?: number | string | boolean;
  observedAt: number;
  expiresAt?: number;
  confidence?: number;
};
```

Memory 使用固定容量与过期策略。大群 agent 可共享只读 spatial fact cache，例如“可见玩家候选”“核心位置”“被攻击设施”，但每个 agent 的仇恨、最后观察和 task state 保持独立。

## Utility Decision

Goal 由多个 consideration 评分：

```ts
export type AiGoalDefinition = {
  id: string;
  task: DataRef<"ai.task">;
  considerations: AiConsiderationDefinition[];
  weight?: number;
  minScore?: number;
  commitmentMs?: number;
  switchThreshold?: number;
  cooldownMs?: number;
};
```

Consideration 读取预编译 input，再通过 curve 映射到 0–1。组合方式与补偿因子必须稳定并有测试，避免 consideration 数量增加时无意把所有分数压到零。

Selector 使用 deterministic tie-break、hysteresis、minimum commitment 和 switch threshold。目标切换原因进入 trace，不能只记录最终 goal。

## Task Lifecycle

```ts
export type AiTaskStatus = "starting" | "running" | "succeeded" | "failed" | "cancelled";

export type AiTaskDefinition = {
  id: string;
  executor: string;
  interruptPolicy?: "always" | "safe-point" | "never";
  timeoutMs?: number;
  args?: Record<string, unknown>;
};
```

Executor 是小型层级状态机，例如 `acquire → request-path → move → telegraph → commit → recover`。它只能输出 intent 或请求 Navigation；不能直接扣血、传送、生成资源或写 UI。

Task failure 必须区分 target-lost、path-failed、ability-rejected、timeout、interrupted 和 owner-removed。失败可以触发立即重评或受控 backoff，不能在同一 tick 无限重试。

## Intent

标准 intent envelope 保持领域中立：

- movement vector / desired velocity。
- aim target / direction。
- semantic action id + target。
- interaction id。
- navigation request/cancel。

具体游戏将 semantic action 映射到 GAS ability 或 Combat request。AI 不能获得比玩家更宽松的 authority validation。

## Planner 扩展点

AI Core 可以暴露 `AiPlanner` 接口，把 world state 与 goal 转换为 task sequence。默认 Utility + Task 模型不需要 planner。

GOAP、HTN 或行为树 backend 只有在真实游戏需要动态多步计划时才作为 adapter 接入。Planner 不能拥有 agent/entity lifecycle，计划长度、搜索节点、时间和 allocation 必须有硬上限，并产生可解释 trace。

## Scheduler 与性能

- Agent 按 stable hash 分散到 decision bucket，避免同一帧全部重评。
- Scheduler 为 perception、decision、path request 和 trace 分别设预算。
- 近战中/屏内/高威胁 agent 获得更高决策频率；远处 agent 降低感知与重评频率，但 movement 仍由稳定 navigation/physics 路径推进。
- Task executor 不在每 tick 创建闭包、数组、动态对象树或解释 JSON path。
- benchmark 覆盖 250 standard agent、1,000 stress agent、目标 churn、批量 despawn 和 trace disabled/enabled。

Budget 超限时延后低优先级决策，并产生 summary diagnostic；不能跳过已经 committed 的攻击结算或改变 authority tick 顺序。

## Save、Multiplayer 与 Trace

- Save 可以保存 active goal、task state、commit/cooldown、必要 memory 与 deterministic scheduler cursor；不保存 Physics query cache 或第三方 planner native object。
- AI 只在 authority 运行。客户端复制 gameplay-visible state，例如 target、telegraph、ability execution 与 animation semantic state，不复制完整 blackboard 或 utility score。
- Trace 记录 sensor sample、candidate goals、score breakdown、goal switch、task transition、intent、failure 和 budget delay。
- 默认 DevTools 只展开选中 agent，summary 只聚合 goal/task/budget 计数，避免每帧复制全部 agent trace。

## 最佳实践

### 模块集成

- AI module 通过 DI 获得 World read model、PhysicsQueries、NavigationHandle、clock 和 intent sink，不创建对应 runtime。
- Sensor、consideration 和 task executor registry 在启动时检查重复 type；每个 agent definition 首次 bind 时从 DataRegistry 编译并缓存 sensor/goal/task/scheduler 索引，update 热路径不重复查询 definition。
- 使用 memory fixture 验证 deterministic selection、interrupt、timeout、cleanup 和 trace；第三方 planner/steering adapter 再运行专属 conformance。
- `onTrace/onTraceError` 只用于 DevTools/diagnostics 旁路，observer 失败不能改变 goal、task 或 intent 结果。

### 模块使用

- 角色差异由 data + registered definitions 组成，不为每种敌人复制一套 update loop。
- Encounter director、boss phase、剧情规则和 wave budget 留在 app/TCA，不塞入单 agent AI Core。
- Steering、movement integration、projectile 和 animation 不由 AI task 直接实现；task 只提交 intent。
- 高频 spatial candidate 应共享索引或缓存，不能让每个 agent 每 tick 扫描全部 World entity。
