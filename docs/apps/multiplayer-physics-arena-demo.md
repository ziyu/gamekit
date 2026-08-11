# Multiplayer Physics Arena Demo 应用设计

## 定位

Multiplayer Physics Arena Demo 是 GameKit 的 3D server-authoritative 高互动刚体验证应用，工作名称为
`Knockout Arena`。它用一局短时障碍赛验证类似糖豆人场景的关键框架问题：多个玩家、动态道具、确定性移动机关和
拥挤接触必须在同一个 prediction island 中按相同 tick 回滚重演，而不是只预测本地胶囊体。

它与现有应用职责不同：

- Multiplayer Demo 继续提供小规模网络/复制快速回归基线；
- Outpost Siege 继续验证 2D 综合玩法和 selective prediction；
- Physics 3D Lab 继续验证单机 Rapier 3D facade；
- Knockout Arena 专门验证多人 3D Physics arena prediction 的标准组合和体验质量。

应用是标准协议的真实消费者，不是协议来源。玩家控制、关卡机关、淘汰、检查点和胜负规则保持 app-local。

## 核心体验

- 两个浏览器玩家可以 Host & Join / Join 同一 Colyseus session；空位由固定 seed 的 authority bots 填充。
- 默认一局包含 2 个真人和 6 个 bots，支持 12 个参与者的压力 preset。
- 玩家使用动态 capsule，支持移动、跳跃和可撤销的 dive；角色之间可以推挤、阻挡和连锁碰撞。
- 单一短赛道由三个可读区域组成：旋转 sweeper、拥挤门与可推动物体、移动平台与终点。
- 掉出场地后由 authority 决定淘汰或从最近检查点重生；到达终点和排名只由 authority 提交。
- 视觉采用清晰的程序化 Three mesh、颜色和轮廓，不依赖外部品牌资产，不复刻糖豆人角色或关卡美术。
- 主视图优先展示游戏；网络和 prediction diagnostics 位于可折叠侧栏，不挤压操作区域。

## Authority 与 simulation

- Colyseus Room 持有 headless App Host、GameRuntime、World、Rapier 3D PhysicsModule 和唯一 authority clock。
- Physics 固定步长为 60 Hz；本地 predicted input 与 authority consumption 使用相同 step/sequence 语义。
- Authority arena frame 默认 20 Hz 发布；predicted input 使用有界 redundant fixed-step bundle，离散 ready/start/reset
  走 reliable action lane。Colyseus 当前映射到 reliable ordered transport；具备 datagram capability 的 backend 可把同一
  bundle 映射到 unreliable channel，而不改变 sequence/ack/inbox 语义。
- Kinematic obstacle motion 由共享 definition、round generation 和 tick 确定性计算；动态玩家和可推动物体由
  authority Rapier scene 求解。
- Authority payload 声明完整 `islandId`、generation、tick、membership revision、definition version 和成员 body
  state；player/peer、ack、round phase、checkpoint、finish 和 result 保持 app schema 字段。
- 离线练习使用同一 authority/snapshot/prediction contract，只把 transport 换成本地 in-process endpoint。

## Client prediction

- 首个版本每个客户端使用一个完整 arena island，包含本局所有玩家、会参与接触的动态道具和 kinematic 机关。
- 静态赛道 geometry 由 versioned Data/layout 在客户端和服务端重建，不重复进入每个 authority frame。
- 客户端只把本地玩家输入映射为 predicted command；远端玩家从最新 authority state 以其 body state 继续求解，并在
  后续 snapshot 到达时整体校正。
- snapshot 到达后先 reconcile 全体成员，再重演未确认本地输入。成员 revision、generation、definition 或 history
  不可复用时安装完整 hard-correction baseline。
- 任何会与本地玩家发生因果接触的对象都不能只做 renderer interpolation。纯装饰物、远景和 UI 不进入 island。
- 跳跃、dive、碰撞 pulse、落地尘土和镜头反馈可以本地 anticipation，但通过 speculative effect journal 去重并接受
  authority confirm/cancel；淘汰、检查点、名次和奖励不预测为最终事实。

## 模块协作

- `@gamekit/multiplayer-core`：session、authority binding、managed replication、client prediction domain bridge、
  input/ack、snapshot playback 和 diagnostics。
- `@gamekit/app-host`：标准 Physics Arena prediction adapter、authority projection、rollback/effect 组合与 profile。
- `@gamekit/physics-core` / `@gamekit/physics-rapier3d`：PhysicsModule、full-scene checkpoint、prediction island、body/
  collider/layout definition 和 query/contact。
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

网络模拟 preset 必须能覆盖正常、延迟、jitter、丢包和短时 snapshot gap，但模拟器只改变 delivery，不拥有第二套
prediction clock。

## 长期约束

- 主游戏路径必须消费标准 Physics Arena adapter；app 不在 network callback 或 render loop 手写 reconcile/replay。
- 游戏端不 import Rapier native type；backend native diagnostics 只能出现在 adapter 或 app-specific debug integration。
- 单个完整 island 是正确性基线。若加入分区，authority 必须声明完整 membership revision，且跨 island 对象不能保持
  可碰撞却不共享历史。
- Renderer/camera 只消费 presented/predicted output，不把平滑 transform 写回 authority 或 island simulation state。
- 一局游戏有完整 lobby → countdown → running → qualified/eliminated → results → rematch 流程；不能退化为只有刚体和
  数字面板的实验台。
- 不使用外部品牌名称、角色造型、关卡布局或音频资产；“糖豆人式”只描述多人障碍赛与拥挤物理交互类别。

## 非目标

- 生产 matchmaking、账号、邀请、公网部署、反作弊和 host migration。
- 自动大世界 interest management 或客户端启发式 island partition。
- joint、ragdoll、绳索或 backend-native constraint graph。
- 完整角色动画/换装、商业内容管线、多关卡轮换和长期经济。
- bit-identical 跨所有浏览器/CPU 的确定性承诺；checksum、reconcile 和 hard correction 仍是安全边界。
