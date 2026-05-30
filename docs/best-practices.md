# 最佳实践

本文档负责跨模块通用实践、已验证经验、反模式和性能/测试策略。单个模块的专属实践写在 `docs/modules/<module>.md` 的“最佳实践”段落；阶段状态和完成定义写在 `docs/development-stages.md`。

模块最佳实践必须区分两类读者和场景：

- 模块集成：把模块接入 app、App Host、Driver、Adapter、GameRuntime、测试夹具或内容管线的装配规则。集成通常由框架维护者、app shell、profile 或基础设施代码完成，频率低但边界影响大。
- 模块使用：游戏模块、业务代码、工具 UI、DataPack、SaveContributor 等日常如何消费该模块。使用频率高，应强调稳定 facade、性能边界、状态归属和反模式。

不要把一次性集成细节写成日常使用要求，也不要把业务使用习惯塞进集成层。

## 模块最佳实践索引

已实现模块的专属实践入口：

- Core / EventBus / GameRuntime：`docs/modules/core-runtime.md`
- World / ECS Adapter：`docs/modules/world.md`
- Data：`docs/modules/data.md`
- Assets：`docs/modules/assets.md`
- Platform：`docs/modules/platform.md`
- Driver：`docs/modules/driver.md`
- Renderer：`docs/modules/renderer.md`
- Input：`docs/modules/input.md`
- Camera：`docs/modules/camera.md`
- TCA：`docs/modules/tca.md`
- GAS：`docs/modules/gas.md`
- UI Core / React UI：`docs/modules/ui.md`
- App Host：`docs/modules/app-host.md`
- Save：`docs/modules/save.md`
- DevTools：`docs/modules/devtools.md`
- Sandbox：`docs/apps/sandbox.md`

## 跨模块边界

集成实践：

- 先判断能力归属：管理外部 runtime、平台能力、资源句柄、输入来源、UI shell、存储和诊断的能力通常是 App Service；需要 world、tick、actor、rule、ability、camera rig 或 gameplay context 的能力通常是 GameModule。
- 第三方库进入 Driver、Adapter 或 app/profile 层，不进入核心 facade、DataType、GameModule 公共 API 或 gameplay 包。
- Driver 持有跨多个协议的外部 runtime，例如 Phaser Game 或 Three renderer/scene；Adapter 只把单个 GameKit 协议映射到 Driver 暴露的 runtime slice。
- GameRuntime 只负责模块安装、clock、system tick 和 lifecycle，不直接拥有 Platform、Driver、Renderer、Input、Camera、Data、Asset、UI 或 Save store。

使用实践：

- EventBus 只承载低频事实。高频 position、camera target、render patch、held input、UI hover 等状态留在对应 runtime state 或 system 内。
- Renderer、Input、Camera、UI、TCA、GAS 和 Save 都需要 trace/diagnostic 入口，但诊断不能反向成为业务逻辑依赖。

## 生命周期

集成实践：

- App Host 统一推进 App Service lifecycle：boot、start、stop、dispose、snapshot。底层服务对象不需要为了 Host 继承私有基类，生命周期通过 binding 描述。
- GameModule 的订阅、system、trace store、controller runtime 和 cleanup 跟随 GameRuntime lifecycle；`stop()` 停 tick，`dispose()` 释放订阅和长期句柄。
- Driver 先 boot，再派生 renderer/asset/input/camera adapter capability；adapter 不单独创建同一套外部 runtime。
- Save/load、asset preload、data registration 和 renderer boot 应由 App Host 或 app profile 编排顺序，不藏在 GameRuntime 内部。
- Headless 测试应能用 memory platform、memory renderer、memory save store、deterministic clock 和 fake asset loader 启动主要组合路径。

## 数据驱动

集成实践：

- DataTypeDefinition、AssetDefinition、TCA/GAS definitions 和 render object definitions 应由 app/profile/content package 在启动时注册或物化，业务系统日常只读取稳定 registry。
- Content Package、编辑器导入器或 profile 负责把用户文件转成 DataPack；DataRegistry 不直接理解资源 payload、脚本、权限或包挂载。

使用实践：

