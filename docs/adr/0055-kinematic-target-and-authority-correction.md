# ADR 0055：Kinematic Target 与 Authority Correction 语义分离

## 状态

Accepted

## 背景

Rapier 的 position-based kinematic body 有两种不同需求：正常模拟需要设置下一 fixed step 的 target，让 solver 根据前后 pose
生成接触速度并推动动态物体；多人 rollback reconcile 与 hard correction 收到的 authority pose 已经是某个 tick 模拟完成后的
状态，必须立即安装为当前 pose。

此前 `PhysicsScene.updateBody(...)` 只有一种 patch 语义。Rapier adapter 对 kinematic position/rotation 一律调用
`setNextKinematicTranslation/Rotation`。Authority reconcile 因而只写入 pending target，`getBodyState()` 在当前 tick 仍返回旧 pose；
下一次 authority frame 又覆盖 pending target，客户端 prediction island 中的旋转杆、活塞和移动平台长期停在初始 transform，
而 authority frame 本身正常运动。Renderer 若直接读取 authority frame 可以掩盖画面，却会让碰撞、角色承载和表现使用三套状态。

## 决策

`PhysicsScene.updateBody(...)` 增加可选 `PhysicsBodyUpdateOptions.kinematicTransformMode`：

- `target` 是默认值。Kinematic position/rotation 表示下一 simulation step 的目标；adapter 使用 backend 的 next-kinematic API。
- `teleport` 表示输入 pose 已属于当前已完成 tick；adapter 立即设置 body translation/rotation，不生成一帧待消费 target。

Physics prediction island 仅在 authority `reconcile(...)` 与 `hardCorrect(...)` 安装完整 body state 时使用 `teleport`。普通 gameplay
patch、hazard schedule、World-to-Physics 同步和预测 command 继续使用默认 `target`。Dynamic/static body 的现有 patch 行为不变。

Memory backend 没有 solver-owned next target，继续立即更新；Rapier 2D/3D adapter 必须用 conformance test 验证默认 target 在 step
前不可见、step 后生效，而 teleport 在 step 前立即可读。Arena 端到端测试还必须验证 authority 与 predicted kinematic pose 同 tick
收敛，且机关仍通过真实 Rapier contact 推动动态 body。

## 备选方案

### Renderer 直接读取 authority transform

拒绝。它只修画面，不修 prediction collision、moving-platform carry 或 replay 因果，并重新制造应用手写双状态分支。

### Reconcile 后额外推进一个零时长或虚拟 step

拒绝。它会改变 solver cache/contact lifecycle，且不能表达快照 pose 已属于当前 tick 的事实。

### 所有 kinematic patch 都立即 teleport

拒绝。普通移动机关将失去由连续 pose 推导的 solver velocity，接触对象不会获得正确推动效果。

## 后果

- Authority correction 和普通运动目标成为稳定、backend-neutral 的显式协议。
- 标准 Multiplayer Physics Arena helper 不需要应用为每种机关手写 authority-to-render 补丁。
- 其他 backend 若区分 kinematic target 与 immediate pose，必须映射同一选项；不区分的 backend 仍需通过公共行为测试。
- 新增了一个可选公共参数；既有两参数 `updateBody` 调用保持源码兼容，默认行为保持不变。
