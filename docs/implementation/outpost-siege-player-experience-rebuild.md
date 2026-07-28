# Outpost Siege Player Experience Rebuild

Status: Active.

## Current Increment

2026-07-27 已完成 Rifle 纵切的第一段权威闭环：

- `main.tsx` 不再把 Rifle click直接发送为 reliable combat action；`fireHeld` 与单调 `fireSequence` 随 managed input进入 authority，短 click不会因采样间隔丢失，Reload/Dash/Tactical/Deploy统一进入 reliable `player-action` envelope与玩家 action boundary。
- 新增独立 authority weapon runtime，拥有 24/144 弹药、120ms cadence、shot sequence、空仓自动换弹与 `R` 手动换弹 edge去重。
- Reload 使用 `ability.outpost.rifle_reload` 的 prepare/commit/recover execution；弹药只在 GAS commit 后转移。
- Reliable action codec不再接受 Rifle，避免绕过 weapon cadence/ammo直接调用 Combat。
- Colyseus Schema 升级到 `outpost.field-state.v6`，复制 weapon phase、ammo、reload timing、shot sequence、最近接受射击的 correlation、当前 reload request/correlation与最近有界反馈。
- 客户端 HUD显示弹匣/备弹、reload进度与拒绝原因；现有 Animator phase、Rifle spatial SFX、projectile presentation继续消费同一 execution，local shot sequence触发有界 camera recoil。
- Reliable 离散动作已统一进入 `gameplay/player/action-runtime.ts`：Reload占用 full-action channel，Shock/Deploy冲突时稳定拒绝；新的 Rifle edge或已被 authority 接受的 Dash可在 commit前取消 Reload，commit后遵守 GAS `afterCommit: deny`，被 cooldown拒绝的 Dash不会误取消 Reload。
- Reload request/cancel/reject在 authority、Colyseus和 HUD中保留同一 correlation；HUD只在有界时间窗展示最近反馈，历史不会增长为无界日志。
- 新增 `presentation/player/client-player-presentation.ts` 作为 app-owned `PlayerPresentationFrame` 起点：本地 Rifle edge/held cadence只预演表现，不创建 gameplay projectile、damage或 ammo commit；authority按相同 shot correlation确认或拒绝。
- 本地 cue history固定为32条、pending anticipation最多8条、authority timeout为1秒；拒绝/超时会取消相关 cue及其依赖预测链。客户端立即播放 muzzle pulse、Rifle SFX和 camera recoil，authority确认不重复播放，rejection只播放轻量 deny pulse。
- Slice 5审计确认 Combat Core 的 `projectile_despawned` 缺少销毁前空间事实，app不能可靠生成 world impact。该缺口已按 [ADR 0046](../adr/0046-bounded-combat-projectile-lifecycle-facts.md) 补足：spawn/despawn改为有界公共 fact，despawn携带 final transform/velocity及可选 target/blocker impact，原始 query、candidate、payload、metadata和 hit memory不进入 EventBus。

验证证据：Rapier authority integration覆盖短 click、24 发持续射击、无伪 rejection、自动换弹、GAS commit、commit前 Rifle/Dash取消、commit后拒绝取消、full-action冲突和被拒 Dash不产生副作用；Room authority覆盖 reliable action统一入口、reload correlation与 Rifle action绕过拒绝；Schema测试覆盖 weapon/shot correlation/reload correlation/feedback round-trip；client presentation测试覆盖 held cadence、confirm/reject、依赖链取消、超时与有界历史，memory Renderer/Audio integration覆盖即时 muzzle/SFX和authority去重。Combat契约测试覆盖 bounded spawn、impact/expire/custom cancel despawn、event policy关闭、unsubscribe和真实 Rapier sweep；事件开启的 300 projectile × 20轮 churn产生12,000条 lifecycle fact，p95 5.94ms、max 5.98ms、最大抽样 payload 292B，unsubscribe与 dispose retained均为0，15项预算通过。真实 1280×720 Phaser 双客户端已通过 v6 Schema进入 running，初始显示 `24 / 144 · RIFLE READY`；真实 click/短 hold使 authority ammo按 cadence从24收敛到23再到21，捕获帧显示本地 fire pulse且另一客户端持续在线，场景与 HUD无新增裁剪，两个客户端控制台都只有既存 Rapier deprecation warning。

尚未关闭 Slice 1/2：Gamepad物理设备验收、authority result bounded cue stream/watermark、impact/hit confirm、完整 muzzle/tracer表现和真实多帧角色动画仍需后续增量。本地 Rifle anticipation/correlation已闭环，但当前 `PlayerPresentationFrame` 仍需继续合并 authority result cue与其他 action channel。

