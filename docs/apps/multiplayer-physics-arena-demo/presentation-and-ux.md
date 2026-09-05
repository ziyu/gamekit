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

### Animator 集成契约

Arena client 维护一个独立 presented-state runtime。它把 prediction island 的 body/motor auxiliary state 与 authority 的
participant、item、combat、match projection 合并为每个 actor 唯一的动画语义帧；Three playback adapter 只解释该帧，不再
自行推断 grounded、stagger、carry 或 elimination gameplay 状态。

- Base/action/reaction graph 和 clip mapping 由 app DataPack 定义，业务代码不依赖 Three animation native type。
- Continuous parameter 可随预测帧更新；authority action phase 以 execution id、start tick、duration 和 stage generation 同步。
- Stage generation 变化必须 reset controller；actor 离开 membership 必须 unbind，并释放 retained playback frame。
- 本地预测通过 motor/base state即时反馈；replay-sensitive action/reaction one-shot只消费 effect journal 已结算的 stable
  identity，presentation consumer不另造业务去重规则。
- Late join 直接 seek 当前 phase progress；seek 不补发已经越过的 marker。脚步、拖尾等 marker只能产生表现，不提交命中、
  release、KO 或 stage result。
- Playback adapter 的 controller、frame、marker history、one-shot queue 和 trace 都有硬上限，dispose 后 retained state 为零。

## 道具与机关表现

- World item 使用 instance/generation visual identity；predicted spawn 与 authority takeover不能复制 mesh。
- Carried item绑定语义 socket，presentation自行解析 Three node/bone；gameplay不保存 native target。
- Pickup commit 后复用同一个 visual object 并从 world root 转挂到角色 socket；world body despawn 不等于 visual dispose。Drop/throw
  递增 generation 后再恢复 world visual，避免拾取瞬间消失、闪烁或出现双份模型。
- Pickup candidate有轻量 outline/reticle，authority claim后才进入最终 carry状态；reject快速淡出而非瞬间生成第二件物品。
- Throw显示 charge和方向，但不显示无法兑现的精确命中线；impact point来自 authority/predicted空间事实。
- Hazard具有 warning → active → recover 的统一视觉语汇；颜色、灯带、机械动作和音频共同表达 phase。
- Collapsing tile在 collision仍有效时不能视觉完全消失，在 collision移除后不能继续表现为安全落脚面。

### 场景元素真实性契约

任何视觉上被设计成玩法机关的元素都必须对应一个可验证的 gameplay fact，不能用静态模型冒充可交互内容：

- `rotating-sweeper`、`piston`、`moving-platform`、`crumble-floor` 的机械主体必须直接跟随 prediction island body transform；轴、行程和碰撞轮廓与 Course schedule 一致。
- `conveyor`、`wind-zone`、`bounce-pad`、`shrinking-zone` 即使通过 volume/body command 生效，也必须把方向、强度、活动 phase 和作用范围表现为持续机械动画；不能只改变 emissive 颜色。
- 传送带板条/滚轴方向必须与实际 impulse 轴一致；风机和风流必须与推力方向一致；弹跳板压缩/回弹必须与 launch cadence 一致；收缩环必须读取 replicated `safeScale`。
- 建筑门架、观众舱、广播环、护栏信标等不参与 gameplay 的元素应明确保持在 atmosphere 层。它们可以运行环境动画，但轮廓、材质和布局不能伪装成有碰撞或伤害的机关。
- 每种 authored hazard 必须同时有物理/区域命令测试和 presentation motion 测试；新增 hazard kind 不能只依赖通用静态盒 fallback 通过验收。

开发/验收构建可通过 `?hazard-audit=1` 打开只读的 Real Interaction Audit。它按当前 stage 枚举全部 hazard 与 dynamic prop，选择
实例后把观察相机对准其可视根节点，并同时公开 member id/kind/phase、prediction tick/body transform、authority tick/body
transform、visual root transform 与首个辅助动画 part。审计面板不能改变 Physics、Match 或 schedule，只作为真实浏览器证据面。
面板还必须在单一 `data-evidence` 读面中输出当前 stage 全部实例，避免短 stage 或远程浏览器逐项点击延迟导致跨 generation
污染；单项 selector 只负责观察相机，不是批量验收的唯一入口。

活动参与者的 Renderer/Camera/Feedback 始终优先读取 prediction island。淘汰或纯 spectator 客户端没有 gameplay prediction domain
时，表现层统一降级读取同一份 authority frame；审计明确标为 `AUTHORITY FALLBACK`，不能冒充本地预测。该 fallback 只读且不生成
input、replay、contact gameplay 或 authority fact，保证观战者仍能看到后续 stage 的机关、道具和角色，而不为 spectator 维持无用 rollback history。

## VFX 与 Effect Journal

可预测反馈：jump/dive impulse、pickup reach、throw release，以及已经被 item/contact resolver 分类为潜在命中的局部
`item-hit`。Authority-only或需要确认的反馈：item owner、有效 hit、instability/stagger、KO、qualification、winner、
item respawn。

普通 Physics solver contact 是空间事实，不是表现语义：地面、墙面、玩家拥挤和 solver 短暂分离后的 contact enter 都不能直接
触发受击闪光、impact 音效或镜头震动。真正的受击表现只由 `combat.hits` 确认；落地反馈应来自 character motor 的 grounded
边沿及落地速度，机关冲击应由 hazard resolver 产出的显式 impact 事实驱动。不得用 collider 名称黑名单修补普通接触误报。

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

