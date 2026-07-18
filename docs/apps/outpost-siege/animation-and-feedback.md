# Outpost Siege 动画与战斗反馈

## 目标

动画、VFX、音频、镜头和 UI 共同解释玩法状态。玩家应能从角色动作和场景反馈判断“正在做什么、何时生效、为什么失败”，但任何表现系统都不是 authority 规则源。

通用 Animator controller 见 [`../../modules/animator.md`](../../modules/animator.md)，音频协议见 [`../../modules/audio.md`](../../modules/audio.md)。Outpost 只定义角色图、资源绑定、cue 映射和美术规则。

## 角色 Animator Graph

### Semantic Parameters

每个角色 controller 接收：

- `speed`、`move-direction`、`aim-angle`、`facing-sector`。
- `moving`、`downed`、`dead`、`staggered`、`shocked`。
- `ability-execution-id`、`ability-kind`、`ability-phase`、`phase-start-time`。
- one-shot trigger：`fire`、`hit-react`、`shield-break`、`revived`。

Transform、velocity 和 facing 读取同一 presentation frame：本地来自 managed prediction/presentation，远端来自 managed playback。动画不能再次读取 raw network snapshot 或权威 World transform，避免视觉位置与 locomotion phase 使用不同时间点。

### Layer

| Layer      | Stable state                         | One-shot / transition                  | 优先级 |
| ---------- | ------------------------------------ | -------------------------------------- | ------ |
| Base       | idle、run、dash、downed-crawl、dead  | spawn、stand-up                        | 低     |
| Upper Body | aim、reload、tactical-cast、interact | rifle-fire、deploy-confirm             | 中     |
| Reaction   | normal                               | light-hit、heavy-stagger、shield-break | 高     |
| Status     | none、shocked、protected             | overload pulse、revive glow            | 叠加   |

Base locomotion 永远有可返回 stable state。Reaction 不能把 controller 留在没有出口的 one-shot；同类 light-hit 使用 `queue-one` 或合并，不能因每次受击无界排队。

## 方向与帧集

俯视角色使用 8 向视觉方向。Gameplay facing 保持连续弧度，Animator mapping 量化到 8 个 sector：E、SE、S、SW、W、NW、N、NE。切换使用带滞回的扇区边界，避免 aim 在边界附近造成 sprite 抖动。

每个基础角色至少提供：

- idle：8 向，每向 4–6 帧。
- run：8 向，每向 6–8 帧。
- fire：8 向，每向 3–5 帧，可与 Base layer 合成或使用完整帧集。
- reload：8 向，每向 6–10 帧。
- dash：8 向，每向 4–6 帧。
- tactical cast / deploy：8 向，每向 6–10 帧。
- light hit、heavy stagger、downed crawl、revive、death。

若美术预算不允许完整 upper-body 分层，第一套资源可以使用整身 one-shot，但 Animator Graph 的 layer/phase contract 保持不变，不能把资源限制写成玩法状态机特例。

## Ability Phase 对齐

动画 duration 与 gameplay phase 独立配置，通过 phase map 对齐：

```txt
preparing 0..1  -> clip anticipation range
committed       -> gameplay commit boundary
active 0..1     -> clip action range
recovering 0..1 -> clip recovery range
```

Clip 比 phase 短时可以 hold/end blend，clip 比 phase 长时可以调 playback rate，但 playback rate 有合理区间。不能通过等待 clip marker 延长 authority phase。

主要 marker：

- `footstep.left/right`：音频/尘土。
- `muzzle.flash`、`shell.eject`：纯表现。
- `weapon.reload-contact`：视觉弹匣切换；真正 ammo commit 由 GAS phase 决定。
- `dash.trail`：开启/关闭 trail emitter。
- `cast.pulse`：Shock/Barrier/Repair 的视觉峰值。

Marker 迟到、缺失或 late join 不会补做 gameplay effect。持续 loop 根据当前 state 重建，已过去的 one-shot marker 不补播。

## 本地预测与远端恢复

### 本地玩家

- Locomotion 和 aim 立即读取 predicted presentation frame。
- Fire/dash 的 anticipation 可以在 semantic input 被接受前即时播放。
- Authority rejection 使用短 cancel/recover transition，并播放明确拒绝反馈；不能完整播放命中或消耗结果。
- Reconciliation 只修正 transform/prediction state，Animator Core 根据同一个 frame/phase 更新，不在游戏层手动重启 clip。

### 远端玩家与敌人

- Authority 复制 execution phase、phase start time、facing 和必要 tag。
- Controller 用 server time offset 计算 normalized phase，从当前相位进入 clip。
- 短 one-shot cue 使用 sequence 去重；snapshot 重发不会重复开枪、受击或爆炸。
- Entity generation 变化时清空旧 controller、marker watermark 和 particle/audio ownership。

## VFX 系统

VFX 分为三类：

1. **Bound effect**：跟随 entity/node 的 shield glow、shocked arc、repair beam。
2. **World one-shot**：muzzle flash、impact spark、explosion、death burst。
3. **Area telegraph**：melee arc、Shock circle、Brute charge line、boss danger zone。

