# Outpost Siege 关卡、遭遇与经济

## Frontier 07 空间目标

关卡必须支持三种持续决策：守哪条路线、把共享资源花在哪里、何时离开安全位置救援或处理特殊目标。场景不能只是大背景图上随机摆放敌人。

## 区域结构

| 区域             | 玩法职责                                         |
| ---------------- | ------------------------------------------------ |
| 中央核心区       | 主要失败目标、复归点、最终密钥掉落与四向转移枢纽 |
| 北/东/南/西入口  | 独立 spawn gate、预告灯与初始 route segment      |
| 外环通道         | 玩家与敌人跨路线转移；避免所有移动都穿过核心     |
| 两个供能节点     | 可失守支线目标；影响资源和设施效率               |
| Hardpoint        | Auto Turret / Shock Pylon 固定部署插槽           |
| Barricade Socket | 只允许路障部署，改变 route cost 但保留替代路线   |
| 撤离平台         | 首领后暴露的终局防守区，迫使玩家离开中央静态阵地 |

核心四周必须留有环绕空间和至少两条进入路径。任何装饰、设施或 collider 都不能把玩家压入死角；竖屏 viewport 下仍能从核心看到至少一个有效转移方向。

## Arena 单一事实源

每个 scene instance 描述：

```txt
id
transform / footprint
render reference
physics collider reference
navigation blocker/portal reference
cover/slot/interaction tags
```

Floor 资源只包含地面、标线和无碰撞装饰。墙、掩体、立柱、设施底座与 gate 是独立对象。Render、Physics 和 Navigation 从相同 instance 派生，内容测试逐 instance 比较 transform、rotation、footprint 与 source id。

Static collider 可以批到少量 Physics body，但保留独立 collider id。Navigation graph/blocker 使用同一 source instance，不从 collider handle 或背景像素逆向生成。

## 核心与供能节点

### 中继核心

- 基础耐久 1,000，不自然恢复。
- 只有敌对 Combat relationship 能造成伤害。
- 75%、50%、25%、10% 阈值发出递进 cue；相同阈值每个 match instance 只触发一次。
- 整备阶段可以消耗 Supply 修复；战斗中只能由 Repair Drone 或特定 protocol 有限修复。
- 耐久为 0 触发 `core-destroyed`，停止新攻击提交并进入失败结算。

### 供能节点

- 两个节点各自有耐久、在线/受损/离线状态。
- 存活节点提高整备 Supply 奖励与设施效率；失守不会立即失败。
- Saboteur 可以 channel disable，玩家可通过击退/控制中断。
- 节点在整备阶段可用 Supply 修复，完全离线的节点不能在战斗中瞬时恢复。

## Shared Supply

Supply 是 authority-owned 队伍资源：

### 获得

- 普通/精英敌人击杀结算。
- 波次完成固定奖励。
- 供能节点存活奖励。
- 特定 Squad Protocol 或拆解退款。

### 消费

- 部署设施。
- 修复核心、节点或设施。
- 失能玩家在整备阶段复归。
- 特定一次性补给交互。

普通掉落自动归入共享池或生成明确共享 pickup；不会按“谁先碰到”归个人。每笔变更记录 reason、amount、previous/next、source、phase instance 与 correlation，防止重复 wave reward。

## 防御设施

| 设施        | Supply | 容量 | 作用                                        | 反制                    |
| ----------- | ------ | ---- | ------------------------------------------- | ----------------------- |
| Auto Turret | 30     | 2    | 稳定 Kinetic 单体输出；按威胁/射线选择目标  | Saboteur 干扰、转火延迟 |
| Shock Pylon | 25     | 2    | 周期 chain slow/shocked，制造 Overload 连携 | 单体伤害低、可被破坏    |
| Barricade   | 20     | 1    | 延迟路线并保护救援/换弹位                   | Brute 快速破坏          |

队伍默认 8 点设施容量。价格、容量和属性是数据，不写入 UI 或 executor 常量。

### 部署流程

```txt
select buildable
  -> choose compatible socket
  -> local preview
  -> authority action
  -> phase/range/socket/resource/capacity/path validation
  -> GAS deploy execution commit
  -> spend Supply
  -> materialize World + Physics + GAS + AI target + presentation
```

自由光标用于选择插槽和方向，但设施只能落在作者定义 socket。Preview 显示合法/非法轮廓与短原因。Authority rejection 立即清理 ghost，不留下本地 collider 或资源扣除。

Path validation 确认所有 required spawn gate 至核心仍至少有一条合法路线。Barricade 改变 edge/blocker revision；其他设施通常不封路。

### 修复、迁移与拆解

- 整备阶段持续交互消耗 10 Supply 修复 100 耐久。
- 每个设施在整备阶段允许一次无成本迁移到兼容空插槽，移动过程由 authority 原子完成。
- 整备阶段拆解返还 50%；战斗中不允许拆解退款。
- 正在被敌人攻击、destroyed 或执行能力的设施不能迁移。
- Destroy 时释放容量、socket、AI target、Physics body 与 animation/audio loop。

## Encounter Definition

每个 encounter 模板包含：

- id、phase、seed policy。
- active gates 与 spawn timeline。
- threat budget、最大同时存活、每 archetype 限制。
- player-count scale curve。
- required/optional objective。
- director event、music/cue、completion 与 fail-safe policy。