Arena 的浏览器组合层在 Driver 没有 Audio slice 时绑定 app-owned WebAudio backend；backend只执行已编译的 authored/synth key、
gain、pan、fade和voice lifecycle。Catalog、music transition、SFX dedupe/concurrency、空间 identity、逻辑/native预算和diagnostics
仍由 Audio Core持有。用户手势只调用`GameAudio.unlock()`，不让 gameplay 直接操作`AudioContext`。

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
- Playing/spectator/broadcast target由统一feedback frame给出；Three camera只平滑追随该display target，不能反向改变participant、
  input、Physics transform或ranking。
- Character Motor 的 semantic yaw 以 `+Z` 为零朝向；Arena runner mesh 以本地 `-Z` 为正面。Three adapter 只在表现边界做一次
  `π` 轴转换，不能把 renderer 轴约定写回 prediction、authority 或共享 controller state。

### Broadcast Camera

Stage intro、results和winner podium可以使用app-ownedThree native camera，但只消费authority phase和presentation state；它不能
控制Physics、input scope或Match deadline。

## 页面与 HUD

### 页面

- Title/Connection：服务器状态、房间码、显示名、创建房间的起始场景选择和辅助设置。起始场景默认显示随机抽签；加入已有房间时
  该控件不覆盖房间 authority 已确定的赛程。
- Lobby：room code、participant/bot roster、ready/content compatibility、输入设备。
- Loading：required content进度、等待成员、错误/重试。
- Stage Intro：目标、晋级名额、关键机关/道具说明。
- Playing HUD：阶段目标、authority timer、排名/存活数、资格赛 checkpoint/晋级进度、item、charge、instability和轻量feed。
- Spectator：观战目标、placement、下一stage/match状态。
- Stage Results：晋级/淘汰、关键KO和下一stage。
- Match Results：winner、完整placement、stage表现、KO/assist、道具与机关因果、rematch/leave。

### HUD 优先级

Gameplay视图始终占主区域。常驻HUD只显示当前做决定需要的信息；网络tick、body count、checkpoint bytes、trace和provider
状态只进入可折叠DevTools/telemetry，不伪装成正式体验。

Arena UI先由纯`ArenaUiViewModel`把公开match/participant/ranking/item/combat快照、feedback camera和本机peer身份投影为页面状态，
DOM层只提交`textContent`、class和CSS custom property。Lobby、stage intro、playing、spectator、stage results与match results不能各自
重新解释淘汰、晋级、winner或rematch；results deadline统一显示authority自动排队的下一stage或下一match。

Running timer 必须由 snapshot 的 `deadlineTick - frame.tick` 计算，不使用关卡无关的客户端固定时长。资格赛 HUD 显示当前关注者的
`CHECKPOINT n / total`、authority `normalizedProgress`、全场 `finished / qualificationCount` 和确定性名次。本人状态变为
`qualified` 后，即使本地 actor 已从 frame 移除并切到 spectator camera，HUD 仍通过 peer→participant 绑定显示持久的
`FINISH CONFIRMED / QUALIFIED` 覆盖层；不能把“身体消失”误解释成淘汰或让成功反馈只闪一帧。

KO feed的首次snapshot只建立hit/status/result基线，避免late join补播旧比赛事件；之后按stable hit/result identity和participant status
edge生成item hit、environment KO、qualified与winner条目。Tracker只保留协议本身的有界rolling set，UI同时最多显示6条；网络telemetry
只保留在默认折叠的diagnostics区域。

Instability bar表达“更容易被击飞”，不暗示传统HP。KO feed必须区分player/item、environment、disconnect/forfeit。

## 输入提示与辅助功能

- 动作提示跟随最近有效input device，支持键鼠和standard gamepad；提示切换不改变binding或input sequence。
- Gameplay input只在game viewport scope；modal、room controls、text input和DevTools捕获后不漏到角色。
- 支持镜头灵敏度/反转、shake/flash强度、gamepad dead zone/rumble、音量/动态范围、字幕/文本大小。
- 关键危险、participant、队伍/状态不能只靠红绿；提供高对比轮廓、pattern和icon。
- Countdown、warning、KO和results同时提供视觉/音频通道；减少动态模式降低粒子、trail和camera impulse但不删除预兆。
- UI响应viewport变化，不通过缩小3D主视图永久塞入telemetry侧栏。

浏览器输入控制器只在game viewport自身或其后代持有focus时采样；room input、button、modal、telemetry与window blur都会得到neutral
movement并清空edge。键盘与`mapping === "standard"`的gamepad共享相同semantic callback，按有效axis/button edge切换最近设备提示；
手柄dead zone在归一化前应用。观战上/下一目标也走feedback display callback，不能提交gameplay input或改变Physics identity。

## Performance 与诊断

Presentation分配/更新按actor/item/hazard批处理，避免每frame创建临时geometry/material或React高频state。Three resource在
member removal、stage reset和dispose时释放，predicted/authority同identity切换不重复创建。

诊断至少显示render object/animation/audio/effect/camera数量、late-join seek、speculative settlement、resource retain、frame
time和降级原因。具体预算与browser验收见[`quality-and-acceptance.md`](./quality-and-acceptance.md)。
