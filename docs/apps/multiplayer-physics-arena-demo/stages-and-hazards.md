# Knockout Arena Stage、场景与机关

## 领域边界

Stage Content 定义静态场地、动态/kinematic 成员、hazard schedule、surface/volume、spawn、checkpoint、finish、item placement、
Navigation source 和 presentation placement。它不推进 match phase、不裁决玩家输入、不拥有 Physics/Navigation backend。

同一个 versioned Course Definition 必须投影到 authority Physics、client Physics environment、Navigation、Renderer 和内容校验；
不能让视觉模型、碰撞、路线和 kill volume 分别维护互相漂移的坐标。

## Course Definition

```ts
type ArenaCourseDefinition = {
  id: string;
  definitionVersion: string;
  bounds: ArenaBoundsDefinition;
  spawnSet: DataRef<"arena.spawn-set">;
  staticLayout: ArenaStaticPlacementDefinition[];
  hazards: ArenaHazardPlacementDefinition[];
  props: ArenaDynamicPropPlacementDefinition[];
  volumes: ArenaGameplayVolumeDefinition[];
  navigation: ArenaCourseNavigationDefinition;
  presentation: ArenaCoursePresentationDefinition;
};
```

`definitionVersion` 与编译后的 layout/schedule signature 一起进入 arena frame definition version。Authority/client 内容版本不一致时拒绝
baseline，不使用近似 layout 继续 replay。Checkpoint、finish、item 等语义通过带 stable placement id 的 volume/spawn placement
表达，避免同一空间事实再维护一份旁路坐标。

## Shared Projection

Course compiler 产生：

- static Physics environment：不进入每帧 snapshot。
- dynamic/kinematic prediction island member definitions。
- Navigation build source、area/portal 与动态 obstacle mapping。
- presentation placement/read model，不含 native object。
- content validation probes 和 stable source ids。

Compiler 必须纯化、可重复、稳定排序；同一 definition + seed 产生相同 id、placement 和 schedule signature。

默认 DataPack 只编译一次并缓存为 immutable runtime content；authority、prediction、protocol compatibility、Navigation 与 Three
presentation 都消费该编译结果。三关 static Physics environment 可以在 match 建立时合并，stage-specific member/schedule 仍按 stage
generation 安装，不能退回各端手写一套 course 常量。

## Circuit Forge 资格赛

目标：8 人起跑，前 6 名按 finish/checkpoint/progress 晋级。

空间结构：

1. Start Grid：宽起点、低风险 slope，用于拥堵和基础转向。
2. Conveyor Split：两条不同速度/方向传送带，中间有可推动轻球。
3. Piston Gates：交错活塞门与短安全区，要求观察 phase 而不是盲冲。
4. Sweeper Deck：旋转杆、弹射板和冰面组合，提供高风险捷径。
5. Moving Bridge：左右移动平台与有限 step/jump 路线。
6. Finish Portal：独立 finish sensor 与防止反向刷 checkpoint 的 route order。

资格赛机关不能形成无法恢复的永久封路；required route validator 必须证明每个 schedule window 内存在可完成路径。

## Scrap Yard 道具乱斗

目标：6 人争夺中心积分和道具，前 3 名按存活/objective/KO 排名晋级。

空间结构：

- 中心 Scrap Ring：高价值 item spawn 和 objective sensor。
- 外圈 Conveyor：把角色/道具带向边缘，提供投掷与抢位风险。
- Crusher Lanes：有明确预兆的周期粉碎机，形成短时 cover/危险区。
- Fan Tunnels：方向交替的 wind volume，可放大或抵消投掷轨迹。
- Extending Walls：确定性伸缩墙改变视线和局部路线，不关闭所有安全出口。
- Rolling Prop Chutes：有界生成滚动物体，spawn/lifetime/member count 都受 stage budget 限制。

Stage 后半段扩大 hazard 或缩小安全区，保证 deadline 前收敛；不能仅依赖玩家主动攻击结束。

## Crown Collapse 决赛

目标：3 人中最后存活者获胜。

空间结构：

- 多环形 tile 平台，tile 按 authority schedule warning → unstable → falling → absent。
- 中心/外圈轮换的安全区，防止永久龟缩。
- 单一 rotating sweeper 与间歇 launch pad 提供可读的位移压力。
- 少量高价值 item spawn，respawn 次数有限。

Tile 被移除时必须改变 Physics member/static revision 与 Navigation blocker；视觉坍塌只是表现，不能先于 authority
collision 消失。Stage schedule 需要确保最终只保留有限落脚区域并触发 sudden death。

## 机关目录

| 机关/表面        | Simulation                    | Gameplay 语义                        | Prediction 要求                                |
| ---------------- | ----------------------------- | ------------------------------------ | ---------------------------------------------- |
| Rotating sweeper | deterministic kinematic body  | 推挤/击飞                            | tick schedule 与全岛 replay                    |
| Moving platform  | deterministic kinematic body  | 承载/移动落点                        | motor 继承同 tick platform velocity            |
| Piston gate      | deterministic kinematic body  | 周期阻挡/撞击                        | 有界 travel、warning phase、CCD                |
| Crusher          | kinematic pair + hazard phase | 强 stagger/淘汰风险                  | authority impact；client contact anticipation  |
| Conveyor         | surface/external velocity     | 持续水平移动                         | stable surface id；motor 合成速度              |
| Wind zone        | gameplay volume               | 对 actor/item 施加有限 force/impulse | authority schedule + predicted body command    |
| Launch pad       | sensor + one-shot impulse     | 定向弹射                             | enter ticket 去重；不能 resting 每 tick触发    |
| Extending wall   | kinematic body                | 改变路线/掩体                        | membership/layout revision 与 Nav invalidation |
| Ice/mud          | surface profile               | traction/braking 修改                | controller consumes stable surface definition  |
| Collapsing tile  | staged body/member lifecycle  | 落脚面消失                           | warning fact + authority member revision       |
| Kill volume      | authority gameplay volume     | 提交 elimination                     | 客户端只提示风险，不提交胜负                   |
| Objective/finish | sensor + match rule           | 积分/checkpoint/完成                 | authority ticket 与 route order 去重           |