- DataType 设计应给游戏开发者自由度。框架只要求稳定 `type + id`、可校验、可引用、可诊断，不强迫所有项目套固定 hero/monster/building 模板。
- DataPack 是数据集合，不是内容包系统。真实 Content Package 未来可以包含 DataPack、资源 payload、脚本、localization、地图、patch 和权限声明。
- Runtime state 不写回 DataRegistry。Data 是定义和来源追踪，World/GAS/TCA/Save 承载运行时状态。
- 引用关系通过 DataRef / AssetRef / 自定义 references 提取进入 reference graph，错误必须能定位 source pack、entry type、entry id、field path 和 target key。
- 游戏内容文件应优先按真实业务概念组织，同一个业务文件可以混合内置 DataType 和用户自定义 DataType。

## 保存边界

集成实践：

- SaveManager、SaveStore、SaveCodec、migration registry 和 contributor policy 由 App Host/app profile 组合；游戏模块通过 contributor bridge 注册 capture/restore。
- Save contributor context 默认只暴露必要服务，例如 Data、Assets、GameRuntime；Renderer、Input、UI、Platform 等运行时对象必须显式 opt-in。

使用实践：

- 普通继续游戏存档保存长期玩法事实和 runtime clock，不保存当前 selection、hover、focus target、confirm 弹窗上下文、held input、timeline 日志、renderer native handle、React state 或 adapter cache。
- SaveContributor 必须显式声明 capture/restore/validate、scope、tags 和版本；不要让 SaveManager 直接理解具体玩法组件。
- Save/load 流程不隐式 tick GameRuntime。app 决定 load 前是否 pause、load 后是否 resume。

## 测试策略

- Facade 要有契约测试；Adapter 先跑 facade conformance，再补底层库专属行为测试。
- 数据驱动模块必须覆盖 duplicate、unknown type、missing reference、schema/path error、trace/diagnostic。
- GameRuntime、Camera、Input、TCA、GAS、Save 等有顺序语义的模块必须覆盖顺序、幂等、stop/dispose 和 cleanup。
- Sandbox、demo 或 headless host 的集成测试应覆盖长链路：Data → Asset → App Host → GameRuntime → World → TCA/GAS → Renderer/Input/Camera → Snapshot/Timeline。
- 固定 seed 测试只比较稳定 snapshot，不比较 DOM、native handle、绝对时间或底层库对象。

## Monorepo

- 使用 pnpm workspace 管理 `apps/*` 和 `packages/*`。
- 使用 Turbo 编排 `build`、`test`、`dev`。
- 使用 oxlint 进行 lint，使用 oxfmt 进行格式检查和写入。
- 根目录命令应面向日常开发，包内命令应面向 Turbo 和局部验证。

## TypeScript

- 包统一 ESM。
- 公共入口从 `src/index.ts` re-export。
- 公共类型要稳定，adapter 私有类型不导出。
- 避免用 `any` 穿过包边界；adapter 内部为适配第三方动态 API 可以局部使用。

## 测试

- 新增 facade 时，同时新增 conformance test helper。
- 新增 adapter 时，先跑通 facade 契约，再补 adapter 专属测试。
- 示例 app 的集成测试要验证确定性和事件链路。

## Runtime

- `start()` 只负责进入运行状态并发 runtime event。
- `tick(delta)` 顺序固定为 clock 更新后执行系统。
- `stop()` 后系统不得继续执行。
- 高频逻辑进入 system，低频事实进入 EventBus。

## 性能

性能设计从边界开始，而不是事后补救。

高频路径：

- 每帧 system 中避免创建临时对象、闭包和大量数组。
- 不在高频路径里做 JSON path 解析、动态字符串匹配、深拷贝或复杂 schema 校验。
- 高频状态留在 ECS/world 内，React/UI 只消费低频快照。
- EventBus 只用于低频事实，不用于每帧 position、render object patch、pointer move 广播。
- TCA/GAS 不用于每帧高频微逻辑；输入、镜头、渲染同步等高频路径走 system 或专用 runtime state。

数据结构：

