# Knockout Arena 道具与物理战斗

## 领域边界

Arena Item domain 拥有道具定义、pickup claim、owner、carry/use/throw/drop、world respawn 和公开 item projection。
GAS 拥有 action execution/cooldown/effect，Combat 拥有 target validation、delivery、hit ticket 与去重，Physics 拥有真实 body、
contact、query 和 impulse。任何一层都不能重建其他层的生命周期。

游戏不以传统 HP 清空作为主要淘汰条件。道具和机关通过 Physics impulse、instability 与 stagger 改变位置优势；离开有效
场地才由 Match authority 提交 elimination。

## Identity 与 Definition

```ts
type ArenaItemInstanceId = string;
type ArenaItemGeneration = number;

type ArenaItemDefinition = {
  id: string;
  category: "throwable" | "melee" | "impact" | "utility";
  worldBody: DataRef<"physics.body">;
  carry: ArenaCarryProfile;
  action: ArenaItemActionDefinition;
  respawn: ArenaItemRespawnPolicy;
  presentation: DataRef<"arena.item-presentation">;
  networkStrategy: "predicted-entity" | "authority-only";
};
```

Definition id、instance id 和 generation 必须分开。一次 pickup 后再 throw 的物理 body 使用同一个 item instance 但递增
generation；旧 generation 的 contact、prediction、effect 或 delayed snapshot 不能结束新实例。

## 生命周期

```txt
spawning
  -> world
  -> pickup-pending
  -> carried
  -> windup
  -> committed
  -> released / melee-active / triggered
  -> spent / world
  -> cooldown
  -> respawning
  -> world
```

通用规则：

- `world` 才存在可碰撞 Physics member。
- `pickup-pending` 只是 authority arbitration，不提前产生最终 owner。
- `carried/windup` 使用语义 owner + presentation attachment；world body 已 despawn。
- `released` 以新 generation spawn Physics member；初始 transform/velocity/impulse 来自 authority commit。
- `spent` 清理 hit memory、fuse、effect 与 physics member；是否回到 world 或 respawn 由 definition 决定。
- 每个 transition 记录 authority tick、reason 与 correlation id，并且对重复 command 幂等。

## Interaction Targeting 与 Pickup Arbitration

客户端/AI 只提交 `interact` intent，不提交可信 item owner。Authority 在对应 tick：

1. 读取 actor 的 authority position/facing 和可交互状态。
2. 用 overlap/shape cast 获取有界候选，忽略自己、不可拾取 category 和无效 generation。
3. 按 view alignment、距离、item priority、instance id 稳定排序。
4. 对同 tick 多人 claim 按 command tick、sequence、距离和 participant id 稳定裁决。
5. 验证 winner 的 carry slot、stagger/recovery、item state 和 stage policy。
6. Commit owner，despawn world member，并发布一次 pickup result/cue。

失败结果必须区分 out-of-range、not-visible、already-claimed、invalid-state、carry-occupied、stage-blocked 和 stale-generation。
客户端 prediction 可以提前播放 reach/highlight，但 authority reject 必须 cancel，不能留下隐藏 owner 或删除真实 item。

## Carry

- 每名角色默认一个 carry slot。扩展多 slot 需要新的明确 UI/输入设计，不能静默堆叠。
- Carried item 使用稳定 socket semantic（例如 `hand.primary`），不把 Three bone/native object 写入 gameplay state。
- Carry profile 可以修改角色 max speed、acceleration、dive、jump、turn rate 和被击落时 drop policy。
- Carried item 不参与 solver contact。表现 attachment 只消费 owner presented transform；它不能作为命中或遮挡来源。
- Owner eliminated、disconnect grace 超时、stage 结束或 item action cancel 时执行 definition 的 drop/spent policy，且只执行一次。

## Use、Windup、Throw 与 Drop

Item action 走 GAS execution：`requested → preparing/windup → committed → active → recovering → completed/cancelled`。

- `usePressed/useHeld` 控制 request 与有限 charge；charge 由 authority tick 计算并钳制到 definition 上限。
- Commit 前被 stagger、eliminated、item owner change 或 stage transition 会 cancel，不生成攻击或 Physics body。
- Throw commit 解析 authority hand/socket position、normalized aim、charge curve、owner inherited velocity 和 collision-safe spawn。
- Spawn 先运行 capsule/shape clearance；失败时使用明确 fallback/drop，不把 item 生成在墙后或 owner collider 内。
- Drop 使用低速 world spawn，不触发 attack delivery；throw 才创建可命中的 active item generation。
- Melee commit 不生成隐藏物理锤 joint；Combat melee/shape delivery 从 authority actor/socket 空间事实求候选。

## 首组道具

| 道具   | 行为                               | Physics/Combat 策略                          | 约束                                 |
| ------ | ---------------------------------- | -------------------------------------------- | ------------------------------------ |
| 泡沫球 | 快速拾取、短蓄力、快速投掷、弹跳   | predicted dynamic entity + contact hit       | 有限 bounce/hit/lifetime；轻 impulse |
| 能量块 | 携带降速、长蓄力、重投、可再次拾取 | predicted dynamic entity + shape/contact hit | CCD、重 impulse、低最大速度          |
| 冲击球 | 投掷后 fuse 或首次碰撞触发范围冲击 | predicted entity + authority area delivery   | 一次 trigger、稳定半径、命中去重     |
| 泡沫锤 | carried windup 后近战弧，也可 drop | GAS phase + Combat melee shape               | 朝向/预兆清晰；无 native joint       |

