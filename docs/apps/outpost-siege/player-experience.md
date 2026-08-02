# Outpost Siege 玩家体验设计

## 文档定位

本文是 Outpost 玩家域与端到端操作体验的长期事实源。它负责玩家身份、控制意图、角色运行时边界、权威投影、统一表现帧和体验验收；具体按键映射由 [`ui-ux.md`](./ui-ux.md) 维护，技能数值和战斗顺序由 [`combat.md`](./combat.md) 维护，动画/VFX/音频/镜头细节由 [`animation-and-feedback.md`](./animation-and-feedback.md) 维护，多人队列与重连规则由 [`multiplayer.md`](./multiplayer.md) 维护。

玩家体验不能被实现成 Input、GAS、Combat、Animator 和 UI 的松散拼接。Outpost 必须拥有一个明确的玩家域，把这些框架能力组合成同一条可预测、可复制、可表现的运行链路。

## 体验目标

玩家角色必须同时满足：

- **响应**：移动、瞄准和允许预测的动作立即产生本地反馈，authority correction 平滑且不隐藏持续错误。
- **具身**：加速、停止、转向、射击、换弹、冲刺、受击和交互都有可辨认的准备、生效与恢复过程。
- **可读**：玩家能够从角色、准星、世界效果、音频和 HUD 判断当前行为、可用资源、生效时刻和失败原因。
- **一致**：本地玩家、远端玩家和 late join 从同一语义状态构建表现，不为每种网络路径维护不同动作逻辑。
- **可扩展**：增加武器、战术模块或部署物主要增加数据、策略和表现绑定，不增加入口层的 ability id switch。

## 玩家域组成

一个玩家由相互分层的事实组成：

```txt
Session participant / stable player identity
  -> Player loadout definition
  -> World entity + Physics body
  -> GAS actor + abilities/effects/tags
  -> app-owned control/movement/weapon/interaction state
  -> authority replication projection
  -> client presentation frame
  -> Animator / Renderer / Audio / Camera / world UI / HUD
```

所有权规则：

- Multiplayer 拥有 peer、binding、input epoch、sequence、authority gate 和复制调度。
- Outpost 玩家域拥有 Ranger、loadout、weapon runtime、交互候选、动作冲突和角色体验策略。
- Physics 拥有位置、速度、碰撞和 query；Outpost movement policy 只提交运动意图。
- GAS 拥有 ability execution、cost、cooldown、effect、attribute 和 tag。
- Combat 拥有 delivery、projectile、candidate、hit ticket 和 effect 交付。
- Animator、Renderer、Audio、Camera 和 UI 只消费表现事实，不能反向决定玩法结果。
- Shared Supply 是队伍状态，不作为每个玩家 Actor 的独立资源副本。

## 内容定义

`outpost.player` 表达可实例化的玩家角色组合，而不是只有一张贴图和一个移动速度。定义至少引用：

- GAS actor。
- Physics body。
- RenderObject 与 Animator binding。
- 默认 weapon。
- 可选 tactical module 与 deployable slot 规则。
- movement profile。
- interaction profile。
- presentation profile。

Weapon、Tactical Module、Deployable、Movement Profile 和 Presentation Profile 使用独立定义。Ranger 是共享角色底盘，战术模块和部署物形成 loadout，不通过职业枚举复制整套角色状态机。

运行时状态不写回 DataRegistry。玩家 entity 使用紧凑组件保存高频状态；弹药、换弹、shot sequence、热度、交互进度等 app-owned 状态由玩家模块持有并进入 authority snapshot/checkpoint。

## 语义控制合同

物理设备先经 Input Core 变成语义 Action，再由玩家控制模块形成两类输入。

### Continuous Control Frame

每个 fixed step 的连续控制包含：

- 归一化移动向量。
- world aim point 或归一化 aim direction。
- `fireHeld`。
- 当前输入设备类别。
- input epoch 与 sequence。

键鼠和手柄只在 Input binding 与 aim resolver 不同，之后共享同一控制合同。鼠标坐标必须通过 Camera Core 从 viewport 转为 world point；手柄右摇杆使用 dead zone、响应曲线和最近有效方向，不伪造鼠标坐标。

Held fire 不依赖浏览器 click 次数或 key repeat。Authority 按 weapon cadence 从最新连续意图中生成合法 shot；网络 burst 不能补发超过配置上限的历史子弹。

### Discrete Action Intent

离散动作包括：

- reload。
- dash。
- tactical module。
- deploy/build confirm、cancel 与 selection。
- interact/revive。
- ping。

