# Physics Projectile Prediction Island

Status: Closed

## 目标

在 Multiplayer Projectile Sandbox 中加入一类真实 solver-owned 刚体弹，并补齐它所依赖的可复用底层能力：
Rapier 全场景 checkpoint、材质参数、CCD、完整 prediction island restore/replay、predicted spawn matching、
有界诊断与性能预算。Sandbox 只拥有战场、武器数值和表现；通用 solver/history 能力留在 Physics Core 与 adapter。

## 实现范围

- Physics Core：scene checkpoint capability/envelope、CCD body 定义、scene-local material registry、
  `createPhysicsPredictionIsland(...)` 以及 late command/reconciliation/overflow/dispose diagnostics。
- Rapier 2D/3D：native world snapshot capture/restore、stable handle rebuild、材质 friction/restitution/density/combine
  映射和 CCD。
- Sandbox：重力反弹刚体弹、可推动动态目标、三 peer 延迟快照、完整岛 reconciliation、权威 contact damage、
  独立刚体表现和 replay/checkpoint/contact 遥测。
- 验证：Core/Rapier/Sandbox 集成测试与 projectile prediction benchmark 的完整岛压力 profile。

## 验收证据

- `corepack pnpm exec vitest run --config vitest.config.ts packages/physics-core/test/prediction-island.test.ts packages/physics-rapier2d/test/prediction-island-checkpoint.test.ts packages/physics-rapier3d/test/physics-rapier3d.test.ts apps/sandbox/src/scenes/multiplayer-projectile-lab/multiplayer-projectile-lab.test.ts`：18 tests passed。
- `corepack pnpm bench:projectile-prediction:check`：15 budgets passed；24-member/120-tick/30-tick rollback profile
  p95 61.892 ms、history 987,907 bytes、dispose retained state 0。
- Sandbox production build 与 Physics Core/Rapier 2D/Rapier 3D package build 通过。
- 浏览器实射：刚体弹呈现重力抛物线和三 lane ghost；命中后 Authority 结算 46 damage、目标生命降到 79%、
  target body 产生位移、6 个刚体 contact，spawn 状态 `MATCHED`，reconciliation 为 `ISLAND CONFIRMED · 7T`，
  checkpoint heap 约 1.7 MB；console 无 error，仅保留 Rapier 0.19 初始化 API 的已知弃用 warning。

## 关闭记录

工作流已关闭。长期结论迁移到 `docs/architecture.md`、`docs/modules/physics.md`、`docs/best-practices.md`、
`docs/apps/sandbox.md` 与 ADR 0047。Rapier 初始化弃用 warning 涉及多个 app/server/benchmark 的 HIGH-risk 公共
初始化入口，不在本工作流中夹带修改；后续应作为独立 adapter 兼容性任务处理。
