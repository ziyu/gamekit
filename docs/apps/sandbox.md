# Sandbox 设计

本文档负责 `apps/sandbox` 的长期演示设计。Sandbox 不是模块设计文档，也不是阶段状态文档；它描述这个验证面应该如何呈现 GameKit 各模块的协作关系。

阶段计划、当前实现状态和完成定义放在 `../development-stages.md`。单个模块协议放在 `../modules/`。不要把本文档内容复制到模块文档或阶段文档中。

## 定位

Sandbox 是 GameKit 的框架验证面，用来证明 App Host、Data、Asset、Renderer、Input、Camera、TCA、GAS、EventBus、World 和 GameRuntime 能在一个可观察、可交互的场景里协同工作。

Sandbox 不是长期玩法仓库，也不是 DevTools 的替代品。它可以像一个小 demo 游戏一样运行，但其目标是解释框架能力，而不是沉淀一套真实游戏内容生产线。

## 演示游戏：Signal Outpost

Sandbox 的主场景采用一个自动运行、可交互的放置式 demo：`Signal Outpost`。

玩家观察一个信号前哨基地自动生产、运输和防御 signal。系统会自动 tick，玩家也可以选择对象、触发能力、移动镜头和观察跨模块链路。

`Signal Outpost` 不是一张架构示意图。它必须像一个小型 demo 游戏一样成立：场景中有生产目标、空间布局、自动工人、压力来源、成长反馈和玩家干预。Inspector 和 Timeline 负责解释，但主舞台本身必须能让人看懂“基地正在做什么、哪里出了问题、玩家操作改变了什么”。

长期体验目标：

- 无输入时，场景也会自动推进，能看到资源生产、运输、消耗、威胁和修复。
- 有输入时，玩家可以通过选择、切换模式、调整优先级和触发能力影响自动循环。
- 关键模块能力必须在舞台上有结果，而不是只在日志里出现。
- 每个主要对象都必须有独特职责、轮廓、状态层和反馈，不用同质移动点代表复杂系统。

核心场景元素：

- `Command Core`：基地中心，汇聚 signal，展示任务进度和全局稳定度。
- `Relay Tower`：信号塔，周期性产出 signal，并通过 beam 连接到 Command Core。
- `Scout`：可移动 actor，在节点之间巡逻、搬运 signal、修复设施或执行攻击。
- `Data Node`：代表 DataRegistry 中的 gameplay definition，可被规则和能力引用。
- `Asset Fabricator`：代表 AssetManager 加载状态，资源加载成功后点亮对应视觉层。
- `Interference Node`：干扰源，周期性攻击 signal network，引发 damage、tag、effect 和 cue。
- `Signal Link`：场景中的可视化连接线，用于表现数据流、资源流和能力影响范围。

## 场景结构

主舞台采用固定空间语义，而不是随机散点：

- 中央：`Command Core`，所有 objective、全局稳定度和最终 signal 汇聚点。
- 左上：`Signal Field`，放置多个 Relay Tower，是 signal 主要生产区。
- 右上：`Fabrication Bay`，放置 Asset Fabricator，用于把 signal 转换为 module fragment、视觉层和资源状态。
- 左下：`Archive Wing`，放置 Data Node，用于解锁 rule、ability、recipe 和 station 升级。
- 右下：`Interference Rift`，放置 Interference Node 和威胁范围，是压力来源。
- 中央通路：Scout 路线、Signal Link、beam flow 和任务路径必须可见。

Camera 默认能看见完整 outpost。玩家选择某个对象时，Camera 可以聚焦但不应遮蔽全局状态。

## 自动放置循环

`Signal Outpost` 的核心循环由四层组成。

### 生产层

Relay Tower 周期性生成 signal，Signal Link 把 signal 推向 Command Core。Asset Fabricator 可以消耗 signal 生成 module fragment，Data Node 可以消耗 module fragment 解锁数据定义。Command Core 消耗 signal 推进 objective。

生产层至少包含这些状态：

- station storage / capacity。
- production rate / cooldown。
- stability / heat / throughput。
- link flow / contamination / disconnected。
- objective phase / progress。

### 调度层

Scout 是自动工人，也是 GAS actor。Scout 根据 station priority 和当前威胁自动领取任务：

- `collect`：从 Relay Tower 或 Field 收集 signal。
- `deliver`：把 signal 送到 Command Core、Data Node 或 Fabricator。
- `repair`：修复低 stability 的 station 或 link。
- `suppress`：攻击 Interference Node 或清理 interference mark。
- `scan`：扫描 Data Node 或威胁源，触发 data/rule 可视反馈。

Scout 至少要有 cargo、battery、fatigue、current order、target station 和 route progress。任务路径应在舞台上可见。

### 压力层

Interference Node 会周期性产生压力。压力不能只是扣血数字，它应改变生产、路径和表现：

- signal storm：污染 link，降低流量。
- data corruption：让 Data Node 的解锁进度倒退或触发修复规则。
- tower overload：让 Relay Tower heat 上升，稳定度下降。
- scout jammed：让 Scout 获得 tag/effect，移动或工作效率下降。
- core instability：让 objective 进度被暂停或变慢。