每个 action 具有 request id、source binding、input epoch、phase instance、必要 target/position 和 correlation。入口层只负责生成语义 action；eligibility、range、资源、phase 和 target validation 由 authority 玩家/能力模块完成。

Input Scope 变化、断线、modal/text input/DevTools focus 和 session reset 必须清除 held fire、movement、pending build preview 和 transient action edge。关闭 UI 后不得恢复旧 held 状态。

## 移动与瞄准

玩家 movement policy 负责把 control frame 转成 Physics command：

- 移动向量有稳定归一化，斜向不加速。
- 启动、转向和停止使用可调 acceleration/deceleration，而不是每帧无条件跳到目标速度。
- 移动方向与 aim/facing 分离，角色可以后退或侧移射击。
- 动态角色之间使用软分离；墙、边界和 Barricade 使用真实碰撞和滑动。
- 受控状态、downed 和 dash modifier 通过 GAS tag/attribute 与 movement policy 合成。
- Authority 与本地 prediction 使用同一 Physics body、fixed step、movement definition 和 input transition。

Dash 是 GAS execution 与 Physics transition 的组合。它不能由普通移动 system 下一帧覆盖，也不能以 teleport 近似。Dash 缩短、碰墙或被拒绝时，prediction、Animator 和 Camera 只进行一次收敛。

Aim/facing 保持连续角度；8 向或其他离散视觉方向只存在于 presentation mapping。Aim 的轻微边界抖动由视觉 sector hysteresis 处理，不修改权威瞄准角度。

## 武器与主动行为

玩家武器模块拥有弹匣、备用弹药、reload execution、next shot time、shot sequence 和可选热度。它消费 `fireHeld` 与 reload action，并请求 GAS ability execution；它不直接生成伤害。

标准行为链：

```txt
semantic control/action
  -> player action arbitration
  -> GAS execution request
  -> cost/cooldown/phase validation
  -> Combat ability-delivery
  -> Physics/Combat hit
  -> GAS effect result
  -> bounded presentation cue
```

行为冲突使用明确的 action channel，而不是散落的布尔判断：

- Locomotion 可与 rifle fire 并行。
- Reload、tactical cast、build confirm 和 revive/interact 使用互斥 full-action channel。
- Dash 使用 movement override，并按定义决定是否取消 reload/tactical preparing。
- Reaction/stagger 可以中断声明允许中断的 execution。
- Downed、dead、extracted 和 reconnect-protected 通过稳定 tag gate 限制输入。

中断动作必须先被 authority 接受，再取消被中断动作。处于 cooldown、cost不足或其他 gate 拒绝的 Dash，不能仅因为收到请求就取消正在 preparing 的 Reload/Tactical；同一 correlation 必须同时用于成功中断或拒绝反馈。

弹药 commit、cost、cooldown、damage、placement 和 interaction completion 只由 authority 决定。本地可以预演 anticipation，但不能创建可造成结果的第二套 projectile 或 interaction。

## Authority Projection

玩家高频复制包含 stable identity/generation、transform、velocity、facing 和必要 movement mode。中低频公开状态包含：

- health、shield 与玩家可见 tag。
- weapon magazine/reserve、reload phase、shot sequence 与最近接受射击的 correlation。
- active ability execution id、ability id、phase、start/end time。
- cooldown、公开 status duration 与 action rejection。
- loadout/tactical/deployable identity。
- downed/revive/interact state。

客户端不能从 counters 猜测动作，也不能只复制“最近一个 execution”而丢失仍需同时表现的 locomotion、weapon、reaction 与 status channel。Projection 应按玩家可见 channel 提供稳定摘要。

一次性表现使用有界 cue stream。Cue 至少具有 sequence、semantic id、source/target、correlation、authority time，以及按类型需要的位置、方向、reason 和 importance。Snapshot/resync 同时复制 watermark；late join 的第一份 active snapshot只建立 watermark基线，不重播此前 one-shot。后续 snapshot只消费更大的 authority sequence，sequence断档和 authority reset进入有界 diagnostics，不触发 gameplay retry。

Outpost authority 与 client presentation history各自最多保留64条 cue；world-space瞬时表现最多同时存在48个，超限优先回收最旧对象，按各 cue duration到期回收。连续 projectile transform仍读取 replicated World snapshot，不进入 cue history。`miss`、`world-impact`、`shield-hit`、`health-hit`、`kill-confirmed` 和 `action-rejected` 必须由 authority事实明确区分，客户端不能从 projectile消失猜测结果。

