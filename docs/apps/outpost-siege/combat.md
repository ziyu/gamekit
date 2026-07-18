# Outpost Siege 战斗系统

## 目标

战斗系统必须同时做到：输入有即时反馈、authority 结果可信、敌人攻击可读、内容可通过数据扩展、headless 可完整运行、大规模 entity 下仍有稳定预算。

通用 effect delivery、projectile、target relationship 与 hit resolution 使用 [`../../modules/combat.md`](../../modules/combat.md)；本文件只定义 Outpost 的武器、技能、属性、关系和战斗内容。

## Authority 战斗顺序

```txt
network input/action ingress
  -> player/AI semantic intent
  -> action eligibility and GAS execution request
  -> ability preparing/commit
  -> movement/projectile/area delivery materialization
  -> Physics fixed step
  -> Combat candidate + hit resolution
  -> GAS effect/attribute/tag mutation
  -> down/death/status TCA reactions
  -> objective/resource update
  -> replication + bounded combat/cue fact
  -> lifecycle cleanup
```

同一个 simulation tick 内使用稳定顺序：player id、agent id、execution id、projectile id 和 hit ticket 均可确定排序。客户端提交的 aim、target 或 position 都是候选输入，服务器重新验证距离、视线、phase、资源与目标关系。

## 角色属性

| 属性                | 基线 | 规则                                                                |
| ------------------- | ---- | ------------------------------------------------------------------- |
| `health`            | 100  | 战斗中不自然恢复；为 0 时进入倒地                                   |
| `shield`            | 50   | 优先承伤；4 秒未受伤后每秒恢复 12                                   |
| `move-speed`        | 数据 | 普通移动速度；受 slow、downed、dash 等 modifier 影响                |
| `ammo.magazine`     | 24   | 当前弹匣，不由 GAS Attribute 表达逐发热状态时可留在 WeaponComponent |
| `ammo.reserve`      | 144  | 备用弹药；整备与补给恢复                                            |
| `facility-capacity` | 队伍 | 由共享经济模块持有，不复制到每个 player actor                       |

Health、shield、移动 modifier、控制与 immunity 使用 GAS attribute/tag/effect。每帧枪口状态、当前换弹计时和 projectile previous position 使用 World component，不为每次读取创建 GAS operation。

## Target Relationship

Outpost 注册 `outpost.relationship` policy：

| Source \ Target | 小队玩家 | 敌人   | 核心/设施  | 场景实体 |
| --------------- | -------- | ------ | ---------- | -------- |
| 小队玩家        | 不伤害   | 敌对   | 修复/保护  | 阻挡     |
| 小队设施        | 不伤害   | 敌对   | 不伤害     | 阻挡     |
| 敌人            | 敌对     | 不伤害 | 按角色攻击 | 阻挡     |

友军不会吸收步枪 projectile，但实体阻挡和视觉穿越规则分开：玩家之间使用软分离，友军 projectile query 明确 ignore teammate hurt collider；墙和 Barricade 仍可阻挡。

Dead、downed、invulnerable、spawn-protected 和 extracted 是 target policy 的状态输入。Physics layer 只做粗粒度 player/enemy/projectile/world 分类。

## Ability Execution

所有主动行为经过 GAS execution phase：

```txt
requested
  -> preparing
  -> committed
  -> active
  -> recovering
  -> completed
```

通用规则：

- Cost 默认在 `committed` 扣除；preparing 被合法取消时不扣 cost。
- Cooldown 默认在 `committed` 开始；被 authority 拒绝的 request 不进入 cooldown。
- `state.downed`、`state.dead`、`state.extracted` 阻止攻击/建造。
- Stagger 可以打断 preparing；普通受伤不能打断已经 committed 的步枪射击。
- 每个 actor 同时只能有一个 exclusive full-body execution；步枪 fire 可以与 locomotion 并行，reload 与 tactical cast 互斥。
- Execution id、phase、startedAt、expectedEndAt 和 cancel reason 进入 authority public projection。

## Ranger Rifle

### Weapon State

Rifle definition 描述：

- 24 发弹匣、144 备用弹药。
- 射击间隔 120 ms。
- 换弹 1,350 ms。
- projectile speed、lifetime、body、collision mode、payload effect、spread curve 与 cue refs。
- 是否允许 auto fire、移动扩散、连续射击热度与恢复。

WeaponComponent 持有 magazine、reserve、reload execution、nextShotAt、shot sequence 和 heat。服务端按 authority clock 允许射击，不按浏览器 click 次数直接生成 projectile。Held fire 是 continuous intent；每个合法间隔最多提交一发，网络 burst 不能补发超过配置的 catch-up 上限。

### 射击流程