压力事件进入 EventBus，TCA 决定是否触发自动响应，GAS 执行 effect，Renderer 展示预警和结果。

### 成长层

Sandbox 需要展示 Data 和 Asset 的价值，而不是只展示它们的注册数量。

长期成长反馈：

- Data Node 解锁新的 TCA rule、GAS ability、production recipe 或 station mode。
- Asset Fabricator 解锁新的 render layer、状态灯、beam skin 或 cue effect。
- Scout / station 的 GAS ability 可以升级，并改变舞台上的行动方式。
- Objective 分阶段推进，每个阶段解锁新的自动化或压力类型。

成长层仍是 Sandbox 内部 demo 逻辑；不要把具体玩法概念上推到核心包。

## 主舞台表达原则

主舞台必须承担模块协作表达，不允许只把信息放进 Inspector 或 Timeline。

长期要求：

- 主要对象必须有明确角色、状态和行为，不使用一组同质小球代表全部实体。
- 每类对象必须使用不同的复合 RenderObject，包含多层节点、状态环、指示器或 beam。
- 关键状态变化必须有场景内表现，例如 signal 增长、能量消耗、受击、修复、过载、冷却。
- Input、TCA、GAS、Data、Asset、Renderer、World 的协作必须在舞台上能被感知，再由 Inspector 和 Timeline 补充解释。
- 舞台上必须有路线、流向、任务状态和威胁区域，避免对象只在原地闪烁或简单漂移。
- 复合 RenderObject 应表达“结构”和“状态”：基础形体、状态环、任务 glyph、资源条、受击层、cue 层分开更新。
- Sandbox game module 不直接依赖 Phaser、Koota 或 DOM；具体后端仍通过 adapter 和 App Host 注入。

## 玩家操作语义

Sandbox 的操作应服务于验证模块协作，而不是追求复杂操作量。

长期输入语义：

- 点击主舞台对象或用键盘切换选中 station / scout / threat，Inspector 应立即围绕该对象刷新。
- `confirm` 对选中对象执行主操作，例如 overcharge、repair、suppress 或 scan。
- `mode.1` / `mode.2` / `mode.3` 切换 outpost 策略：`stabilize`、`boost`、`suppress`。
- `priority.next` / `priority.previous` 调整选中 station 的工作优先级。
- Camera pan / zoom / focus / follow 只在 game viewport scope 下生效。缩放操作必须以归一化后的 renderer viewport 坐标作为 anchor，保证用户指向的位置在缩放前后保持稳定。
- 暂停或单步 tick 用于观察 timeline，但不改变模块边界。

输入必须先归一化为 action，再由 Sandbox game module 或标准模块消费。Renderer 不接收 raw input。

## 模块映射

### App Host

App Host 负责启动 Platform、Data、Asset、Renderer、Input 和 GameRuntime 等应用服务。Sandbox 主舞台可以显示服务健康状态，但 gameplay 规则不应依赖 Host 内部实现。

### Data

场景布局、station、actor、ability、effect、objective、production recipe、threat profile、render rig 和 asset reference 都应来自 DataPack。

Data Node 在舞台中可视化数据驱动能力：当规则或能力引用某个 definition 时，相关节点可以短暂高亮，帮助观察数据如何影响运行时。

Sandbox DataPack 至少覆盖这些类型的复杂数据：

- station definition：role、capacity、base production、supported task、render rig、asset references。
- scout definition：actor definition、cargo、battery、available work kinds、ability loadout。
- production recipe：input/output、duration、required station、unlock condition。
- objective phase：required signal、required unlock、reward、next pressure profile。
- threat profile：event cadence、target selector、effect/cue、counter action。
- route/link definition：from/to、capacity、visual flow style、failure state。

### Asset

Asset Fabricator 代表资源声明和加载状态。资源成功加载后，相关 RenderObject 的纹理、颜色层或状态灯应在场景中生效。Asset 加载失败时，舞台应显示降级表现，而不是静默失败。

### World

Command Core、Relay Tower、Scout、Interference Node、Data Node 和 Signal Link 都应对应 world entity 或可追踪的 world runtime state。

Sandbox 可定义本地组件，例如：

- `SceneRole`
- `Selectable`
- `ProductionState`
- `SignalStorage`
- `WorkAssignment`
- `ThreatState`
- `LinkState`
- `RenderPresentation`

这些组件只服务 Sandbox 验证，不进入核心包。

### Renderer

Renderer 负责把 world state 和 presentation data 映射为复杂 RenderObject。

主舞台至少需要这些表现：

- Command Core：多层环、进度光带、稳定度状态。
- Relay Tower：信号柱、充能条、到核心的 beam。
- Scout：有方向、任务状态和携带 signal 的视觉变化。
- Interference Node：干扰范围、攻击预警、受击反馈。
- Signal Link：流动脉冲、断连、增强或污染状态。

Renderer Core 仍只暴露通用 RenderObject / RenderNode / RenderCommand 协议；Sandbox 不应重新引入 sprite-first API。

