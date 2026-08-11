# Multiplayer Physics Arena Demo 应用设计

## 定位

Multiplayer Physics Arena Demo 是 GameKit 的 3D server-authoritative 高互动刚体竞技游戏，工作名称为
`Knockout Arena`。它用一场多阶段电视竞技秀验证类似派对障碍赛和物理乱斗场景的关键框架问题：多个玩家、可拾取与
投掷的动态道具、确定性移动机关和拥挤接触必须在同一个 prediction island 中按相同 tick 回滚重演，而不是只预测
本地胶囊体。

它与现有应用职责不同：

- Multiplayer Demo 继续提供小规模网络/复制快速回归基线；
- Outpost Siege 继续验证 2D 综合玩法和 selective prediction；
- Physics 3D Lab 继续验证单机 Rapier 3D facade；
- Knockout Arena 专门验证多人 3D Physics arena prediction、角色控制、AI、物理战斗和完整比赛体验的标准组合。

应用是标准协议的真实消费者，不是协议来源。玩家控制、关卡机关、淘汰、检查点和胜负规则保持 app-local。

## 核心体验

- 两个浏览器玩家可以 Host & Join / Join 同一 Colyseus session；空位由固定 seed 的 authority bots 填充。
- 默认一局包含 2 个真人和 6 个 bots，支持 12 个参与者的压力 preset。
- 玩家使用动态 capsule，支持移动、跳跃和可撤销的 dive；角色之间可以推挤、阻挡和连锁碰撞。
- 一场比赛由资格赛、道具乱斗和坍塌决赛三个 stage 组成；每个 stage 使用独立 generation、成员 revision、规则和场景。
- 掉出场地后由 authority 淘汰；淘汰 Actor 从本局 prediction island 移除，不再参与碰撞，也不会在本局内重生。
  下一 stage 只为已晋级者安装新的 generation；下一场 match 才恢复完整参赛阵容。到达终点和排名只由 authority 提交。
- 视觉采用“午夜电视竞技秀 + 霓虹玩具赛道”方向：程序化 Three mesh、强轮廓、赛道灯带和远景观众舱形成独立辨识度，
  不依赖外部品牌资产，也不复刻糖豆人角色或关卡美术。
- 玩家使用独立的 Circuit Runner 造型和第三人称跟随镜头；移动步态、跳跃涟漪、碰撞碎片与短促镜头震动只消费
  predicted/presented state，不反写 simulation。
- 主视图始终占满应用；房间操作、名次、进度、比赛控制 feed 以 broadcast HUD 覆盖在画面上，完整 netcode
  diagnostics 位于可折叠 telemetry drawer，不挤压操作区域。

## 比赛、胜负与参与者生命周期

- 标准比赛从 8 名参与者开始，真人不足时由 authority bots 补位；late join 进入 spectator，并在下一场比赛加入。
- 资格赛按到达终点、检查点进度和完成时间排序，前 6 名晋级；掉出场地直接淘汰，不在当前 stage 内重生。
- 道具乱斗按存活状态、击落贡献和场地目标积分排序，前 3 名晋级；最后一次有效冲击来源用于稳定的击落/助攻归因。
- 坍塌决赛持续收缩安全区域，最后存活者获胜。超时仅作为故障保护，按存活、击落、稳定度、中心控制和 stable id
  依次确定排名，不能依赖容器或 backend 返回顺序。
- Authority 唯一提交 qualified、eliminated、placement、winner、knockout credit 和 match result。客户端只预测移动、接触
  与可撤销反馈，不预测最终胜负。
- 完整生命周期是 lobby → match countdown → stage intro → running → sudden death / finish → stage results →
  intermission → match results → rematch。离线练习复用同一规则，只替换 transport。

## 角色控制与物理战斗

- 玩家与 AI 消费同一个角色 intent：移动、瞄准、跳跃、dive、交互、拾取、使用、蓄力投掷和丢弃；AI 不能绕过玩家
  输入会经过的 authority 校验。
- 标准角色控制器支持 camera-relative acceleration/braking、ground probe、坡度与台阶、coyote time、jump buffer、
  moving-platform velocity、受限空中控制、dive/recovery、推动和稳定朝向。
- 角色只有一个 authority 物理身体。locomotion、stagger、knockback、carry 和 recovery 是可 checkpoint/replay 的语义
  状态，不由动画回调或 Renderer transform 决定。