Gamepad 底层依赖已按 [ADR 0045](../adr/0045-web-gamepad-input-source-and-polling.md) 实现：Input Core、Web adapter、App Host polling lifecycle 和 Outpost semantic binding 已接通，未在 React/Phaser gameplay 中增加本地轮询。确定性测试与无手柄 Chromium 启动链已通过；物理手柄浏览器验收仍记录在 [`web-gamepad-input-source.md`](web-gamepad-input-source.md)，不再阻塞非实机玩家切片。

## Goal

把 Outpost 玩家从“可移动并触发四个占位动作”重做为一条完整、可调、可复制、可表现的角色竖切。长期玩家合同见 [`../apps/outpost-siege/player-experience.md`](../apps/outpost-siege/player-experience.md)；本文件只记录现状审计、拆分顺序、验证和关闭证据。

本工作流不通过继续扩大 `authority-combat.ts`、`client-shadow-runtime.ts`、`client-presentation-module.ts` 或 `main.tsx` 完成。先建立玩家域边界，再按可独立验收的体验切片迁移。

## Baseline Audit

| 领域              | 当前实现                                                      | 与长期目标的差距                                                                              | 归属                                       |
| ----------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Input             | WASD、鼠标 aim、单次 click fire、Space/Q/E                    | 无 held fire、reload、interact、ping、build selection、Gamepad；入口直接 switch ability       | Outpost control + Input source             |
| Player definition | actor、weapon、body、render object、move speed                | 无 loadout、movement profile、Animator binding、interaction/presentation profile              | Outpost content/domain                     |
| Movement          | 每 tick直接把 input 映射到目标速度                            | 无 acceleration/deceleration、action arbitration；Dash 可能被普通 movement 覆盖               | Outpost movement + Physics transition      |
| Weapon            | weapon 只有射速、damage、projectile 参数                      | 无 magazine/reserve/reload/shot sequence/heat；射击由 click action触发                        | Outpost weapon runtime                     |
| Ability           | 四值 `OutpostCombatAbility` + `main.tsx` switch               | Dash/部署仍是 app-local即时路径；没有 action channel、稳定 rejection 投影                     | Outpost player ability orchestration + GAS |
| Combat            | Rifle/Shock 已进入 GAS + Combat delivery                      | 缺 ammo/reload、完整 target policy、down/revive、玩家 action conflict                         | Outpost policy/state                       |
| Replication       | transform + 最近 active execution + attributes/cooldown       | 无 weapon/reload/action channel、rejection、cue stream/watermark、interaction                 | Outpost Schema/projection                  |
| Animator          | speed/dead 两参数，所有 phase 映射到 `attack`                 | asset animation全是 `frames: [0]`；无方向、layer、reload/dash/hit reaction                    | Outpost assets/binding/presentation        |
| Feedback          | phase tint/scale，rifle/enemy telegraph 合成音                | 无 muzzle/impact/hit confirm/crosshair/telegraph/camera shake/damage direction；hit SFX未消费 | Outpost cue presentation                   |
| HUD               | health/shield、四个 cooldown/resource 文本                    | 无 ammo/reload、phase progress、rejection reason、interaction/world UI                        | Outpost view model/UI                      |
| Tests             | authority结果、复制、Animator/Audio memory contract、移动预测 | 缺真实资源、held fire、浏览器动作手感、两客户端 cue 和 Gamepad E2E                            | Outpost quality                            |

本轮审计发现的框架缺口是 Input Core 虽声明 `gamepad` device，但 Web/Phaser 运行链没有 Gamepad source/polling adapter。该缺口已通过 Input Core polling/value/device identity、`@gamekit/input-dom` Web adapter 和 App Host source polling 补足。Camera shake、Animator ability-specific phase mapping、Phaser particle、Audio SFX/spatial、Combat/GAS Cue 与 Multiplayer managed prediction 已存在；没有新证据前不扩张对应 Core。

该缺口没有由 Outpost 局部绕过。Player Slice 1 的 Gamepad 子项已经通过 Core/Web/App Host 自动门禁，真实物理设备验收继续由独立工作流保留。

## Target Execution Chain

```txt
raw device input
  -> Input Core action + scope
  -> Outpost control frame / discrete action
  -> Multiplayer managed input/action queues
  -> authority player action arbitration
  -> movement / weapon / GAS execution request
  -> Physics + Combat + GAS result
  -> authority player projection + bounded cue stream
  -> client presentation frame
  -> Animator / VFX / Audio / Camera / world UI / HUD
```

每一层都有单一输入和输出合同。UI、native renderer callback 和 network callback 不直接写 gameplay state。

## Implementation Slices

### Slice 1: Player Domain And Control