### Input

Sandbox 输入必须受 scope 管理。Gameplay 和 Camera 输入只在 game viewport scope 下生效，Inspector、Timeline、文本输入或未来 DevTools 区域不应误触发游戏操作。

首轮交互语义：

- 选择对象。
- 切换选中对象。
- 对选中对象触发 confirm ability。
- Camera pan / zoom。

### Camera

Camera 默认显示整个 outpost。玩家可以手动 pan / zoom，也可以让 camera 跟随选中对象或聚焦 Command Core。

Camera 是 GameModule toolkit 能力，不作为 App Host 标准服务。Renderer camera adapter 只负责同步 camera state。

Inspector 可以向标准 camera module 发出 follow/free 请求，但 follow target 的位置解析来自 Sandbox snapshot / scene context，不进入 App Host service。这样 UI 可以方便操作镜头，同时保持 Camera Core、Renderer Adapter 和 Host service 的边界清晰。

### TCA

TCA 处理低频、可解释的规则触发，不负责高频移动或渲染动画。

典型规则：

- signal 达到阈值时推进 objective。
- Interference Node 攻击后触发自动修复或警报。
- Relay Tower 低稳定度时触发保护规则。
- 玩家 confirm 后触发 overcharge 链路。
- Data/Asset 状态变化后触发场景提示。

每条规则必须能在 Timeline 中解释 trigger、condition 和 action。

Sandbox 中的 TCA 应体现“自动化规则”的价值，例如：

- signal storage 满时自动派 scout deliver。
- tower heat 过高时自动切换到 stabilize 或触发 repair。
- data unlock 完成时注册新的 rule/ability/recipe 可见状态。
- interference storm 发生时根据当前 mode 决定 repair、suppress 或 protect core。
- 玩家 confirm 后，根据选中对象类型分派不同能力。

### GAS

GAS 表达 actor 能力、属性、tag、effect 和 cue。Scout 和关键 station 都可以是 GAS actor。

典型属性：

- `health`
- `energy`
- `signal`
- `stability`
- `throughput`

典型能力：

- `signal_strike`
- `overcharge_relay`
- `field_repair`
- `stabilize_core`

典型 effect：

- signal boost
- interference mark
- energy drain
- repair over time
- overcharged

GAS 热状态应尽量落在 world component 上，保留数据驱动配置优势，同时利用 ECS 查询性能。

Sandbox 中 GAS 不只用于战斗，也用于 station、worker 和系统状态：

- Scout 的 energy、cargo efficiency、jammed、repairing。
- Relay Tower 的 stability、heat、overcharged。
- Command Core 的 integrity、signal focus、objective boost。
- Interference Node 的 shield、pressure、suppressed。
- Link 的 contaminated、reinforced、flow boost。

### EventBus

EventBus 只承载低频事实，例如 input action、rule fired、ability activated、effect applied、asset loaded、renderer diagnostic、objective milestone。

高频位置、动画和每帧表现不通过 EventBus。

## Workbench UI

Sandbox UI 由三块组成：

- 主舞台：承载 Signal Outpost 的运行、交互和主要视觉反馈。
- Inspector：展示选中对象的 world、render、data、asset、TCA/GAS 关联状态。
- Timeline：按时间合并 EventBus、TCA trace、GAS trace 和 renderer diagnostic，解释“输入 → 规则 → 能力 → 效果 → 表现”的链路。

UI 只消费 snapshot 和低频状态，不把 UI 选择态写入 GameRuntime 或 App Host service。

Inspector 应围绕“当前选中对象”组织，而不是围绕模块平铺：

- Actor / Station：当前 entity、role、任务、存储、GAS 状态。
- Runtime：相关系统、tick、module summary、host service 状态。
- Content：引用到的 Data documents、assets、render rig、recipe。
- Rules：最近命中的 TCA rules、失败 condition、产生的 actions。
- Effects：GAS ability/effect/cue、持续时间和属性变化。

Timeline 应突出链路而不是普通日志堆积。一次玩家 confirm 或一次 interference storm 应能串起 input、event、TCA、GAS、world state、renderer cue。

## Snapshot 要求

Sandbox snapshot 应能支持 headless 测试和 UI 渲染。

长期快照信息包括：

- selected object / actor / entity。
- objective progress 和 status。
- scene entities、roles、position、task、storage、link。
- GAS actor state、attributes、tags、effects。
- DataPack、DataKind、document、reference summary。
- Asset registered / loaded / failed summary。
- module summary 和 host service summary。
- timeline entries。

## 设计约束

- Sandbox 可以使用复杂本地数据和本地组件，但不能把演示专用概念上推到核心包。
- Sandbox 不能成为真实游戏逻辑仓库；当某个能力证明通用后，再提炼到对应模块。
- 舞台表达优先于面板堆叠；Inspector 和 Timeline 是解释层，不是主表达层。
- 任何新第三方库仍必须通过 adapter 或 app 层接入。
- 固定 seed 下的自动循环必须可测试、可复现。