## Deterministic Hazard Schedule

Schedule 输入只包括 stage seed、stage start tick、hazard definition 和明确 authority control fact。输出包括 phase、target
transform/strength、next transition tick 和 public warning。

- 不读取 wall clock、Renderer time、随机全局状态或客户端帧率。
- 同 tick hazard command 按 stable hazard id/command kind 排序。
- Kinematic target 由绝对 stage tick 计算，不累计浮点 delta 漂移。
- Randomized pattern 从 stage-owned RNG 子流生成，并把公开 seed/version 放入 stage projection。
- Late join 根据当前 phase/start tick 恢复，不从 phase 0 重播。

## Surface 与 Gameplay Volume

Surface 是由 collider/source id 解析的稳定 gameplay profile：friction/traction 仍映射 Physics material，character-specific
braking、jump 或 audiovisual mapping 由 Arena surface definition 提供。

Volume 分为：

- kill/out-of-bounds：authority elimination。
- wind/low-gravity：有限 body command modifier。
- objective/finish/checkpoint：低频 ticket。
- safe/danger zone：match ranking/hazard state。
- item spawn/respawn：内容 placement，不作为持久隐藏 trigger。

高频 overlap 留在 Physics/query system；只有 enter/exit/threshold 等低频事实进入 EventBus/TCA。

## Dynamic Props

轻球、重箱、滚筒和可推动障碍是完整 Physics member：

- 定义 mass/material/damping/CCD、spawn、lifetime/reset 和 collision groups。
- Authority 与所有预测客户端使用同一 member definition 和 initial state。
- 任何能通过链式碰撞影响玩家的 prop 都不能根据 viewport/距离从 island 静默移除。
- Stage reset 使用新 generation 恢复 definition baseline，不把上一 stage velocity 带入。
- Breakable/pooled behavior 需要明确 spawn/despawn generation 和硬容量；不复用旧 body identity。

Joint/pendulum/seesaw 若需要 backend constraint，只能在 Physics 稳定协议、checkpoint 和 conformance 支持后加入。当前内容用
kinematic schedule 或自由 dynamic body 表达，不偷渡 Rapier joint handle。

## Physics、Navigation 与 Presentation 对齐

- Static geometry、Nav source 和 render placement 共享 `placementId/sourceId`。
- Navigation area/profile 必须匹配 actor radius、height、slope 和 clearance；不能让 Nav 允许 Physics 无法通过的通道。
- Dynamic hazard 对 Navigation 使用 blocker/cost/revision，只影响长期路线；最终 timing/avoidance 由 AI steering/Physics 验证。
- Presentation mesh 可以更复杂，但 collision silhouette 与 warning zone 必须可读且不误导。
- Kill/finish/objective volume 在 DevTools 可视化，正式 Renderer 不显示调试 collider。

## Prediction Island Membership

- Static layout 作为 versioned environment 重建。
- 玩家、dynamic prop、released item 和 kinematic obstacle 属于因果 member 集合。
- Sensor/volume 本身如果无 solver body，可以留在 authority gameplay query；其结果仍通过稳定 fact 复制。
- Collapse/spawn/despawn 改变成员时递增 membership revision；同一批原子变化只发布一致 frame。
- Stage generation change 清除旧 member/history/command/effect，并安装该 stage 的完整 active participant + content baseline。
- Stage installation 先以 compiled member id 集合移除上一关 dynamic/kinematic content，再生成当前关成员并把晋级 actor 归零速度后放到
  stable participant spawn；authority 与 client 都从同一绝对 stage tick hazard sampler 生成 patch，不能分别累计局部相位。
- 资格赛 checkpoint 只按 `routeOrder` 单调推进；达到全部 checkpoint 后进入 finish volume 才算完成。完成数达到 qualification count
  时 Stage Rule 可以提前结算，deadline 继续作为断路或玩家停滞时的确定性后备。

## 内容校验

每个 Course Definition 必须通过：

- id/version/placement 唯一与引用完整性。
- spawn capsule clearance、camera 起始视线和 required content。
- required start→checkpoint→finish route，profile radius/height/slope 兼容。
- Hazard 在任意 schedule phase 不永久封死所有 required route，除非 stage rule 明确进入 sudden death。
- Kill volume、safe zone、finish/objective、item spawn 不重叠非法区域。
- Kinematic travel bounds、速度、impulse、member/lifetime 上限。
- Item respawn clearance 与离 active participant/hazard 的安全 policy。
- Stage 可以在 deadline 内强制收敛，不依赖 bot/玩家自发合作。
- Authority/client compiler 的 layout/member/schedule signature 一致。

## 诊断

Course/Stage diagnostics 至少公开 definition version、seed、active hazards/phases、member counts、surface/volume tickets、Nav
revision、validator result、forced-convergence state 和 schedule signature。工具可以查看 placement 与 collider/Nav 对齐，但
不能依赖 backend native handle 成为长期内容事实。
