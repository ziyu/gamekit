# ADR 0051：Backend-neutral Physics Body Command

## 状态

Accepted

## 背景

Physics Core 目前用 `PhysicsScene.updateBody(...)` 和 `PhysicsBodyPatch` 表达位置、旋转、速度、重力与 sleeping 的目标状态。
它适合 World 同步、权威校正和 kinematic 目标，却不能无损表达一次性 linear/angular impulse、world-space application point、
wake policy、命令身份和拒绝原因。Arena 若直接调用 Rapier native body，可以得到正确物理效果，但会让玩法绑定 backend，且
prediction island 无法按相同 tick/sequence 重演同一个操作。

GitNexus 对 `createPhysicsPredictionIsland(...)` 的 upstream impact 为 **HIGH**：16 个受影响符号、10 个直接消费者、1 条执行
流程，覆盖 Arena、App Host、Sandbox、benchmark 与回归测试。因此 body command 必须作为 additive 协议进入 scene/island，
不能改写现有 patch 的语义或要求已有 consumer 迁移。

## 决策

### Patch 与 Command 分离

`PhysicsBodyPatch` 继续表示“把 body 状态设为目标值”。Physics Core 新增一次性 `PhysicsBodyCommand`：

```ts
export type PhysicsBodyCommand =
  | {
      type: "linear-impulse";
      bodyId: PhysicsBodyId;
      impulse: PhysicsVector;
      point?: PhysicsVector;
      wake?: "wake" | "preserve";
    }
  | {
      type: "angular-impulse";
      bodyId: PhysicsBodyId;
      impulse: PhysicsRotation;
      wake?: "wake" | "preserve";
    };

export type PhysicsBodyCommandEnvelope = {
  tick: number;
  sequence: number;
  correlationId?: string;
  command: PhysicsBodyCommand;
};
```

第一版不把 force accumulator、joint motor、ragdoll、constraint 或 backend handle 放进公共协议。Kinematic target 继续使用
`updateBody({ position, rotation })`；如果后续 backend 证明需要 sweep/velocity-aware kinematic command，再单独扩展 union。

`PhysicsScene.applyBodyCommand(...)` 返回显式结果：`applied`、`body-missing`、`invalid-command`、`unsupported` 或
`body-kind-mismatch`。未知 body、非有限向量、dimension 不匹配或 backend capability 缺失不得静默近似。

### Capability 与 Adapter

`PhysicsBackendCapabilities` 增加可选 body-command capability，分别声明 linear impulse、application point、angular impulse 和
wake policy。Memory backend 提供确定性参考语义；Rapier2D/3D 映射到底层 impulse API。2D angular impulse 使用标量，3D 使用
三维向量；不匹配的 rotation 类型必须拒绝并记录 diagnostic。

Core conformance 先覆盖命令校验、结果、wake、point-induced angular response、重复执行边界和 checkpoint restore 后重放，再让
两个 Rapier adapter 使用同一测试套件。Adapter native diagnostics 可以暴露 capability 摘要，但 native body 类型不能进入公共
结果。

### Prediction Island 集成

`PhysicsPredictionIslandCommand` additive 增加 `body-command` variant，继续使用 island 已有 tick、sequence、duplicate、conflict、
history 和 replay budget。Island 在相同 tick 内按 sequence 稳定排序；spawn 必须早于引用新 member 的 command，despawn 之后的
command 必须显式拒绝。Command signature 包含完整 payload，duplicate 不重复施加 impulse，conflict 进入现有诊断。

Authority 与 client 都通过同一个 command materializer 执行 body command。Arena 不读取质量、惯量或 native handle自行换算速度；
数值 profile 直接声明物理 impulse，由 backend solver 负责质量和接触响应。

### 诊断与预算

Physics scene/module/island 至少记录 applied、missing、invalid、unsupported、kind mismatch、duplicate、conflict、capacity 与 replayed
command 数。Envelope 的 tick/sequence/correlation 用于 trace，不允许形成无界 command journal。现有 `maxCommands` 和 replay work
预算继续生效。

## 备选方案

### 用 `linearVelocity` patch 模拟 impulse

拒绝。它覆盖已有速度、绕过质量/惯量与 application point，不能表达真实推挤、重物差异和角动量。

### Arena 直接调用 Rapier native body

拒绝。它破坏 backend-neutral 公共边界，也无法被 memory/Rapier2D fixture 和 prediction replay 共同验证。

### 把 command 放进 EventBus

拒绝。Body command 是 fixed-step 高频确定性输入，不是低频事实；EventBus 顺序、重放和副作用语义不适合作为 solver command
queue。

## 后果

- 现有 `updateBody`、Physics module 和无 command consumer 保持兼容。
- Physics Core 新增一条需要 memory、Rapier2D、Rapier3D、prediction island 和 benchmark 共同维护的公共协议。
- Character controller、Combat knockback、道具投掷和机关可以共享同一 impulse 路径，不再各自写 native adapter glue。
- Joint、ragdoll、constraint 和持续 force 仍不在本决策范围内。
