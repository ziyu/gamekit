# Knockout Arena 表现与 UX

## 领域边界

Presentation 把 authority/predicted semantic state 映射为 Three render object、Animator parameter/one-shot、Audio event、Camera
display state 和 UI view model。它不推进 Physics、motor、item、Combat、AI 或 Match state，也不使用动画/音频完成回调决定
gameplay timing。

## 视觉方向

主题是“午夜电视竞技秀 + 霓虹玩具工厂”：深色场馆、强轮廓角色、清晰赛道色块、广播灯带和可读机关预兆。视觉必须
形成独立辨识度，不复刻外部品牌角色、关卡布局、Logo、服装或音效。

### 可读性层级

1. Gameplay silhouette：角色、有效落脚面、边缘、kill/danger zone、机关作用范围。
2. Action telegraph：windup、throw direction、hammer arc、crusher/fan/sweeper phase。
3. Ownership/status：本地角色、carried item、instability/stagger、qualified/eliminated。
4. Broadcast atmosphere：观众舱、灯带、粒子、远景和节目包装。

第四层不能遮挡前三层。Bloom、motion、shake 和粒子需要强度上限与辅助设置。

## Render State

最终 presentation frame 只从统一 writer 读取：

- actor predicted/presented transform 与 motor semantic state。
- item world/carried/action phase 与 authority result。
- hazard transform/public phase/warning。
- match/stage/participant/ranking/result projection。
- speculative effect journal settlement。

Renderer 不能同时读取 raw snapshot、Physics native scene 和 World shadow形成多个 transform writer。Correction smoothing 是
display state，不写回 solver。

## 角色表现

Circuit Runner 具有独立、清晰的比例和颜色编码；本地、真人、bot、qualified、eliminated 和 spectator target 不只依赖颜色
区分，还使用轮廓、标记或材质 pattern。

Animator 参数：

- continuous：speed、move direction、facing、vertical velocity、instability。
- boolean/tag：grounded、carrying、diving、staggered、recovering、eliminated。
- action phase：pickup、windup、throw、melee、drop、qualification/KO reaction。

Base layer 覆盖 idle/run/jump/fall/dive/recovery；action layer 覆盖 pickup/carry/windup/throw/melee；reaction layer 覆盖
impact/stagger/qualified/eliminated。Authority action phase是时间源；marker只驱动脚步、衣物、挥动轨迹等表现。

Remote/late join 按 phase start tick seek 当前动作位置，不从第一帧重播已经过期的 windup、throw 或 KO reaction。

## 道具与机关表现

- World item 使用 instance/generation visual identity；predicted spawn 与 authority takeover不能复制 mesh。
- Carried item绑定语义 socket，presentation自行解析 Three node/bone；gameplay不保存 native target。
- Pickup candidate有轻量 outline/reticle，authority claim后才进入最终 carry状态；reject快速淡出而非瞬间生成第二件物品。
- Throw显示 charge和方向，但不显示无法兑现的精确命中线；impact point来自 authority/predicted空间事实。
- Hazard具有 warning → active → recover 的统一视觉语汇；颜色、灯带、机械动作和音频共同表达 phase。
- Collapsing tile在 collision仍有效时不能视觉完全消失，在 collision移除后不能继续表现为安全落脚面。

## VFX 与 Effect Journal

可预测反馈：jump/dive impulse、pickup reach、throw release、轻接触、落地、局部镜头冲击。Authority-only或需要确认的反馈：
item owner、有效 hit、instability/stagger、KO、qualification、winner、item respawn。

所有 replay-sensitive effect由 speculative journal提供 stable identity和 anticipate/confirm/cancel/replace。Renderer、Audio、Camera
和 UI consumer不各建 dedupe Set。

VFX 分类：

- movement：脚步材质、落地尘、dive trail。
- interaction：pickup ring、carry socket pulse、charge arc、throw streak。
- impact：方向性碎片、shock ring、hammer sweep、stagger outline。
- match：checkpoint、qualification beam、KO burst、winner podium。
- hazard：warning strip、wind stream、crusher flash、tile crack/collapse。

