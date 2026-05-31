# Sandbox 设计

本文档负责 `apps/sandbox` 的长期演示设计。Sandbox 不是模块设计文档，也不是阶段状态文档；它描述这个验证面应该如何呈现 GameKit 各模块的协作关系。

MVP 完成范围和常态开发入口放在 `../development-stages.md`。具体 Sandbox 工作流状态放在任务系统、PR 或 `../implementation/`。单个模块协议放在 `../modules/`。不要把本文档内容复制到模块文档或执行记录中。

## 定位

Sandbox 是 GameKit 的框架验证面，用来证明 App Host、Data、Asset、Renderer、Input、Camera、TCA、GAS、EventBus、World 和 GameRuntime 能在一个可观察、可交互的场景里协同工作。

Sandbox 不是长期玩法仓库，也不是 DevTools 的替代品。它可以像一个小 demo 游戏一样运行，但其目标是解释框架能力，而不是沉淀一套真实游戏内容生产线。

Sandbox 的演示设计必须优先易懂：基础概念应该像普通小型游戏一样直觉，机制可以足够复杂，用来承载框架模块协作。不要用架构隐喻替代游戏对象；玩家不应该先理解 GameKit 才能看懂场景。

## 演示游戏：Tiny Camp

Sandbox 的主场景采用一个自动运行、可交互的放置式营地 demo：`Tiny Camp`。

核心一句话：一群工人在营地里自动采集资源、搬运物资、建造设施、维修建筑、防御怪物；玩家可以选择单位或建筑，调整优先级，触发技能，观察系统如何协同。

基础概念必须足够直接：

- `Campfire`：营地核心，代表主要目标和失败风险。
- `Worker`：工人，自动采集、搬运、维修、建造或支援战斗。
- `Lumber Camp` / `Quarry` / `Berry Patch`：资源点，产出 wood、stone、food。
- `Storage`：仓库，接收和分发资源。
- `Workshop`：工坊，消耗资源制造升级、工具或防御设施。
- `Tower`：防御塔，自动攻击靠近的怪物。
- `Monster`：敌人，从边缘波次进入营地并攻击建筑或工人。
- `Road` / `Task Path`：工人路线、资源流向和任务意图。

长期体验目标：

- 无输入时，营地也会自动推进：采集、搬运、建造、防御、受损、维修和升级持续发生。
- 有输入时，玩家可以选择对象、切换营地策略、调整优先级、触发能力或让镜头跟随某个单位。
- 关键模块能力必须在舞台上有结果，而不是只在日志里出现。
- 每类对象必须有独特职责、轮廓、状态层和反馈，不用同质移动点代表复杂系统。

## 场景结构

主舞台采用普通玩家能理解的营地布局：

- 中央：`Campfire` 和少量初始建筑，显示营地生命、当前目标和全局状态。
- 左侧：`Forest`，放置 Lumber Camp 和树木资源。
- 右侧：`Quarry`，放置石料资源和较慢的重型采集任务。
- 下方：`Berry Patch` / `Farm Plot`，提供食物和恢复相关资源。
- 上方：`Workshop` 和 `Storage`，承载制造、升级和资源汇聚。
- 边缘道路：`Monster Path`，怪物从边缘进入，沿道路接近营地。
- 防御线：`Tower`、障碍、工人维修路线和战斗范围必须可见。

Camera 默认能看见完整营地。玩家选择某个对象时，Camera 可以聚焦或跟随，但不应遮蔽全局状态。

## 自动放置循环

`Tiny Camp` 的核心循环由五层组成。

### 资源层

资源点周期性产出或提供可采集资源。Worker 根据任务把资源从资源点搬到 Storage 或 Workshop。

资源层至少包含这些状态：

- resource type / amount / replenish progress。
- worker cargo / capacity。
- storage amount / capacity。
- task reservation，避免所有工人挤到同一个资源点。
- route progress 和资源流向表现。

### 建造层

Workshop 和 Campfire 根据资源解锁建造或升级。建筑不是瞬间出现，而是有 construction progress、material delivered、worker assignment 和完成反馈。

