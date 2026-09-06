# ADR 0053：Physics Arena Auxiliary Replay Contributor

## 状态

Accepted

## 背景

`createStandardMultiplayerPhysicsArenaPrediction(...)` 已统一 authority frame、完整 prediction island、input mapping、baseline、
reconcile、hard correction 与 dispose。当前 `mapInput(...)` 只产生 spawn/patch/despawn，island checkpoint 只保存 solver scene 和
member definition。无状态移动可以正确重演，但 character motor 的 coyote/buffer/dive/recovery timer 等确定性状态无法在同一 tick
restore；如果 app 在 snapshot callback 外自行保存并重演这些状态，就重新产生一套手写 rollback lifecycle。

现有通用 rollback coordinator 适合 World/RNG/PhysicsModule 的显式跨模块 checkpoint，但不能与同一批 island body 再拥有一次
solver checkpoint。Auxiliary state 必须随 island 历史推进，同时维持“solver 只有一个 rollback owner”。

GitNexus 显示高层 `createStandardMultiplayerPhysicsArenaPrediction(...)` 影响为 **LOW**（4 个符号、2 个直接消费者、1 条客户端
流程），但其底层 `createPhysicsPredictionIsland(...)` 为 **HIGH**（16 个符号、10 个直接消费者）。因此扩展必须可选、additive，
且底层 island、App Host、Arena、Sandbox、benchmark 和现有无 contributor consumer 都要回归。

## 决策

### Island-owned Auxiliary Contributor

Physics Core 为 prediction island 增加 backend-neutral、opaque 的 auxiliary contributor。它不拥有第二个 Physics scene：

```ts
export type PhysicsPredictionIslandAuxiliaryContributor<
  TCommand = unknown,
  TCheckpoint = unknown,
  TAuthorityState = unknown
> = {
  id: string;
  order?: number;
  apply(command: TCommand, context: AuxiliaryApplyContext): void;
  capture(context: AuxiliaryCheckpointContext): TCheckpoint;
  validate?(checkpoint: TCheckpoint, context: AuxiliaryCheckpointContext): boolean;
  restore(checkpoint: TCheckpoint, context: AuxiliaryCheckpointContext): void;
  reconcile?(authority: TAuthorityState, context: AuxiliaryReconcileContext): void;
  reset?(context: AuxiliaryResetContext): void;
  measureBytes(checkpoint: TCheckpoint): number;
  hash(checkpoint: TCheckpoint): string;
  dispose?(): void;
};
```

`apply` 只获得受限的 island simulation facade：按 stable member id 读取 body、执行 Physics query、提交 patch/body command，不能
capture/restore/dispose scene，也不能访问 provider、Renderer、World 或 native backend。Contributor id 唯一、order 稳定；异常或验证
失败触发 hard correction/rebuild，不允许留下半恢复状态后继续 replay。

### Typed Command 与 Authority Projection

`PhysicsPredictionIslandCommand` additive 增加 `auxiliary` variant，携带 contributor id 和 opaque payload，继续受 tick、sequence、
duplicate/conflict/capacity/replay budget 管理。每个 tick 的稳定顺序是 member spawn/despawn boundary、按 sequence 的 auxiliary/body/
patch command、Physics step、contact collection、完整 checkpoint capture。

`PhysicsPredictionIslandStateSnapshot` 可选携带每个 contributor 的 authority state envelope。Physics Core 只校验 id 唯一、容量、
measure/hash 和 contributor 是否存在，不解释玩法 payload。App Host 的 typed Arena mapper 负责把 app schema 转成 contributor 的
typed command/authority state；provider wire schema仍归 app/backend。

Character motor contributor 持有 member id → `CharacterMotorState`，应用 `CharacterControlIntent` 后通过受限 facade 产生 ADR 0051
body command。它不捕获 island 已拥有的 body/collider/solver，也不包含 AI、match、item authority、Animator 或 UI state。

### 同 Tick Lifecycle

Island checkpoint 扩展为 solver checkpoint + 有序 auxiliary checkpoints。Capture、restore、future-history truncation、generation/
membership reset、hard correction、history eviction、byte budget 和 dispose 必须作为一个生命周期操作：

1. 初始 scene/material/member 建立后 capture tick 0 auxiliary state；
2. live advance 与 late-command replay 对同一 tick 执行同一 auxiliary command；
3. reconcile 先恢复 solver 和全部 contributor，再删除未来 checkpoint并重演；
4. authority auxiliary state 缺失、id/version 不匹配或超预算时拒绝 partial reconcile；
5. generation/membership revision 变化安装完整 baseline并 reset contributor；
6. dispose 清空 history/command/checkpoint 后按逆 order dispose contributor。

Contributor bytes 计入 island `maxCheckpointBytes` 与 `maxHistoryBytes`，diagnostics 分别报告 solver/auxiliary bytes、capture/restore/
replay failure、missing contributor、hash mismatch 与 retained contributor 数。每个 contributor 还必须声明独立 max bytes，避免一个
app-local map 吞掉整个 history 预算。

### App Host 默认组合

`createStandardMultiplayerPhysicsArenaPrediction(...)` 增加可选 `auxiliary` descriptors、typed input mapper 与 authority state mapper；
未配置时行为和输出必须与当前版本一致。App 只注册 definition 和 gameplay mapping，不手写 reconcile/capture/restore/replay/reset
顺序。

通用 `createStandardMultiplayerRollbackDomain(...)` 继续用于 island 外的 World/RNG/gameplay state。安装时若 Physics rollback
contributor 与 Arena island 声明相同 owner/member scope，组合层必须拒绝 duplicate ownership。

## 备选方案

### 把 motor state 写进 body `userData`

拒绝。它混淆 solver/public metadata 与 gameplay state，增加 snapshot payload，并让 backend checkpoint格式意外决定 controller
协议。

### Arena 在 session callback 维护独立 motor history

拒绝。它会重复 generation、history、reconcile、budget、hard correction 和 dispose，正是标准 Arena adapter 要消除的手工逻辑。

### 用通用 rollback coordinator 再捕获 island Physics

拒绝。同一 solver state 出现两个 owner，restore 顺序和 future history 会产生不可解释的分叉。

## 后果

- Existing Arena/Sandbox consumer 不注册 contributor 时保持当前行为。
- Physics prediction island 的 checkpoint/replay contract 变强，必须扩展 conformance、byte budget、failure atomicity 和 retained-state
  测试。
- Character controller、未来可预测载具辅助状态或确定性局部 gameplay state 可以共享同一协议，但必须保持小范围、有界且不包含
  authority-only 结果。
- App Host 承担 typed mapping 和默认生命周期；Multiplayer Core 仍不依赖 Physics 或 character controller。