```txt
held fire + aim
  -> can-fire validation
  -> rifle execution preparing/commit
  -> consume one magazine round
  -> deterministic spread from actor/shot seed
  -> muzzle transform from gameplay socket definition
  -> Combat projectile spawn
  -> fire/recoil/audio/animation cue
```

Gameplay muzzle socket 是角色朝向与 weapon offset 计算出的稳定世界位置，不读取 native Sprite bone。表现可以使用同名动画挂点绘制枪口闪光，但不能改变 projectile origin。

### 换弹

- Magazine 为空时 held fire 触发自动换弹；玩家也可手动换弹。
- Reload preparing/active/recovering 总计 1,350 ms，弹药在 `committed` marker 一次性转移。
- Dash 或 tactical cast 可以在 commit 前取消 reload；commit 后取消仍保留已转移弹药。
- Reserve 为 0、magazine 已满或 actor 状态不允许时返回稳定 rejection reason。
- Reload 动画与 UI 根据 execution phase 对齐，不维护第二个本地倒计时。

## Projectile 系统

Rifle projectile 是 authority World entity，包含：

- gameplay/network identity 与 generation。
- CombatProjectileComponent：source、execution、payload、hit policy、remaining lifetime、hit count。
- Physics body/collider/transform/velocity。
- Outpost presentation ref。

普通步枪弹使用小 circle shape sweep，而不是只对中心线 raycast。每 tick 从 previous authoritative position sweep 到 current position：

1. 忽略自身 body、source actor 与友军 hurt collider。
2. 按距离和 stable collider id 排序候选。
3. 对第一个合法 blocker/target 创建 hit ticket。
4. 交付 kinetic damage effect 与可选 knockback effect。
5. 发出 material impact 或 actor hit cue。
6. `stop` policy 销毁 projectile。

Projectile lifetime、arena bounds、maxHits 和 hit memory 都有上限。Despawn 在 post-combat cleanup 统一执行，不能在遍历 query 结果时破坏当前 collection。

多人复制只需要 spawn identity、transform/velocity、archetype 和 despawn；命中 cue 通过 bounded sequence 去重。客户端可以立即表现本地 muzzle/tracer anticipation，但 authority projectile/hit 到达后必须合并或取消 cosmetic，不创建第二个可造成伤害的 projectile。

## Damage Resolution

Outpost kinetic/energy/impact payload 最终转换为 GAS effect。结算顺序：

1. 校验 target 可受影响、relationship 与 invulnerability。
2. 应用 source/target modifier，例如 Squad Protocol、首领 resistance。
3. 护盾吸收并记录 shield damage。
4. 剩余值作用 health。
5. 计算受控 knockback/stagger，不把 impulse 当成伤害结果。
6. 生成单个 CombatHitResult。
7. TCA 消费 shield-break、actor-downed/killed、overload 等低频 fact。

Damage formula 使用 app-injected policy，禁止在 Combat/GAS Core 写死 shield-first。所有 modifier 有稳定顺序和 clamp；NaN、负伤害、未知 effect 或重复 ticket 被拒绝并记录。

## 冲刺

Dash 基线：180 ms active，2.5 秒 cooldown。

- Preparing 仅做极短输入确认，commit 后写入 `state.dashing` 并给 Physics movement command。
- 有移动输入时沿移动方向，无输入时沿 aim direction。
- Active 期间抵抗轻型 body blocking 与小幅 knockback，但不完全无敌。
- 不能穿越 static wall、arena boundary 或禁止穿越的 Barricade。
- 与墙接触后 Physics 产生滑动/停止，不能继续按预期距离传送。
- Local prediction 使用 Physics Core transition；游戏只声明 dash input/body patch 和 ability phase，不手写 collision approximation。

Authority correction、ability rejection 或碰撞缩短 Dash 时，Animator/Camera 进入短 recover，不把玩家视觉拉回两次。

## 战术模块

### Shock Field

| Phase      | 时长   | 行为                                               |
| ---------- | ------ | -------------------------------------------------- |
| Preparing  | 250 ms | 显示目标区域、允许被 stagger 取消                  |
| Committed  | 瞬时   | 锁定 authority target position，开始 8 秒 cooldown |
| Active     | 100 ms | Circle overlap，交付 energy damage + shocked       |
| Recovering | 300 ms | 恢复移动/武器完整控制                              |

Overlap `maxTargets` 有上限并稳定排序。Shock Pylon 或另一 energy effect 命中 shocked 目标会触发 overload：额外削盾、短 stagger，并进入每目标 overload cooldown。Boss 使用控制递减，不静默免疫。

### Barrier Pulse