Spawn timeline 使用绝对 phase offset + 条件 gate，不由客户端倒计时驱动。Seed 只影响声明过的 gate/组合/时间窗选择，不能改变必教机制或产生不可复现随机波次。

## 人数缩放

| 活跃玩家 | 常规威胁预算倍率 | 首领生命倍率 | Supply 奖励倍率 |
| -------- | ---------------- | ------------ | --------------- |
| 1        | 1.00             | 1.00         | 1.00            |
| 2        | 1.65             | 1.35         | 1.35            |
| 3        | 2.25             | 1.65         | 1.60            |
| 4        | 2.75             | 1.90         | 1.85            |

缩放优先增加路线重叠、敌人构成、精英频率和同时决策压力；普通敌人生命只做小幅调整。Supply 不与威胁线性增加，保证多人需要协调但不会因设施固定价格断档。

Active player 变化只影响尚未 materialize 的 spawn budget 与下一阶段奖励。已生成敌人不因断线消失，boss 当前生命不按人数变化瞬间缩放。

## Wave 1：突破

目的：教会射击、冲刺、入口、核心与第一项设施价值。

- 先从单一路线生成 Raider，再加入第二路线。
- 中段加入少量 Gunner，给出第一条远程攻击预兆。
- 不包含 Saboteur、Brute 或节点支线。
- Director 保持至少一段可恢复窗口，不连续从四门压满。
- 完成奖励足以修复一次并部署至少一个基础设施。

## Wave 2：围攻

目的：要求分路、标记、救援和设施保护。

- 三条路线交错激活。
- Saboteur 明确指向一个供能节点或设施。
- 一只 Brute 从有路障/狭窄通道的路线进入。
- Gunner 与 Raider 形成远近压力，但同一时间致命 telegraph 数量有上限。
- 节点存活提供 Supply 与设施效率奖励；失守继续游戏并记录结果。

## Boss Wave：Overseer

### Phase 1：封锁（100%–70%）

- Overseer 从远端 gate 进入，不能出现在核心旁。
- 使用扇形扫射、移动封锁和有限 Raider 增援。
- 玩家学习首领 telegraph、weak window 和 arena 转移。

### Phase 2：断能（70%–35%）

- 首领连接一个有效供能节点并获得减伤。
- 玩家可以攻击 channel anchor、控制首领或在减伤下持续输出。
- 若节点均失效，使用有明确持续时间和破盾方式的替代 barrier。
- UI 与 world marker 同时显示连接目标、减伤和打断进度。

### Phase 3：攻城（35%–0%）

- 首领提高核心目标优先级并沿可读路线推进。
- Core Slam 使用至少 1.2 秒地面 telegraph，命中核心造成高压但非满血秒杀。
- 召唤有限 Saboteur，避免普通增援盖住首领机制。
- 首领死亡先停止危险 ability，再结算密钥和撤离 transition。

Boss phase change 由 authority health threshold + TCA once rule 触发。AI 执行 phase task，Animator/Audio/UI 只表现结果。

## 撤离 Encounter

Overseer 掉落控制密钥。任意存活玩家拾取并在平台交互启动 45–60 秒信标：

- 最终压力使用固定上限的 Raider/Gunner，不再生成 Brute 或 boss。
- 信标进度由 authority 持有；所有可行动成员在区域内会加速最后部分。
- 单个未进入、断线或失能成员不能永久阻塞。
- 平台、核心和入口之间保留移动路线，不能形成只站在圆里等待的无操作阶段。

## Squad Protocol

候选池示例：

- Overcharged Munitions：连续命中同目标提高短时 Kinetic 输出。
- Emergency Shielding：救起和核心低耐久时提供短时屏障。
- Efficient Fabrication：首次部署每种设施降低 Supply。
- Field Medicine：缩短救援并提高救起 health。
- Static Network：降低 Overload 每目标 cooldown。
- Salvage Protocol：按波次结束时存活设施返还少量 Supply。

Protocol 使用 GAS effect、attribute modifier、tag 或 app rule policy，不通过 ability id switch 注入。候选生成确保不提供对当前 loadout/关卡完全无效的选项。

## Director 安全规则

- Gate spawn 前显示方向、声音和最短预兆。
- Spawn point 与玩家/危险区保持安全距离。
- Alive、pending、projectile 和 director queue 都有硬上限。
- 同时 active 的高威胁 telegraph 有 encounter budget。
- 无路径、stuck、invalid target 和 lifecycle leak 具有 recovery 与 trace。
- Fail-safe 只处理系统异常，不能在正常困难局势中替玩家杀敌。

## 内容验证

构建期与自动化必须验证：

- 所有入口到核心/设施/撤离区的 required path。
- 每种 agent profile 的走廊宽度与 projection。
- 每个 socket 的 render/physics/navigation 对齐和 compatible buildable。
- 每波 threat budget、archetype limit、spawn upper bound 与 completion condition。
- Boss phase 在节点全部存活/全部失效两种情况下都有合法路径。
- Supply 最差基线不会因必需消费产生无法继续的 soft lock。
- 单人和四人固定 seed 可以完成相同 phase state machine。