## 预测与收敛

允许预测：

- movement 与 aim。
- Dash 的声明式 Physics transition。
- rifle fire、reload、tactical preparing 的视觉/音频/UI anticipation。
- Rifle projectile 的 kinematic trajectory 与 provisional spatial impact；它必须复用 authority 的 definition、
  fixed tick、静态 layout 和 ray/shape sweep。

客户端不提交：

- authority target validation、damage、kill 和 status application。
- 最终 ammo/cost commit。
- build/interaction/revive success。
- Shared Supply 与 objective。

Authority confirmation 与 rejection 都使用稳定 correlation。客户端确认时只收敛对应 anticipation，不重复播放已经预演的 muzzle、音效或 camera impulse；拒绝时取消该 anticipation 及依赖它的后续预测链、恢复 Animator action channel、修正 HUD optimistic state，并播放轻量 deny feedback，不能完整播放 commit、impact 或 hit confirm。Anticipation 队列、消费历史和超时都必须有硬上限。

Rifle 的 press、release 和 cancel 是手感关键边沿，必须在 Input Action 到达时立即走独立 reliable action lane，不能等待 movement/aim 的 fixed-step FIFO。持续移动、aim、held state仍可随预测输入复制；authority weapon以单调 `fireSequence` 合并两条 lane，只接受更新边沿，并拒绝旧 FIFO frame覆盖已经处理的 held状态。Outpost客户端预测输入最多领先2帧，authority每 source输入 backlog最多4帧，但这两个上限都不能成为 Rifle首发等待预算。

Rifle 保留可见飞行时间，因此明确选择
[`kinematic-data-buffer`](../../adr/0047-selective-network-prediction-and-projectile-strategies.md)，而不是
render-only handoff。本地在下一次可绘制 frame 同时生成角色开火 pulse、音频、recoil，并用 provisional
shot identity 启动同一 projectile definition 与 Physics sweep；可见飞行中的 Rifle 只能有一个 projectile
render object；线状 spawn tracer 只能是短生命周期开火反馈，不能拥有第二条移动弹体轨迹，也不能复用 projectile 贴图伪造 muzzle。预测到墙、目标候选、expire 或其他空间终点
时，本地弹体必须在该 tick 立即停止并播放可撤销 spatial impact；任何 frame 都不能让它继续画到已知 blocker
后方。带 projectile correlation 的 authority miss、world/shield/health hit 或 kill cue 是表现层终止事实；即使
finish record 晚一个网络快照到达，owner prediction 和 remote record render 也必须在 cue 到达的同一帧隐藏。

Authority 为每次射击发布有界 fire/finish record，至少包含 correlation/generation、fire tick、position、
velocity，以及完成后的 finish tick、hit position/normal 和 reason。Client 按 identity confirm/correct/reject：
一致时不重播已预演反馈，分叉时只修正或撤销对应 prediction chain。Target hit confirmation、damage、ammo、
kill 与 status 仍完全由 authority 提交；provisional target impact 不能点亮最终 hit confirm。Remote client 按
authority record 和 remote timeline 重建，不使用 owner 的 local-forward prediction。

Owner prediction 与 authority commit 不共享同一个绝对开火时刻：GAS preparing、20 Hz authority 排队和传输
延迟会让 authority `fireTick` 合理地晚于本地 anticipation。客户端必须使用单调的本地预测时间线，不能在新
snapshot 到达时重锚到更早的 authority elapsed；identity 匹配时按相同射击年龄比较 definition、lifetime、
起点、方向、速度和 finish，合理的绝对 tick offset 不是弹道分叉。Authority record 到达后，owner 在同一个
visual object 上改由该 record 提供权威空间事实，但继续按当前 local predicted shot age 求值；它不能回到较晚
authority commit 所对应的过期弹龄。Observer 按 remote authority presentation time 观看同一 record，因此两端
屏幕位置不要求逐帧相等。匹配 trajectory 的接管不启动 correction，真正的起点、方向、速度或 finish 分叉才
复用同一 transition 做一次有界修正。Owner/observer 使用相同 generation + correlation renderer id、同一
projectile render definition、scale 和材质；预测态不能额外染色。短命 remote record 按统一的100ms authority
presentation delay 重建，它不按每条 record 的首次到达时间重新启动。已早于该 delayed tick 完成的 record不再
重播，剩余漏帧由 tracer/impact cue 表达。