- 查询和规则执行需要索引，不能长期依赖全量扫描。
- adapter 可以为了第三方库兼容保留映射表，但映射关系必须由 adapter 私有维护。
- 大规模集合更新优先批处理，避免在循环里触发 UI 或外部副作用。
- renderer sync 只做状态镜像：创建/销毁 renderer object 时可以发低频事件，逐帧 transform/visibility/layer patch 不进入 EventBus。
- Phaser 等大型 adapter 依赖应隔离在 adapter 包中；app bundle 体积告警先记录，等 Asset/加载阶段再做 code splitting 或 chunk 策略。
- 海量 tile、particle、instanced mesh、复杂骨骼/挂点等热点路径应使用 adapter 提供的受控 handle 或 batch API，不强迫每帧走通用 patch。

测量：

- 性能判断必须有数据，先用 benchmark 或 profiler 记录基线。
- 新增 adapter、renderer sync、TCA runner、asset loader 时应补最小 benchmark 或 profile 入口。
- benchmark 结果只作为趋势参考，不写死成易碎测试。
- DevTools Performance 面板只展示 GameKit 级 frame/system/service/adapter 归因，不替代浏览器 profiler；需要 CPU flamegraph、layout、paint、GPU 信息时仍使用浏览器或引擎原生工具。
- 默认只开启低成本 summary；深度 span、单帧详情、完整 payload 展开必须由用户显式开启或在测试夹具中启用。
- 每个热点模块都应定义自己的预算语义，例如 runtime tick、render sync、asset load group、service boot、UI refresh；预算超限只产生诊断，不改变 gameplay。
- profiler disabled 时，高频路径不能留下明显对象分配、数组复制或 React state 更新。
- Performance UI 刷新必须节流，不能跟随 gameplay tick 每帧重渲染。
- 发现慢点后先确认归因维度：system 慢、adapter 慢、asset IO 慢、UI 刷新慢、DevTools 自身慢，避免用错误层级修问题。

## Sandbox

Sandbox 是架构验证场，不是最终 demo。

允许：

- 展示 runtime 状态。
- 验证模块安装、系统 tick、事件链路。
- 作为后续 renderer/devtools 的接入点。

不允许：

- 在 sandbox 里沉淀长期玩法规则。
- 直接绕过 GameKit 公共接口访问 adapter 内部。

## UI / DOM

- 游戏 app、demo、sandbox、editor 的交互 UI 应通过 React/组件系统或显式 DOM builder 构建，不用 HTML 字符串拼接。
- 需要更新已有 DOM 时，优先更新 `textContent`、`style`、`classList`、`dataset` 或子节点；避免每帧或每次 snapshot 都重建可交互节点。
- 可点击、可输入、可选择文本的 UI 节点应保持稳定，避免刷新时打断焦点、hover、文本选择、按钮状态和动画。
- 游戏数据、内容包数据、用户输入和诊断文本都按不可信文本处理；写入 DOM 时使用 `textContent` 或组件文本子节点。

## React UI

- `@gamekit/react-ui` 使用 Tailwind CSS 作为默认样式基础，样式应通过组件、recipe、CSS variables 和语义 props 组织，而不是把 class 字符串散落在业务页面中。
- GSAP 只用于低频 UI 动效，例如 window/modal/toast/timeline/inspector 的进入、退出、强调和布局过渡；不要把 GSAP 用作 gameplay timing、renderer object patch 或 world tick 驱动。
- shadcn/ui 是推荐的组件 recipe 最佳实践。采用时应复制并封装到 `@gamekit/react-ui` 或具体游戏 UI 包，保持代码可拥有、可改造、可测试。
- 不要让业务 gameplay package、GameRuntime、World、TCA、GAS、DataType 或 renderer adapter 直接依赖 Tailwind、GSAP、shadcn/ui、Radix 或 Base UI。
- 游戏应优先沉淀自己的 UI 组件库，例如 `AbilityButton`、`ResourceMeter`、`ActorPortrait`、`BuildSlot`，再由这些组件消费 Tailwind、CSS variables 或 shadcn recipe。
- 所有 UI 动效必须尊重 reduced motion；动画失败不能阻塞 UI command 或 gameplay tick。