Renderer Phaser 提供 animated sprite 与 particle emitter/native batch path；Outpost Cue Presentation Module 只映射 cue 到 command/binding。每个 effect definition 明确：

- asset refs 与 preload group。
- layer、blend mode、tint、scale 与 duration。
- ownership（entity、execution、world one-shot）。
- max concurrent、pool/batch policy 和 culling distance。
- reduced-motion / low-effects fallback。

Telegraph 与装饰 effect 分开。性能降级可以减少火花数量、trail 粒子和装饰灯光，不能移除危险区域、攻击方向、目标状态和命中反馈。

## Audio 系统

### Bus

| Bus      | 内容                           | 优先规则                   |
| -------- | ------------------------------ | -------------------------- |
| Voice/UI | 目标、队友倒地、倒计时、错误   | 最高；必要时 duck 普通 SFX |
| Combat   | 玩家武器、技能、受伤、首领攻击 | 玩家/首领高于普通敌人      |
| Enemy    | 普通敌人攻击、移动、死亡       | 按距离与并发组裁剪         |
| Ambience | 风、设施、核心 hum、远端警报   | 可循环、低优先             |
| Music    | 部署、波次、首领、撤离层       | 按 Match phase crossfade   |

Rifle fire 使用 concurrency group 与轻微受控 pitch variation；四名玩家和炮塔持续射击时不能为每一发保持独立长 voice。关键 reload empty、ability ready、shield break、downed 和 boss telegraph 不被普通枪声完全遮蔽。

Spatial source 位置来自 presentation frame。屏外致命警告同时播放 UI/non-spatial 提示与视觉方向箭头，不能只依赖 stereo pan。

浏览器未解锁音频时显示非阻塞提示；点击/手柄输入完成 unlock。Unlock 失败不阻止进入游戏，Audio diagnostics 进入 DevTools。

## Camera 与震动

- Rifle fire：极轻、短时 local-only impulse，不累计成持续抖动。
- Dash：方向性短 impulse + lookahead，不能改变 gameplay position。
- Heavy hit / Brute / boss：按距离衰减，强度有全局上限。
- Core critical：低频环境 pulse，不持续覆盖玩家受击。

Camera shake 由 cue correlation 去重。多个 cue 同帧使用 mixer 合成而不是简单相加；respect reduced motion、shake slider 和 platform profile。

Hit stop/slow-motion 只做本地表现曲线，不暂停 authority tick、network input、remote playback 或其他玩家。

## 屏幕与角色反馈

### 玩家造成命中

- Crosshair hit confirm：shield、health、critical/weak point、kill 使用不同形态与音高。
- World impact：按 material/target 选择火花、能量、尘土或 shield ripple。
- Damage number 默认关闭或克制显示；启用时聚合短窗口内同目标小伤害，避免文本雨。

### 玩家受击

- 角色短闪/材质反馈，不用全白帧破坏美术。
- HUD health/shield 立即变化并显示伤害方向。
- 屏幕 vignette 只在高伤害/低生命时增强，不常驻遮挡。
- 受击音、controller rumble 和 shake 受可访问性设置控制。

### 拒绝与无效

Cooldown、no ammo、blocked、invalid target、out of range、insufficient Supply、placement occupied 都使用稳定 reason code：

- UI 在对应能力/准星附近显示短原因。
- 可选播放低优先级 deny sound。
- 不播放 commit animation、muzzle flash 或 full camera shake。

## 资源工作流

```txt
imagegen / authored high-resolution sources
  -> pose and direction review sheet
  -> deterministic crop / frame normalization
  -> spritesheet or atlas + manifest
  -> asset.definition (atlas/spritesheet/audio)
  -> animation.clip / animator.graph / animator.binding
  -> preload group
  -> Phaser Driver loader/cache
  -> Animator/Renderer/Audio adapter binding
```

Manifest 保存 frame name、duration、direction、pivot、visual socket 和 source revision。Collider 不从动画 alpha 轮廓生成；Gameplay body/hurtbox 使用独立 Physics definition。需要变化的 attack shape 由 ability/Combat data 定义，并以 animation overlay 工具预览两者对齐。

Runtime `public` 只保存压缩产物，原始生成图与工作文件位于 source asset 目录。重复角色复用 atlas，不按 entity 加载纹理。

## 性能与质量

- 500 active dynamic objects 下 Animator controller 更新和 backend write 有独立 budget。
- 远处/屏外对象可以降低 animation frame rate 或暂停非关键 particle，但 gameplay telegraph state 仍可恢复。
- Particle、voice、one-shot、marker 和 cue history 均有 max concurrent / ring limit。
- Texture atlas 尺寸、memory、upload time、draw call、fill rate 和 voice 数量进入 profile。
- 静态场景与 sprite 使用稳定采样/rounding policy，摄像头移动时不能闪烁或抖动。

真实浏览器验证覆盖 local/remote locomotion、转向边界、fire/reload/dash、受击/死亡、late join active action、reconnect、竖屏 viewport、reduced motion、mute/unlock 和高密度战斗效果降级。