如果未来把 Rifle 改成瞬时武器，应整体切换到 lag-compensated hitscan，并移除可见慢速 projectile；不能形成
“表现是慢弹体、玩法是瞬时射线”的隐式混合。

## 统一表现帧

Renderer、Animator、Camera、Spatial Audio 和 world-space UI 必须读取同一 `PlayerPresentationFrame`。该 frame 由 managed prediction/remote playback 与 authority semantic projection合成，至少包含：

- position、velocity、facing、generation 和 sample time。
- locomotion mode 与 speed。
- weapon/reload/shot summary。
- ability execution channels 与 phase progress。
- health/shield/public tags。
- recent cue watermark 与可消费 cue batch。

表现系统不能分别读取 raw network snapshot、authority shadow World 和 predicted transform。React HUD 读取低频 view model；它不订阅每帧 transform 或 cue buffer。

## 动画与角色表现

玩家 Animator binding 必须按 ability id + phase 区分 rifle、reload、dash、tactical、interact、hit reaction、downed 和 death。所有 phase 映射到一个通用 `attack` clip 不构成正式角色动画。

角色资源必须满足 [`animation-and-feedback.md`](./animation-and-feedback.md) 的方向与动作集合。单帧纹理可以用于 loader/adapter contract fixture，但不能作为正式可玩角色资源。Animator clip manifest 必须引用真实帧序列、duration、pivot、direction 和 visual socket。

Local anticipation、authority phase、remote recovery 和 generation reset 使用同一个 Animator controller。Locomotion speed 或 facing 更新不能 reset 当前 clip；ability phase 切换只影响声明的 action layer。

## 反馈组合

Cue Presentation 负责把同一 semantic cue 组合成多通道反馈：

- Animator trigger/phase。
- muzzle、tracer、impact、shield、status 和 telegraph VFX。
- spatial/non-spatial SFX。
- local camera shake/impulse。
- crosshair、damage direction、world UI 和 HUD notification。

同一 correlation 在各通道独立去重。性能降级可以减少装饰粒子和次要音效，不能删除 attack telegraph、hit confirm、damage direction、interaction progress 或拒绝原因。

命中反馈必须区分 miss、world impact、shield hit、health hit、kill 和 rejected anticipation。客户端不得仅根据 projectile 消失推断命中类型。

## UI View Model

玩家 HUD view model 由 authority semantic state和本地 presentation state组合：

- health/shield/status。
- magazine/reserve/reload progress。
- ability cooldown、phase、charge 与 rejection reason。
- Shared Supply 与 build reservation。
- interaction/revive progress。
- connection/prediction degraded 状态的玩家语言摘要。

Cooldown、reload 和 phase progress 可以基于 authority end time在客户端平滑显示，snapshot 更新只校正基准，不重启动画。Crosshair、telegraph、hit confirm、damage direction 和 interaction 提示属于 renderer/world UI presentation，不进入 10 Hz React HUD state。

## 代码边界

Outpost 玩家实现按领域拆分：

```txt
src/
  content/player/        # player/loadout/weapon/movement/presentation definitions
  domain/player/         # stable app contracts and public projections
  gameplay/player/       # authority control, movement, weapon, action arbitration
  realtime/player/       # input/action codec, authority projection, client decode
  presentation/player/   # presentation frame, animator mapping, cue/VFX/audio/camera
  ui/player/             # low-frequency view model and HUD components
```

Composition root 只装配这些 slice。`main.tsx` 不维护 ability switch，authority runtime 不内联完整玩家系统，Combat 文件不拥有 input/weapon/UI，client shadow 不同时承担 decode、prediction、materialization、camera 和全部表现。

## 质量门禁

玩家域持续验证：

- Input binding、scope、held/cancel、键鼠与手柄设备切换。
- Authority 与 prediction 使用同一 movement transition；长时间移动无持续 correction。
- Rifle cadence、held fire、ammo、reload cancel/commit、empty/rejection。
- Dash 碰墙、取消冲突、cooldown、prediction/reconciliation。
- Tactical、build、interact、down/revive 的 phase 与冲突。
- 两客户端的 remote playback、cue dedupe、active phase late join 和 reconnect。
- 真实帧集上的 idle/run/fire/reload/dash/hit/death，不允许 contract test 用单帧 fixture替代浏览器验收。
- Crosshair、telegraph、hit confirm、impact、camera/audio 和 HUD reason 的浏览器视觉/听觉验收。
- 玩家模块、prediction buffer、cue history、Animator、particle/audio ownership 在 dispose 后归零。