建造层至少包含这些对象：

- building blueprint。
- construction site。
- material requirement。
- build progress。
- unlock requirement。

### 调度层

Worker 是自动工人，也是 GAS actor。Worker 根据营地策略、建筑优先级和当前威胁领取任务：

- `gather`：从资源点采集资源。
- `haul`：把资源送到 Storage、Workshop 或 construction site。
- `build`：建造新设施。
- `repair`：修复受损建筑或防御塔。
- `defend`：支援 Tower、引开或攻击 Monster。
- `rescue`：帮助低生命或被减速的工人。

Worker 至少要有 health、stamina、cargo、tool、current task、target、route progress。任务路径应在舞台上可见。

### 压力层

Monster wave 会周期性施加压力。压力不能只是扣血数字，它应改变生产、路径和表现：

- monster attack：攻击 Campfire、Tower、Storage 或 Worker。
- fire / poison / slow：通过 GAS effect 影响建筑或单位。
- blocked road：迫使 Worker 绕路，降低运输效率。
- damaged tower：防御范围下降，需要维修。
- panic：低生命 Worker 自动撤退或等待救援。

压力事件进入 EventBus，TCA 决定是否触发自动响应，GAS 执行 ability/effect，Renderer 展示预警和结果。

### 成长层

Sandbox 需要展示 Data 和 Asset 的价值，而不是只展示它们的注册数量。

长期成长反馈：

- Workshop 解锁新的 recipe、building blueprint、tool、worker role 或 tower upgrade。
- Campfire 目标阶段推进后解锁新的资源点、怪物波次或自动化规则。
- Asset 加载成功后改变建筑外观、工人工具、怪物外观、攻击特效或 UI 图标。
- Data entry 被解锁或引用时，Inspector 能说明它来自哪个 pack、被哪些对象使用。

成长层仍是 Sandbox 内部 demo 逻辑；不要把具体玩法概念上推到核心包。

## 主舞台表达原则

主舞台必须承担模块协作表达，不允许只把信息放进 Inspector 或 Timeline。

长期要求：

- 主要对象必须有明确角色、状态和行为，不使用一组同质小球代表全部实体。
- 每类对象必须使用不同的复合 RenderObject，包含多层节点、状态条、任务标记、范围、路线或特效。
- 关键状态变化必须有场景内表现，例如资源增长、搬运、建造进度、受击、维修、燃烧、冷却、升级完成。
- Input、TCA、GAS、Data、Asset、Renderer、World 的协作必须在舞台上能被感知，再由 Inspector 和 Timeline 补充解释。
- 舞台上必须有路线、流向、任务状态和威胁区域，避免对象只在原地闪烁或简单漂移。
- 复合 RenderObject 应表达“结构”和“状态”：基础形体、状态条、任务 glyph、资源携带层、受击层、cue 层分开更新。
- Sandbox game module 不直接依赖 Phaser、Koota 或 DOM；具体后端仍通过 Driver、Adapter 和 App Host 注入。

## 玩家操作语义

Sandbox 的操作应服务于验证模块协作，而不是追求复杂操作量。

长期输入语义：

- `scene.click` 由主舞台点击产生：命中对象时选中 worker / building / resource / monster 并刷新 Inspector，命中空白时取消选中。该语义应通过 game viewport scope 的 Input adapter 产生，并在 click/release 语义上结算。
- 用键盘切换选中对象时，Inspector 应立即围绕该对象刷新。
- `confirm` 对选中对象执行主操作，例如 boost worker、repair building、prioritize construction、focus tower fire。
- `mode.1` / `mode.2` / `mode.3` 切换营地策略：`gather`、`build`、`defend`。
- `priority.next` / `priority.previous` 调整选中建筑、资源点或 construction site 的工作优先级。
- Camera pan / zoom / focus / follow 只在 game viewport scope 下生效。缩放操作必须以归一化后的 renderer viewport 坐标作为 anchor，保证用户指向的位置在缩放前后保持稳定。
- 暂停或单步 tick 用于观察 timeline，但不改变模块边界。