- 竞技结果以掉出场地为主，不使用传统生命值清空。冲击会累积可衰减的 instability，提高后续 knockback，并可触发短暂
  stagger；最终淘汰仍由 authority bounds / kill volume 判定。
- Combat/GAS 负责攻击阶段、命中去重、效果、stagger 与 instability；Physics 负责真实碰撞和 impulse。表现层只消费
  语义 cue 与空间事实。

## 场景机关与可用道具

- 稳定场景机关包括旋转杆、移动平台、拥挤门、活塞、粉碎机、传送带、风区、弹射板、伸缩墙、冰面和坍塌地板。
- 动态场景道具包括轻球、重箱、滚筒和可推动障碍；所有能影响玩家接触结果的 body 都进入完整 prediction island。
- 首组可拾取道具包括轻型泡沫球、重型能量块、延时冲击球和泡沫锤，覆盖快速投掷、慢速重击、范围 impulse 与近战弧。
- 道具生命周期是 world → pickup claim → carried → windup/use → released/active → spent/respawn。Carried 状态使用稳定
  item id/generation 和表现 attachment，不通过 backend-native joint 把物体挂到角色身上；投掷时重新进入物理岛。
- Pickup、use 和 throw 是 authority command；本地可以 anticipation，但冲突、目标、命中、击落和 respawn 都由 authority
  confirm/reject/correct。
- Joint、绳索、ragdoll 或复杂 constraint 只有在 Physics 公共协议和 checkpoint conformance 明确支持后才能加入，不能
  通过 Rapier native handle 偷渡到游戏公共状态。

## AI

- Bots 只在 authority 运行，并通过 AI Core 的 perception → utility goal → interruptible task → gameplay intent 链路行动。
- 感知覆盖玩家、场外风险、移动机关时间窗、可拾取道具、视线和最近冲击；使用有界 memory、共享空间候选和错峰预算。
- 标准 goal 包含 survive、advance、acquire-item、attack-vulnerable、deny-item、escape-hazard 和 contest-objective。
- 标准 task 把行为拆成 acquire → route/steer → telegraph/windup → commit → recover；Navigation 只给路线，局部避障和
  最终移动合法性由 steering/Physics 决定。
- Bot archetype 通过 Data 调整反应时间、瞄准误差、风险偏好、攻击性、道具偏好和 goal 权重，不复制多套 update loop。

## Authority 与 simulation

- Colyseus Room 持有 headless App Host、GameRuntime、World、Rapier 3D PhysicsModule 和唯一 authority clock。
- Physics 固定步长为 60 Hz；本地 predicted input 与 authority consumption 使用相同 step/sequence 语义。
- Authority arena frame 默认 20 Hz 发布；predicted input 使用有界 redundant fixed-step bundle，离散 ready/start/reset
  走 reliable action lane。Colyseus 当前映射到 reliable ordered transport；具备 datagram capability 的 backend 可把同一
  bundle 映射到 unreliable channel，而不改变 sequence/ack/inbox 语义。
- Kinematic obstacle motion 由共享 definition、round generation 和 tick 确定性计算；动态玩家和可推动物体由
  authority Rapier scene 求解。
- Authority payload 声明完整 `islandId`、generation、tick、membership revision、definition version、成员 body state
  和全体 Actor 已消费的持续控制意图；player/peer、ack、round phase、checkpoint、finish 和 result 保持 app schema 字段。
- 离线练习使用同一 authority/snapshot/prediction contract，只把 transport 换成本地 in-process endpoint。

## Client prediction

- 首个版本每个客户端使用一个完整 arena island，包含本局所有玩家、会参与接触的动态道具和 kinematic 机关。
- 静态赛道 geometry 由 versioned Data/layout 在客户端和服务端重建，不重复进入每个 authority frame。
- 客户端把本地玩家输入和 authority 最近确认的远端持续控制映射为同 tick predicted command；远端离散事实不预测，
  但会参与接触的 Actor 必须在 replay 中继续消费共享 motor，避免碰撞速度与 authority 控制每帧分叉。
- snapshot 到达后先 reconcile 全体成员，再重演未确认本地输入。成员 revision、generation、definition 或 history
  不可复用时安装完整 hard-correction baseline。
- 淘汰会递增 membership revision，并通过 authority frame 移除对应 Actor；客户端不得为缺失 Actor 保留可碰撞替身。
  Stage generation 变化后按 authority 声明的晋级成员安装新 baseline；新 match generation 才恢复完整参赛阵容。
