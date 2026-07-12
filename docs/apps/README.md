# 应用设计文档

本目录维护 `apps/` 下长期存在的应用、demo、editor 和验证面的设计文档。

这里记录应用级体验目标、场景结构、模块协作方式、交互方式和长期约束。它不记录阶段状态、临时计划或完成定义。

## 职责边界

- 应用或 demo 的长期设计放在本目录。
- 通用包边界和依赖方向放在 `../architecture.md`。
- 单个模块的最终长期协议放在 `../modules/`。
- 应用相关工作流的任务拆分、当前状态和验收证据放在任务系统、PR 或 `../implementation/`。
- 高影响决策背景放在 `../adr/`。

不要把某个 app 的演示设计复制到模块文档。若一个 app 内部概念后来被证明可复用，再提炼到对应模块设计文档。

## 应用索引

- `sandbox.md`：Sandbox / Tiny Camp 框架验证面。
- `multiplayer-demo.md`：Multiplayer Colyseus Loopback 独立 demo app。
- `multiplayer-outpost-siege-demo.md`：基于 Room-owned authority、实体/物理、TCA/GAS 和现有资源工作流的全框架综合验证应用。
- `abyss-delve.md`：Abyss Delve 真实游戏验证应用。
- `three-demo.md`：Three Driver 独立能力实验台。
- `physics-2d-lab.md`：Physics Core / Rapier 2D 独立能力实验台。
- `physics-3d-lab.md`：Physics Core / Rapier 3D 独立能力实验台。