输入必须先归一化为 action，再由 Sandbox game module、标准模块或 app UI bridge 消费。Renderer 不接收 raw input，主舞台点选也不直接绕过 Input 模块监听 canvas。

## 模块映射

### App Host

App Host 负责启动 Platform、Data、Asset、Driver、Renderer、Input、UI 和 GameRuntime 等应用服务。Sandbox 主舞台可以显示服务健康状态，但 gameplay 规则不应依赖 Host 内部实现。

### Data

场景布局、worker、building、resource、recipe、monster wave、ability、effect、render rig 和 asset reference 都应来自 DataPack。

Sandbox 内容文件应按 Tiny Camp 的真实业务概念组织，而不是按全局数据类型拆成 actors、rules、assets、renderObjects 等大表。每个业务文件可以混合多种 DataType，只要进入 DataRegistry 的条目有明确 `type` 和 `id`。

Sandbox DataPack 至少覆盖这些复杂数据：

- worker definition：role、base stats、cargo capacity、tool、ability loadout、render rig、asset references。
- building definition：category、health、storage、work slots、supported tasks、upgrade chain、render rig。
- resource node definition：resource type、yield、replenish cadence、harvest requirement。
- recipe definition：input/output、duration、required building、unlock condition。
- monster definition：stats、behavior、attack ability、drop table、render rig。
- wave definition：spawn cadence、composition、target selector、reward。
- objective phase：required buildings、required resources、survival time、reward。
- route/layout definition：position、road links、spawn edge、defense zone、visual style。

### Asset

Assets 负责资源声明和加载状态。资源成功加载后，相关 RenderObject 的纹理、颜色层、状态灯、技能图标或 cue effect 应在场景中生效。Asset 加载失败时，舞台应显示降级表现，而不是静默失败。

### World

Campfire、Worker、Resource Node、Storage、Workshop、Tower、Monster 和 Road/Task Path 都应对应 world entity 或可追踪的 world runtime state。

Sandbox 可定义本地组件，例如：

- `SceneObject`
- `Selectable`
- `ResourceStorage`
- `ProductionState`
- `ConstructionState`
- `WorkAssignment`
- `ThreatState`
- `CombatState`
- `RouteState`
- `RenderPresentation`

这些组件只服务 Sandbox 验证，不进入核心包。

### Renderer

Renderer 负责把 world state 和 presentation data 映射为复杂 RenderObject。

主舞台至少需要这些表现：

- Campfire：生命、目标阶段、营地范围、受击或升级状态。
- Worker：方向、任务图标、携带资源、体力、受伤或 buff/debuff。
- Resource Node：剩余资源、采集进度、再生状态。
- Storage / Workshop：库存、制造进度、缺料提示、升级状态。
- Tower：攻击范围、冷却、目标锁定、受损或维修状态。
- Monster：路径、生命、攻击预警、状态效果。
- Road / Task Path：移动路线、资源流向、阻塞或危险状态。

Renderer Core 仍只暴露通用 RenderObject / RenderNode / RenderCommand 协议；Sandbox 不应重新引入 sprite-first API。

### Input

Sandbox 输入必须受 scope 管理。Gameplay 和 Camera 输入只在 game viewport scope 下生效，Inspector、Timeline、文本输入或未来 DevTools 区域不应误触发游戏操作。

基础交互语义：

- 通过 `scene.click` 选择对象或点击空白取消选中。
- 切换选中对象。
- 对选中对象触发 confirm ability。
- 切换营地策略和调整任务优先级。
- Camera pan / zoom / follow。

### Camera

Camera 默认显示整个营地。玩家可以手动 pan / zoom，也可以让 camera 跟随选中 Worker、聚焦 Campfire 或查看怪物波次入口。

Camera 是 GameModule toolkit 能力，不作为 App Host 标准服务。Renderer camera adapter 只负责同步 camera state。