所有 hit/bounce/fuse/lifetime、charge curve、carry modifier、effect reference 和 presentation id 都来自 Data；session、render
或 input 文件不维护道具 id switch。

## Instability、Stagger 与 Knockback

Arena actor 具有 authority `instability`，范围归一化并随安全时间衰减。成功 impact 计算：

```txt
base spatial impulse
  × item / hazard impulse profile
  × target instability response
  × charge / relative speed / contact angle factors
  × stage modifier
  -> clamped Physics impulse
```

同时提交有限 instability delta。设计约束：

- Physics contact 提供空间事实，不直接增加 score 或淘汰。
- Instability 越高，后续有效 impulse 可以越大，但 multiplier、单次 delta 和总值有硬上限。
- 小接触、持续 resting contact 和同一 hit ticket 不能每 tick 重复叠加。
- 超过 stagger threshold 时 GAS effect 提交 duration/severity；Character Controller 消费 movement modifier 和 external impulse。
- Instability 衰减使用 authority tick，并在 stage transition/reset 清理；客户端不能用 UI bar 值反向计算 gameplay。
- Friendly/self/environment relationship 与 stage rule 由 Arena policy 解释，Combat Core 不内置 player 阵营。

## Hit Pipeline

```txt
committed item action / active item contact
  -> stable Combat delivery request
  -> Physics candidate/contact
  -> relationship + generation + stage validation
  -> hit ticket dedupe
  -> GAS instability/stagger effect
  -> Physics impulse command
  -> authority impact ledger
  -> KO attribution / cue / trace
```

Effect application 与 Physics impulse 必须共享 correlation/hit ticket，但各自只有一个 owner。Contact、melee query、area query
不能为同一次 attack 重复结算。被 authority reject 的 speculative impact 只能撤销表现，不能补写 gameplay。

## KO/Assist 归因

Impact ledger 保留有界窗口，记录 source participant、target、item/action、hit ticket、impulse magnitude/direction、tick 和
environment cause。淘汰时 Match domain 只读取 ledger 的稳定摘要：

- 最后一个超过 threshold 且未过期的敌对 source 获得 KO。
- 窗口内其他有效贡献者按 definition 获得有限 assist。
- 自撞、纯机关、过期影响或无 source 记录为 environment。
- 归因不改变 elimination 是否成立，只解释结果和积分。

最终排名和 tie-break 见 [`match-flow.md`](./match-flow.md)。

## Multiplayer Prediction

- Continuous move/aim/charge 进入 fixed-step redundant input；pickup/use/throw/drop 的 edge/command 使用可去重 sequence。
- Owner 可以预测 pickup despawn、throw spawn 和 trajectory，但 item owner、hit、instability、stagger、KO 与 respawn 由 authority
  confirm/reject/correct。
- 可碰撞 released item 与所有潜在 contact actor 在同一 prediction island；不能只在 owner client 模拟 collision。
- Predicted item spawn 使用 correlation + item instance/generation 匹配 authority member；reject 必须清理 body/history/effect。
- Carried item 不在 island，remote/client 通过 authority owner/action phase 映射到 presentation attachment。
- Item member set 变化更新 membership revision 或使用标准 predicted lifecycle；应用不在 network callback 手写 reconcile。
- Impact/pickup/throw cue 使用 speculative effect journal，重复 replay/duplicate snapshot 不重复播放或累计。

更完整的输入、frame、fault 与 budget 规则见 [`multiplayer-and-prediction.md`](./multiplayer-and-prediction.md)。

## Respawn 与 Stage Cleanup

- Item respawn 使用 stage-owned spawn point、item instance 和新 generation；不能与 actor 淘汰/重生混为一套策略。
- Respawn point 需要 clearance、kill volume、hazard phase 和距离 active actor 的验证。
- Stage 结束原子 cancel pending claim/execution，despawn active items，清理 hit memory/ledger，并关闭旧 generation。
- 下一 stage 只创建其 DataPack 声明的 item set；旧 delayed contact/fuse/result 一律 stale。

## 诊断与测试合同

诊断至少公开 item state/owner/generation、last command/result、claim candidates/tie-break、GAS execution phase、active hit ticket、
Physics member、fuse/lifetime、effect journal、ledger retention 与 cleanup reason。

行为契约覆盖：

- 同 tick 双人 pickup、stale claim、owner disconnect/elimination 和 stage reset。
- Carry modifier、drop、cancel-before-commit、throw clearance 和 inherited velocity。
- Predicted spawn match/reject、bounce、fuse、area/melee duplicate suppression。
- Instability clamp/decay、stagger merge、external impulse 与 KO/assist window。
- Network loss/duplicate/reorder 下 item 不复制、不丢 owner、不重复 hit/KO/cue。
- 10 分钟 churn 后 item/member/history/effect/ledger 有界，dispose retained state 为 0。
