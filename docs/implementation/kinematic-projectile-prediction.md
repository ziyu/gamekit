# Kinematic Projectile Prediction Foundation

Status: Closed on 2026-07-29.

## Scope

本工作流实现 ADR 0047 中 `kinematic-data-buffer` 的底层闭环与独立 Sandbox 验证场，不接入 Outpost。
`predicted-entity` 与 prediction-island resimulation 仍保持独立策略边界，不用不完整的单主体 replay 冒充。

## Implemented Foundation

- Physics Core 新增无状态 ray/shape kinematic sweep step；owner 与 authority 通过同一 `PhysicsQueries` facade、
  delta、shape 和 filter 得到首个空间结果。Shape path 明确区分世界接触点与移动形状在 TOI 时的原点，Rapier
  2D/3D adapter 不再把 local/query-shape witness 当作公共命中点。
- Combat 新增 projectile network strategy vocabulary、有界 fire/finish record buffer、fixed-tick kinematic
  runtime、remote record sampling 与 pending/confirmed/corrected 比较。
- Multiplayer Core 新增有界 predicted-spawn registry，覆盖 correlation/generation、local/authority identity、
  confirm/reject/duplicate/stale、age/capacity 和内部 order index compaction。
- 根目录新增 `bench:projectile-prediction` 与 `bench:projectile-prediction:check`，同时约束 record churn、真实
  Physics sweep、remote reconstruction、spawn matching、零 blocker penetration 和 dispose retained state。
- Sandbox 新增 `?scene=multiplayer-projectile-lab`。场景运行 authority、owner、remote 三个真实
  Multiplayer runtime；owner/authority 使用独立 Physics scene，remote 只按 authority record timeline 重建。

## Sandbox Acceptance

正常模式：

- 点击 `Fire predicted shot` 后 owner 在下一帧开始移动，不等待 authority。
- 240ms 默认 RTT 下最终显示 `MATCHED`、`CONFIRMED`、`0.000 u` owner penetration。
- Owner、Authority、Remote 三条时间线都停在各自已知 blocker，不出现权威到达后倒退或穿墙补爆炸。

故障注入：

- 开启 `Layout divergence` 会重置 generation，并只把 authority wall 左移 8 units。
- 下一发最终显示一次 `CORRECTED 8.00u`；owner 仍停在自己的 blocker，penetration 保持 0。
- 旧 generation 的延迟 command/record 不得进入新一轮，reset 后三条 lane 清空。

## Validation Evidence

- Physics Core：22 tests passed；Rapier 2D/3D 额外覆盖非零半径 shape origin 与 world contact point。
- Multiplayer Core：54 tests passed。
- Combat：20 tests passed，其中真实 Rapier ray/shape kinematic blocker integration 通过。
- Sandbox Multiplayer Projectile Lab：4 deterministic tests passed。
- Projectile prediction benchmark：11 budgets passed；1000 projectile real memory-physics sweep 的 blocker
  penetration 和 dispose retained state 都为 0；100,000 次 spawn matching 后 pending 为 0、隐藏 pending order
  index 不超过 16。
- Browser + Rapier 2D：正常路径 `MATCHED / CONFIRMED / 0.000u`；fault path
  `MATCHED / CORRECTED 8.00u / 0.000u`；console 0 error。
- Benchmark 使用 process CPU time 排除共享机器调度等待，同时保留本进程计算与 GC 成本；p95 使用与仓库
  其他稳定基准一致的 nearest-rank 计算，不再把 20 个样本的 p95 等同于 max。关闭验收时
  `bench:projectile-prediction:check` 连续三次通过全部 11 项预算，同时继续单独报告 max 尖峰。

## Integration Gate

Sandbox 已于 2026-07-29 完成人工验收。本工作流按原边界关闭，不修改 Outpost 的 Rifle networking/
presentation；后续 Outpost integration 由 `outpost-siege-player-experience-rebuild.md` 继续记录，把 Rifle
definition 绑定到 `kinematic-data-buffer`、替换 render-only handoff，并复用同一 conformance 与 benchmark，
不在 app 内增加本地 collision 特判。

## Closure

- 默认 240ms RTT 下，真实浏览器确认 owner 下一帧预测、三 peer `MATCHED / CONFIRMED`、owner penetration
  `0.000u`，Owner、Authority 和 Remote 均停在已知 blocker。
- `Layout divergence` 把 generation 从 1 重置到 2，真实浏览器确认只产生一次
  `MATCHED / CORRECTED 8.00u`，owner penetration 仍为 `0.000u`。
- 在存在延迟 fire command 时执行 `Reset generation`，generation 推进到 3；等待超过默认 RTT 后三条 lane 仍
  为空，command/record queue 均为 `0 / 0`。
- 浏览器控制台为 0 error；Rapier 初始化仍输出其现有 deprecated-parameter warning，不改变 Lab 结果。
- `corepack pnpm exec vitest run <7 个 projectile/sweep/spawn/Lab test files>`：7 files、20 tests passed。
- `corepack pnpm bench:projectile-prediction:check`：静止环境连续三次通过 11 budgets；每次 blocker
  penetration、unfinished projectile、dispose retained state 和 pending spawn 均为 0。
- `corepack pnpm --filter sandbox build` 与 `corepack pnpm build`：通过；全仓 build 为 49/49 tasks。
- 任务内 lint 与 format：0 error、0 task-owned warning；全仓 lint 为 91/91 tasks。全仓 format 仍报告 8 个
  与本工作流无关的既有 AGENTS/CLAUDE/GitNexus skill 文件。
- `corepack pnpm test`：Projectile Lab、Physics、Combat、Multiplayer 与 Sandbox 测试通过；全仓另发现
  Outpost 四客户端 fixture 的既有 `entityCount` 期望为 39、当前相邻未提交反馈改动实际为 40，不属于本工作流。
- 稳定结论已经迁移到 ADR 0047、`docs/architecture.md`、`docs/modules/{physics,combat,multiplayer}.md`
  和 `docs/best-practices.md`。本工作流没有独立提交；最终提交由包含它的 Outpost 父工作流统一记录。