Inspector 可以向标准 camera module 发出 follow/free 请求，但 follow target 的位置解析来自 Sandbox snapshot / scene context，不进入 App Host service。这样 UI 可以方便操作镜头，同时保持 Camera Core、Renderer Adapter 和 Host service 的边界清晰。

### TCA

TCA 处理低频、可解释的规则触发，不负责高频移动或渲染动画。

典型规则：

- storage 接近满时触发建造或搬运调整。
- building 低生命时触发 repair task。
- monster wave 开始时切换防御提示或派 Worker 支援。
- tower 被攻击时触发 warning、repair 或 focus fire。
- 玩家 confirm 后根据选中对象触发 boost、repair、build priority 或 attack focus。
- recipe 完成后触发 unlock、asset cue 或 objective milestone。

每条规则必须能在 Timeline 中解释 trigger、condition 和 action。

### GAS

GAS 表达 actor 能力、属性、tag、effect 和 cue。Worker、Building、Tower、Monster 都可以是 GAS actor。

典型属性：

- `health`
- `stamina`
- `carry`
- `armor`
- `workSpeed`
- `attackPower`

典型能力：

- `chop_wood`
- `mine_stone`
- `quick_repair`
- `build_boost`
- `tower_shot`
- `monster_bite`
- `rally_worker`

典型 effect：

- haste
- tired
- burning
- poisoned
- fortified
- repairing
- stunned

GAS 热状态应尽量落在 world component 上，保留数据驱动配置优势，同时利用 ECS 查询性能。

### EventBus

EventBus 只承载低频事实，例如 input action、rule fired、ability activated、effect applied、asset loaded、renderer diagnostic、objective milestone、wave started、building damaged。

高频位置、动画和每帧表现不通过 EventBus。

### Save

Sandbox 需要以最小但正确的方式集成 Save，用来验证框架保存链路，而不是把 Tiny Camp 做成完整游戏存档系统。

Sandbox Save 集成原则：

- SaveManager 由 App Host `services.save` 提供，Sandbox 不直接创建 store、codec 或 migration pipeline。
- Sandbox 的 gameplay 状态通过 contributor 注册，不能让 SaveManager 直接理解 Tiny Camp 组件。
- Sandbox 只保存能证明确定性恢复的长期状态：runtime seed/clock、Tiny Camp objective progress、resource/building/worker/monster 的必要 world 状态、GAS actor 的长期运行态、TCA 低频规则状态、Camera 可选状态。
- 不保存当前选中对象、follow target、confirm 操作上下文、renderer native handle、Phaser object、DOM/UI panel open state、Input held state、Timeline 日志、缓存、pathfinding 临时结果或可由 Data/Asset 重建的内容。
- 玩家 confirm 产生的临时交互效果只作为当前会话反馈保存到 timeline / trace，不进入普通进度存档；如果未来某个 confirm 结果应成为长期事实，必须由 gameplay system 写入明确的长期组件或 GAS 状态。
- Contributor 必须声明 `scope` 和 `tags`，例如 `world`、`gameplay`、`gas`、`tca`、`camera`，Sandbox profile 通过 Save contributor policy 决定默认保存范围。
- Save/load UI 应作为 Workbench 的低频操作进入 Inspector 或 Host tab，展示 slot、section、version、compatibility 和最近 diagnostics；不要把 save 控件塞进主舞台高频 HUD。
- 当前交互入口放在 Inspector 的 Host tab：`Save Local` 写入 Web Platform storage，`Load Local` 从同一 slot 恢复当前 Tiny Camp 运行状态；浏览器刷新后仍可读取同一 localStorage slot。
- Load 必须同时恢复 SaveEnvelope 的 runtime clock。保存时如果 HUD tick 是 1587，刷新页面后加载同一 slot，HUD 应回到 1587，再从后续 tick 继续推进。
- Sandbox 长链路测试需要覆盖“固定 seed → tick → save → 重建 runtime → load → 继续 tick”的结果确定性。

Sandbox 默认保存范围应偏保守：保存 `world`、`gameplay`、`gas`、`tca` 和可选 `camera`，排除 `presentation`、`debug`、`cache`、`ui`。