粒子数量、lifetime、同时 emitter、decal和trail都有硬上限；远端/屏外反馈使用LOD而不删除gameplay telegraph。

## Audio

Audio event目录：

- Music：lobby、stage intro、running、sudden death、results，并按authority phase切换。
- Character SFX：footstep surface、jump、dive、land、stagger、eliminated。
- Item SFX：spawn、pickup、carry loop、windup、release、impact、fuse、trigger、respawn。
- Hazard SFX：motor loop、warning、active、impact、recover。
- UI/Broadcast：countdown、qualification、KO feed、placement、winner。

Spatial emitter跟随presented actor/item/hazard；逻辑event identity与native playback instance分离。Audio Core限制bus、priority、
concurrency、cooldown和voice stealing；重复 replay/late join不重放过期one-shot。用户可独立调整music/SFX/UI、动态范围、
震动与高频冲击音强度。

## Camera

### Playing Camera

- 第三人称透视，围绕本地actor的predicted/presented target。
- camera-relative movement使用目标yaw，不读取带shake的display transform。
- speed look-ahead、airborne framing和item aim有有界平滑；墙体/机关遮挡使用query或可替换策略。
- Impact/dive/KO shake是display impulse；幅度、频率、duration和同时impulse数量有上限。
- 本地角色被淘汰后停止跟随不存在的body，平滑切换spectator camera。

### Spectator Camera

- 默认选择仍active且可见的participant；用户可以上/下一目标或自由查看声明的arena camera anchor。
- 观战不提供隐藏item respawn、AI blackboard或未公开hazard随机结果。
- Target淘汰/disconnect/stage reset时使用稳定fallback，不把旧actor重新生成。

### Broadcast Camera

Stage intro、results和winner podium可以使用app-ownedThree native camera，但只消费authority phase和presentation state；它不能
控制Physics、input scope或Match deadline。

## 页面与 HUD

### 页面

- Title/Connection：服务器状态、离线练习入口、辅助设置。
- Lobby：room code、participant/bot roster、ready/content compatibility、输入设备。
- Loading：required content进度、等待成员、错误/重试。
- Stage Intro：目标、晋级名额、关键机关/道具说明。
- Playing HUD：阶段目标、timer、排名/存活数、item、charge、instability和轻量feed。
- Spectator：观战目标、placement、下一stage/match状态。
- Stage Results：晋级/淘汰、关键KO和下一stage。
- Match Results：winner、完整placement、stage表现、KO/assist、道具与机关因果、rematch/leave。

### HUD 优先级

Gameplay视图始终占主区域。常驻HUD只显示当前做决定需要的信息；网络tick、body count、checkpoint bytes、trace和provider
状态只进入可折叠DevTools/telemetry，不伪装成正式体验。

Instability bar表达“更容易被击飞”，不暗示传统HP。KO feed必须区分player/item、environment、disconnect/forfeit。

## 输入提示与辅助功能

- 动作提示跟随最近有效input device，支持键鼠和standard gamepad；提示切换不改变binding或input sequence。
- Gameplay input只在game viewport scope；modal、room controls、text input和DevTools捕获后不漏到角色。
- 支持镜头灵敏度/反转、shake/flash强度、gamepad dead zone/rumble、音量/动态范围、字幕/文本大小。
- 关键危险、participant、队伍/状态不能只靠红绿；提供高对比轮廓、pattern和icon。
- Countdown、warning、KO和results同时提供视觉/音频通道；减少动态模式降低粒子、trail和camera impulse但不删除预兆。
- UI响应viewport变化，不通过缩小3D主视图永久塞入telemetry侧栏。

## Performance 与诊断

Presentation分配/更新按actor/item/hazard批处理，避免每frame创建临时geometry/material或React高频state。Three resource在
member removal、stage reset和dispose时释放，predicted/authority同identity切换不重复创建。

诊断至少显示render object/animation/audio/effect/camera数量、late-join seek、speculative settlement、resource retain、frame
time和降级原因。具体预算与browser验收见[`quality-and-acceptance.md`](./quality-and-acceptance.md)。