- 150 ms preparing，随后在 aim direction 生成 900 ms 弧形 barrier entity。
- Barrier 是 sensor/query target 或短时 collider，由 definition 决定阻挡 enemy projectile、削弱 impact 和推开轻型敌人。
- Barrier 不阻挡友军移动或射击，不与玩家 body 形成夹人碰撞。
- 10 秒 cooldown，重复部署不无界叠加。

### Repair Drone

- 350 ms preparing，创建有 4 秒持续时间的 drone/support entity。
- 每 500 ms 重新选择范围内优先目标：濒危玩家 → 核心 → 低耐久设施。
- 通过 GAS periodic repair effect 恢复，不直接写 attribute。
- Drone 被干扰时降低效率；source 离线不立即删除已经 committed 的 drone。
- 14 秒 cooldown，同 source 同时最多一个 active drone。

## 敌人攻击

所有敌人攻击使用相同 execution + Combat delivery：

- Raider：0.45 秒 melee telegraph，shape sweep，短 recover。
- Gunner：0.7 秒 aim telegraph，三发受控 burst projectile。
- Saboteur：对设施进行 channel/disable effect；受击或目标失效可中断。
- Brute：1.0 秒冲撞/重击 telegraph，shape cast + impact payload。
- Overseer：至少 1.2 秒致命技能 telegraph，阶段机制见关卡文档。

AI 只能请求 ability；GAS/Combat 再次验证 range、line of sight、phase、target 和 cooldown。Task 进入 telegraph 后会占用攻击槽，取消/结束必须释放。

## 状态与控制

| 状态              | 实现                                   | 规则                                     |
| ----------------- | -------------------------------------- | ---------------------------------------- |
| Shocked           | duration GAS effect + tag              | 减速/过载候选；有 stack/refresh 上限     |
| Staggered         | duration effect + ability interrupt    | 停止当前 task/部分 execution             |
| Spawn Protected   | tag + target policy                    | 不可受伤、不可攻击，离开保护区或超时结束 |
| Downed            | tag + movement modifier + action block | 允许爬行、标记、被救援                   |
| Revive Protection | 1.5 秒 damage modifier / target policy | 防止刚起身连续倒地                       |
| Dead/Extracted    | terminal gameplay tag                  | 不再是普通 combat target                 |

Effect stacking、source 与 duration 复用 GAS。TCA 只处理“shocked 再受 energy → overload”“shield 归零 → shield break”等离散反应。

## 倒地与救援

Health 为 0 时不直接 despawn player：

- 进入 20 秒 Downed execution，速度降低，只允许移动、标记和呼救。
- 队友在范围与视线内持续交互 2.5 秒；救援是可取消 ability execution。
- 救援者离开、被重击、倒地或目标失效时取消；进度不跨 execution 保留。
- Commit 后目标恢复 35 health、获得 1.5 秒保护并播放 revive cue。
- 倒地超时进入 Incapacitated；下一整备阶段按经济规则复归。
- 所有有效玩家 Incapacitated 时 Match Flow 失败。

## 战斗表现合同

每个攻击 definition 必须配套：

- preparing telegraph cue。
- commit/active animation cue。
- projectile/muzzle/area presentation。
- impact/hit/rejection cue。
- audio priority/concurrency group。
- controller/keyboard/gamepad rumble 或替代反馈（若平台支持）。
- screen-edge warning policy（屏外高威胁攻击）。

表现细节见 [`animation-and-feedback.md`](./animation-and-feedback.md)。Cue 丢失不改变命中；同一 correlation 不能重复播放远端 one-shot。

## 数据与扩展

Weapon、tactical module、projectile、damage effect、status、cue 与 animation binding 分开定义并通过 DataRef 组合。新增武器不增加 `switch (weaponId)`：

```txt
outpost.weapon
  -> gas.ability
  -> combat.delivery / combat.projectile
  -> gas.effect[]
  -> animator.binding
  -> gas.cue[]
  -> asset.definition[]
```

App handler 只为真正新的执行机制注册 executor，例如 beam 或 chain delivery；不同数值、资源、射速和效果继续使用数据。

## 战斗验证

持续测试至少覆盖：

- weapon fire cadence、ammo、reload cancel/commit、zero ammo。
- projectile sweep、墙阻挡、friendly ignore、duplicate ticket、lifetime cleanup。
- ability prepare/commit/recover/cancel、cost/cooldown policy。
- shield/health、status stacking、overload、stagger immunity/decay。
- enemy attack telegraph → commit → hit/recover。
- down/revive/timeout/all-incapacitated。
- local predicted action anticipation 与 authority rejection 收敛。
- two-client hit/cue dedupe、late join 与 reconnect active execution restore。
- 250 enemy / 300 projectile normal profile 和更高压力 profile 的 tick、allocation 与 retained state。