## Workbench UI

Sandbox UI 由三块组成：

- 主舞台：承载 Tiny Camp 的运行、交互和主要视觉反馈。
- Inspector：展示选中对象的 world、render、data、asset、TCA/GAS 关联状态。
- Timeline：按时间合并 EventBus、TCA trace、GAS trace 和 renderer diagnostic，解释“输入 → 规则 → 能力 → 效果 → 表现”的链路。

UI 只消费 snapshot 和低频状态，不把 UI 选择态写入 GameRuntime 或 App Host service。

Inspector 应围绕“当前选中对象”组织，而不是围绕模块平铺：

- Object：当前 entity、role、任务、存储、生命、GAS 状态。
- Runtime：相关系统、tick、module summary、host service 状态。
- Content：引用到的 Data documents、assets、render rig、recipe。
- Rules：最近命中的 TCA rules、失败 condition、产生的 actions。
- Effects：GAS ability/effect/cue、持续时间和属性变化。

Timeline 应突出链路而不是普通日志堆积。一次玩家 confirm、一次 monster attack 或一次 recipe completed 应能串起 input、event、TCA、GAS、world state、renderer cue。

## Snapshot 要求

Sandbox snapshot 应能支持 headless 测试和 UI 渲染。

长期快照信息包括：

- selected object / actor / entity。
- objective progress 和 status。
- scene entities、roles、position、task、storage、route。
- resource、construction、combat、threat 和 wave 状态。
- GAS actor state、attributes、tags、effects。
- DataPack、DataType、document、reference summary。
- Asset registered / loaded / failed summary。
- module summary 和 host service summary。
- timeline entries。

## 长链路测试要求

Sandbox 必须有一套长期维护的长链路集成测试，用来证明 Tiny Camp 不是“页面上有东西”，而是 App Host、Data、Asset、GameRuntime、World、TCA、GAS、Renderer、Input、Camera、EventBus 和 Snapshot 真的在协同运行。

长链路测试不是替代模块单元测试，也不是像素级视觉回归测试。它的职责是验证 Sandbox 作为框架验证面的完整机制链路：

- 应用组合链路：App Host/profile 能装配 Data、Asset、Driver、Renderer、Input、UI、GameRuntime 和标准 GameModule。
- 内容链路：DataRegistry 能注册 Tiny Camp 内容，scene object 可以追踪到 render object、render rig、building、recipe、GAS actor、asset reference 和 source pack。
- 自动循环链路：固定 seed 下，资源产出、worker 调度、采集、搬运、维修、防御、objective progress 和 route flow 会持续推进且结果可复现。
- 输入链路：game viewport scope 下的 action 能影响 gameplay/camera，UI scope 或空白点击不会误触发 gameplay。
- 规则链路：低频事件能触发 TCA rule，rule 能解释 trigger、condition 和 action，必要时激活 GAS ability。
- GAS 链路：ability/effect/tag/attribute/cue 会改变 actor/world state，并能在 timeline 和 snapshot 中观察。
- 渲染链路：render sync 会为 renderable entity 创建稳定 RenderObject，并根据 world state 更新 object transform、node patch、状态条、任务标记和威胁表现。
- 交互链路：scene click 命中对象会更新 selection/Inspector/focus overlay，点击空白会取消 selection，camera follow/free 与选中对象状态一致。
- 诊断链路：EventBus、TCA trace、GAS trace、renderer diagnostic 和 module summary 能被合并成可解释 timeline。

长链路测试应默认使用 headless harness 和 memory renderer，避免依赖真实浏览器、真实 canvas 或真实 Phaser 实例。Browser smoke test 只验证第一屏、canvas、Inspector、Timeline、无 console error 和关键交互，不进入默认快速测试的核心路径。

推荐测试组织：