- 任何会与本地玩家发生因果接触的对象都不能只做 renderer interpolation。纯装饰物、远景和 UI 不进入 island。
- 跳跃、dive、碰撞 pulse、落地尘土和镜头反馈可以本地 anticipation，但通过 speculative effect journal 去重并接受
  authority confirm/cancel；淘汰、检查点、名次和奖励不预测为最终事实。

## 模块协作

- `@gamekit/multiplayer-core`：session、authority binding、managed replication、client prediction domain bridge、
  input/ack、snapshot playback 和 diagnostics。
- `@gamekit/app-host`：标准 Physics Arena prediction adapter、authority projection、rollback/effect 组合与 profile。
- `@gamekit/physics-core` / `@gamekit/physics-rapier3d`：PhysicsModule、full-scene checkpoint、prediction island、body/
  collider/layout definition、query/contact 和 impulse/body command。
- `@gamekit/combat` / `@gamekit/gas`：道具 use/throw 的攻击阶段、目标校验、命中去重、instability/stagger effect 和 trace。
- `@gamekit/ai-core` / `@gamekit/navigation-core` / `@gamekit/navigation-recast`：authority bot 决策、task、路线与障碍失效。
- `@gamekit/animator-core` / `@gamekit/audio-core`：角色 locomotion/action/reaction 语义表现与有界空间音频实例。
- `@gamekit/driver-three`：Three renderer、scene、camera adapter 和程序化 mesh presentation；Three native object 只出现在
  app presentation integration。
- `@gamekit/world`：authority gameplay entity 和 client presentation shadow；不重复拥有 island solver checkpoint。
- `@gamekit/input-core` / DOM source：viewport-scoped keyboard/gamepad input；UI、DevTools 和文本输入抢占 gameplay scope。
- `@gamekit/multiplayer-colyseus`：Room-owned server runtime、transport 和 provider state source，不拥有玩法 schema。

## 诊断体验

可折叠 diagnostics 至少显示：

- authority/client tick、snapshot age、RTT、jitter、loss preset 和 input lead；
- island generation、membership revision、member count 和 definition version；
- checkpoint captures/restores、history entries/bytes 和 replay ticks；
- confirmed/corrected/hard-corrected 次数、最大 correction magnitude 和 checksum mismatch；
- speculative effect pending/confirmed/cancelled；
- server/client body/contact 数、payload bytes 和 dispose/retained-state 摘要。

网络模拟 preset 使用 Multiplayer Core 的确定性 network-condition simulator，覆盖正常、延迟、jitter、丢包、duplicate
和短时 snapshot gap。模拟器只改变 delivery，不拥有第二套 prediction clock；测试分别展示 authority consumed sequence
与 client observed ack，避免把服务端内部水位误报为客户端已确认。

## 长期约束

- 主游戏路径必须消费标准 Physics Arena adapter；app 不在 network callback 或 render loop 手写 reconcile/replay。
- 游戏端不 import Rapier native type；backend native diagnostics 只能出现在 adapter 或 app-specific debug integration。
- 单个完整 island 是正确性基线。若加入分区，authority 必须声明完整 membership revision，且跨 island 对象不能保持
  可碰撞却不共享历史。
- Renderer/camera 只消费 presented/predicted output，不把平滑 transform 写回 authority 或 island simulation state。
- Demo presentation 可以在 Three Driver 暴露的 native scene/renderer boundary 创建专用透视镜头；该镜头只属于 app
  presentation，不能成为共享 simulation 或通用 renderer 协议的一部分。
- 一场游戏必须完成多 stage 晋级、物理淘汰、道具交互、AI 对局、观战、最终 winner 和 rematch；不能退化为只有刚体和
  数字面板的实验台。
- 不使用外部品牌名称、角色造型、关卡布局或音频资产；“糖豆人式”只描述多人障碍赛与拥挤物理交互类别。

## 非目标

- 生产 matchmaking、账号、邀请、公网部署、反作弊和 host migration。
- 自动大世界 interest management 或客户端启发式 island partition。
- joint、ragdoll、绳索或 backend-native constraint graph。
- 大规模商业内容管线、完整换装、赛季、长期经济和用户生成关卡。
- bit-identical 跨所有浏览器/CPU 的确定性承诺；checksum、reconcile 和 hard correction 仍是安全边界。