- 建立 `content/player`、`domain/player`、`gameplay/player`、`realtime/player` 和 `presentation/player` 边界。
- 扩展 player/loadout/movement/weapon definition，Shared Supply 从玩家 actor resource 投影中移出。
- 把 `main.tsx` 的 ability switch迁入玩家 semantic action mapping。
- 连续控制加入 `fireHeld`，离散 action加入 reload/dash/tactical/deploy/interact/ping。
- 为 Web/Phaser补 Gamepad source，并覆盖 scope、dead zone、设备切换和 cancelled state。

Gate：同一 control/action log 能在 local authority 与 Room authority产生等价玩家 semantic snapshot；focus/reset 后所有 transient held state清零。

### Slice 2: Rifle Vertical Slice

- 增加 magazine/reserve/reload execution/shot sequence/next shot time。
- Held fire按 authority cadence提交 GAS rifle execution，不按 click次数射击。
- Reload使用完整 prepare/commit/recover/cancel；ammo commit与 cooldown遵守 authority phase。
- Projection加入 weapon state、action rejection 和 shot cue sequence。
- 本地 muzzle/recoil anticipation与 authority commit/reject使用 correlation收敛。

Gate：单人和两客户端覆盖持续射击、空仓、自动/手动换弹、commit前后取消、网络 burst、拒绝和 cue去重。

### Slice 3: Movement, Dash And Camera

- 使用数据化 movement profile实现 acceleration/deceleration、strafe/facing分离和受控 modifier。
- Authority与 prediction复用同一 Physics transition。
- Dash进入 player action arbitration与 GAS execution；普通 movement不得覆盖 active dash。
- 添加 collision-shortened dash、单次 correction recover、lookahead和有界 camera impulse。

Gate：持续移动不产生系统性 correction；Dash撞墙、斜向、无输入 fallback、cooldown/rejection和不同刷新率均收敛。

### Slice 4: Character Assets And Animator

- 制作并审核玩家 direction/pose sheet，生成真实 spritesheet/atlas与 manifest。
- 建立 locomotion、upper action、reaction和status layer；ability id + phase映射到独立 clip。
- 加入 run、fire、reload、dash、tactical、hit、downed/revive/death与 visual socket。
- Local anticipation、remote phase recovery、late join和generation reset共用同一 controller。

Gate：浏览器中可肉眼区分所有动作；locomotion参数变化不 reset clip；单帧 fixture只保留在底层契约测试。

### Slice 5: Combat Feedback

- 建立 app-owned bounded cue projection、watermark和 client cue consumer。
- 实现 crosshair、muzzle/tracer、world impact、shield/health hit、kill confirm和damage direction。
- 实现 telegraph形状/进度、rejection feedback、camera impulse和真实 SFX variation/concurrency。
- 所有表现读取同一 presentation frame/correlation，不读取 raw Schema猜测结果。

Gate：miss/world/shield/health/kill/rejected六种结果可辨认；late join/reconnect不重播旧 one-shot；低特效设置仍保留关键信息。

### Slice 6: Tactical, Build And Interaction

- Shock Field完成 targeting、preparing telegraph、commit、area result和recover。
- Build加入 selection、preview、socket/range/obstacle reason、reservation和confirm/cancel。
- Interaction统一 repair/revive/objective候选、优先级、channel和中断原因。

Gate：所有 action都经 semantic intent → GAS/Combat/authority policy，不新增入口 id switch或 renderer特判。

### Slice 7: Downed, Revive And Cooperative State

- 增加 downed/incapacitated/revive protection与受限移动/输入。
- 两客户端覆盖 revive channel、取消、重连、全员失能和 HUD/world提示。
- 结果与统计只读取 authority stable summary。

Gate：完整玩家失败/恢复流程可在 headless和浏览器重放，动画或音频失败不改变结果。

### Slice 8: Closure

- 拆除迁移完成后的旧 input booleans、ability enum switch、共享大文件职责和占位表现。
- 跑真实浏览器双客户端、键鼠/手柄、横竖 viewport、reduced motion与长时 reconnect。
- 建立玩家 authority/client/presentation benchmark与 retained-state预算。
- 迁移稳定结论、关闭本文档并记录最终提交。

## Review Gates

每个 Slice 必须同时满足：

- 行为契约测试，不只断言 private map/counter。
- 至少一条真实 Rapier authority链路。
- 涉及复制时至少两客户端验证。
- 涉及表现时使用真实 Phaser/browser验收，不只使用 memory adapter。
- 新增状态有 hard limit、reset、disconnect和dispose策略。
- GitNexus impact/detect-changes只覆盖预期玩家流程；触及 Core公共 API时单独评审并补 ADR/模块文档。

## First Working Target

第一条实现竖切是 Rifle：`held fire → weapon cadence/ammo → GAS execution → Combat projectile → hit result → replicated cue → Animator/VFX/Audio/Camera/HUD`。它能同时验证操作、角色状态、技能、战斗、复制和动效，是判断玩家架构是否成立的最小完整体验；在这条竖切通过前不增加新武器或新角色。