- `sandbox-long-chain.test.ts`：面向完整场景的长链路用例。
- `test/sandbox-harness.ts`：创建固定 seed runtime、memory renderer、fake asset summary、tick helper、input helper 和 snapshot helper。
- `test/snapshot-assertions.ts`：封装对象查找、timeline chain、content reference、renderer object 等断言。
- `test/long-chain-scenarios.ts`：沉淀 boot、idle automation、confirm、monster pressure、selection/camera 等场景步骤。

长期长链路场景至少包括：

1. Boot Chain：启动后 Campfire、Worker、Resource Node、Storage、Workshop、Tower、Monster、Road 都存在；renderer object、DataType、module summary 和 runtime event 正常。
2. Idle Automation Chain：无输入运行一段时间后，resource、worker task、route progress、battery/fatigue、campfire objective、road flow 和 deterministic snapshot 正常。
3. Input → TCA → GAS Chain：`confirm` 从 input action 进入 EventBus，触发 TCA rule，激活 GAS ability，改变 actor tag/effect/attribute，并进入 timeline。
4. Monster Pressure Chain：monster wave 或 attack 会改变 threat/building/world/GAS 状态，并促使 worker dispatcher 后续产生 defend/repair 行为。
5. Render Sync Chain：entity position 和 storage/building/work/threat/objective 状态变化会同步到 memory renderer 的 object patch 和 node patch。
6. Selection / Camera / Input Scope Chain：点击对象、点击空白、camera follow/free、game viewport scope 和 UI scope 都有明确行为。
7. Content Reference Chain：从选中对象能反查 Data document、asset、render rig、GAS actor、TCA/GAS 相关数据和 source pack，且不存在 missing reference diagnostic。

长链路测试应尽量使用行为断言，不断言脆弱的时间点和完整数组顺序。必要时使用区间、存在性、单调增长、稳定 id、固定 seed 快照片段等方式，避免测试因为表现层微调而频繁失效。

## 设计约束

- Sandbox 可以使用复杂本地数据和本地组件，但不能把演示专用概念上推到核心包。
- Sandbox 不能成为真实游戏逻辑仓库；当某个能力证明通用后，再提炼到对应模块。
- 舞台表达优先于面板堆叠；Inspector 和 Timeline 是解释层，不是主表达层。
- 基础概念必须容易理解，复杂性应来自系统组合和状态变化，而不是名词抽象。
- 任何新第三方库仍必须通过 Driver、adapter 或 app 层接入。
- 固定 seed 下的自动循环必须可测试、可复现。

## 最佳实践

### 模块集成

- Sandbox 首要任务是验证框架协作链路，不是沉淀可复用玩法。复杂 demo 逻辑只能服务于 App Host、Data、Asset、Renderer、Input、Camera、TCA、GAS、Save 和 UI 的端到端说明。
- Sandbox app shell 负责把 App Host、Driver、Renderer、Input、UI、Save 和标准 GameModule helper 组装起来；Sandbox game module 不直接 import Phaser、Koota、DOM 或 React internal。
- Sandbox 长链路测试应优先覆盖“模块是否协作”：内容引用、资源加载、自动循环、TCA/GAS 链路、选择/镜头、save/load、diagnostics/timeline。
- 浏览器手动验收关注第一屏信息层级、game viewport scope、camera 坐标转换、可点击对象、Save/Load 本地恢复和 console error；不要以视觉花活替代协议验证。

### 模块使用

- Sandbox 内容按 Tiny Camp 真实业务概念组织，但不要把 Worker、Campfire、Monster、Recipe 等演示概念写入核心模块文档或公共 API。
- Sandbox UI 只消费 snapshot、diagnostics 和低频状态；当前 selection、follow target、inspector tab、timeline filter 和 save/load 按钮状态属于 workbench state，不写入 GameRuntime 或普通进度存档。
- 场景点击、confirm、camera action 都通过 Input action/scope 进入系统，不绕过 Input 直接改玩法状态。点击空白应明确清空 selection，而不是触发默认兜底选中。
- 交互 UI 使用 React 或 DOM builder + `textContent`，不要用 `innerHTML` 拼接按钮、Inspector、Modal、Tip 或场景对象卡片。
