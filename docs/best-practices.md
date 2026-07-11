# 最佳实践

本文档负责跨模块通用实践、已验证经验、反模式和性能/测试策略。单个模块的专属实践写在 `docs/modules/<module>.md` 的“最佳实践”段落；具体工作流状态、任务拆分和完成定义写在任务系统、PR 或 `docs/implementation/`。

模块最佳实践必须区分两类读者和场景：

- 模块集成：把模块接入 app、App Host、Driver、Adapter、GameRuntime、测试夹具或内容管线的装配规则。集成通常由框架维护者、app shell、profile 或基础设施代码完成，频率低但边界影响大。
- 模块使用：游戏模块、业务代码、工具 UI、DataPack、SaveContributor 等日常如何消费该模块。使用频率高，应强调稳定 facade、性能边界、状态归属和反模式。

不要把一次性集成细节写成日常使用要求，也不要把业务使用习惯塞进集成层。

## 模块最佳实践索引

模块专属实践入口：

- Core / EventBus / GameRuntime：`docs/modules/core-runtime.md`
- World / ECS Adapter：`docs/modules/world.md`
- Data：`docs/modules/data.md`
- Assets：`docs/modules/assets.md`
- Platform：`docs/modules/platform.md`
- Driver：`docs/modules/driver.md`
- Renderer：`docs/modules/renderer.md`
- Input：`docs/modules/input.md`
- Camera：`docs/modules/camera.md`
- Physics：`docs/modules/physics.md`
- TCA：`docs/modules/tca.md`
- GAS：`docs/modules/gas.md`
- Multiplayer：`docs/modules/multiplayer.md`
- UI Core / React UI：`docs/modules/ui.md`
- App Host：`docs/modules/app-host.md`
- Save：`docs/modules/save.md`
- DevTools：`docs/modules/devtools.md`
- Sandbox：`docs/apps/sandbox.md`

## 跨模块边界

集成实践：

- 先判断能力归属：管理外部 runtime、平台能力、资源句柄、输入来源、UI shell、存储和诊断的能力通常是 App Service；需要 world、tick、actor、rule、ability、camera rig、physics scene 或 gameplay context 的能力通常是 GameModule。
- 第三方库进入 Driver、Adapter、app/profile 或 app-specific presentation/tooling 层，不进入核心 facade、DataType、可复用 GameModule 公共 API 或 gameplay 包。
- Driver 持有跨多个协议的外部 runtime，例如 Phaser Game 或 Three renderer/scene；Adapter 只把单个 GameKit 协议映射到 Driver 暴露的 runtime slice。
- Multiplayer backend adapter 应优先接入成熟多人方案，例如 Colyseus、Nakama、PartyKit 或平台联机 SDK，并持有网络 SDK、room、matchmaker、state sync 或平台联机 runtime；App Host 管理连接 lifecycle，GameModule bridge 只消费归一化 session/message/authority 事实。
- 具体 app presentation、Editor 后端专属面板和 DevTools renderer plugin 可以通过 typed native handle 使用底层 renderer API；这些依赖不能进入 Data、Save、core facade 或可复用 gameplay module。
- GameRuntime 只负责模块安装、clock、system tick 和 lifecycle，不直接拥有 Platform、Driver、Renderer、Input、Camera、Physics backend provider、Data、Asset、UI、Save store 或 multiplayer connection。

使用实践：

- EventBus 只承载低频事实。高频 position、camera target、physics contact manifold、render patch、held input、UI hover 等状态留在对应 runtime state 或 system 内。
- Renderer、Input、Camera、Physics、UI、TCA、GAS、Save 和 Multiplayer 都需要 trace/diagnostic 入口，但诊断不能反向成为业务逻辑依赖。

## 生命周期

集成实践：

- App Host 统一推进 App Service lifecycle：boot、start、stop、dispose、snapshot。底层服务对象不需要为了 Host 继承私有基类，生命周期通过 binding 描述。
- GameModule 的订阅、system、trace store、controller runtime 和 cleanup 跟随 GameRuntime lifecycle；`stop()` 停 tick，`dispose()` 释放订阅和长期句柄。
- Driver 先 boot，再派生 renderer/asset/input/camera/physics adapter；adapter 不单独创建同一套外部 runtime。
- Save/load、asset preload、data registration 和 renderer boot 应由 App Host 或 app profile 编排顺序，不藏在 GameRuntime 内部。
- Multiplayer create/join/reconnect/leave 应由 App Host、lobby UI、server host 或测试夹具显式触发；GameModule 不隐式创建 socket、Colyseus Room、Nakama match 或 provider room。
- Headless 测试应能用 memory platform、memory renderer、memory save store、deterministic clock、fake asset loader 和 fake physics backend 启动主要组合路径。

## 数据驱动

集成实践：

- DataTypeDefinition、AssetDefinition、TCA/GAS definitions、physics definitions 和 render object definitions 应由 app/profile/content package 在启动时注册或物化，业务系统日常只读取稳定 registry。
- Content Package、编辑器导入器或 profile 负责把用户文件转成 DataPack；DataRegistry 不直接理解资源 payload、脚本、权限或包挂载。

使用实践：

- DataType 设计应给游戏开发者自由度。框架只要求稳定 `type + id`、可校验、可引用、可诊断，不强迫所有项目套固定 hero/monster/building 模板。
- DataPack 是数据集合，不是内容包系统。真实 Content Package 未来可以包含 DataPack、资源 payload、脚本、localization、地图、patch 和权限声明。
- Runtime state 不写回 DataRegistry。Data 是定义和来源追踪，World/Physics/GAS/TCA/Save 承载运行时状态。
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
- GameRuntime、Camera、Input、Physics、TCA、GAS、Save 等有顺序语义的模块必须覆盖顺序、幂等、stop/dispose 和 cleanup。
- Multiplayer backend adapter 必须覆盖 provider facade 的 connect、create-or-join/leave、message routing、peer summary、disconnect、reconnect 降级、payload validation、dispose cleanup 和 diagnostics；provider 自己拥有的 room/matchmaker/state sync 逻辑不要在 GameKit core 中重写。
- Multiplayer app/demo 集成测试不能只断言 peer count 或 presence；必须至少断言一条 lifecycle、input、snapshot、patch 或 command result 来自同一个 authority state，并验证非 authority snapshot/patch 不会被 client 应用。
- Multiplayer 输入先区分 continuous state 和 discrete command：移动、瞄准、驾驶采用 latest-per-source coalescing、持有状态和明确 timeout；交互、购买、一次性技能采用 authority loop 提供的 per-source bounded FIFO/action，并配置每 tick 消费与积压上限。生产频率与消费频率相同的 continuous input 不能进入逐条 FIFO，否则 jitter 会永久转化为远端表现延迟；app 也不能绕过底层保护另建无界 action 队列。
- Multiplayer peer 离开或断线时，host/server presence 组合层必须调用 authority loop 的 peer release 入口，清掉该 peer 尚未消费的 action/input 和 sequence epoch。是否保留 actor、slot 或本局统计属于 gameplay policy，不能靠保留旧网络队列来实现。
- 离线单机和多人模式应共享同一套 gameplay orchestration。测试应能用同一 input/action log 在 local authority 和 host/server authority fixture 中得到等价稳定 snapshot，避免维护两套规则实现。
- Sandbox、demo 或 headless host 的集成测试应覆盖长链路：Data → Asset → App Host → GameRuntime → World → Physics → TCA/GAS → Renderer/Input/Camera → Snapshot/Timeline。
- 固定 seed 测试只比较稳定 snapshot，不比较 DOM、native handle、绝对时间或底层库对象。

## Monorepo

- 使用 pnpm workspace 管理 `apps/*` 和 `packages/*`。
- 使用 Turbo 编排 `build`、`test`、`dev`。
- 使用 oxlint 进行 lint，使用 oxfmt 进行格式检查和写入。
- 根目录命令应面向日常开发，包内命令应面向 Turbo 和局部验证。

## Package Release

当前发布操作流程、Version PR 合并顺序、手动触发方式和故障排查见
`docs/release.md`。本节只维护长期发布原则和反模式。

发布实践：

- GameKit 采用多包发布。下游项目按需安装 facade、adapter、driver、App Host、UI 和 DevTools 包，不通过一个巨型包默认引入所有能力。
- `apps/*` 是验证应用和示例源码，不作为 npm package 发布。
- 可发布包必须只通过公共入口导出稳定 API；`src/index.ts` 继续只做 re-export，不承载主要实现。
- 发布产物必须来自 library build 输出的 `dist`，不能把 `src`、`test`、`.turbo`、`tsconfig.tsbuildinfo`、缓存、日志或 app 构建产物打入 tarball。
- package manifest 必须用 `files` 白名单限定发布内容，并声明 `exports`、`types`、`main`、`repository` 和 `publishConfig.access`。
- CSS 入口只能从发布产物导出，例如 `./dist/styles.css`；有 CSS 或必要副作用的包不能盲目声明 `sideEffects: false`。
- React UI 类包应把 `react` 和 `react-dom` 声明为 peer dependency，并在本仓库保留 dev dependency 用于构建和测试；发布 smoke 必须确认 consumer 复用顶层 React。
- 纯 TypeScript 包、React TSX 包、adapter/driver 包都必须通过外部安装 smoke test，验证它们离开 workspace alias 后仍能被消费。
- 初期版本采用 lockstep 发布，先走 alpha tag 验证 tarball、Node ESM、Vite、peer dependency 和真实 app dogfood，再进入 latest。
- prerelease 只更新 `alpha`、`beta` 或 `rc`，不得同步或覆盖 `latest`。稳定版进入默认安装入口时，直接用不带 prerelease 后缀的版本和 `dist-tag=latest` 发布。
- Release workflow 应以通用 `release` 命名，`alpha`、`beta`、`rc`、`latest` 只是 dist-tag 参数；不要把当前阶段固化为 workflow 身份。
- Changesets 自动化应先创建 version PR，再由合并后的 main 发布。alpha 阶段使用 Changesets pre mode，正式发布前显式 `pre exit`。
- 普通开发者不手写 changeset；PR automation 根据可发布包的实际源码、README 或非 version-only manifest 改动生成 changeset。需要覆盖默认 bump 时使用 `changeset:major`、`changeset:minor` 或 `changeset:patch` label。
- Changesets pre mode 会在 `.changeset/pre.json` 记录已消费 changeset；判断是否存在待发布 changeset 时必须排除这些已消费 id，不能只看 `.changeset/*.md` 文件是否存在。
- 自动 publish 只在没有待消费 changeset 且当前包版本尚未发布到 registry 时运行；检测应基于 registry 中的实际发布状态，不依赖 merge commit 标题或单次 push 的文件列表。
- 自动 publish 还必须检测 npm dist-tag 是否指向当前版本；若版本已存在但 tag 仍停在旧版本，发布脚本应走幂等 retag 路径而不是重新上传 tarball。
- npm package 发布成功后必须创建 `v<version>` Git tag 和 GitHub Release；`alpha`、`beta`、`rc` 等预发布版本在 GitHub Release 中标记为 prerelease。tag/release 创建逻辑必须幂等，不能移动已经存在且指向不同 commit 的版本 tag。

依赖实践：

- `@gamekit/*` 包之间在 workspace 内使用 workspace dependency，发布产物必须落成明确版本号。
- Driver 或 adapter 明确拥有的底层 runtime 可以作为该包 dependency，例如 Phaser driver 依赖 Phaser、Koota adapter 依赖 Koota。
- 宿主应用必须共享的 runtime 使用 peer dependency，例如 React 和 ReactDOM。
- 测试工具包如果导出 Vitest conformance helper，应把 Vitest 作为 peer dependency，并在 Vitest 进程中做 smoke test；普通 Node ESM smoke 不应直接 import 这类测试入口。
- 可选平台插件使用 optional peer dependency，例如 Tauri 插件。
- 核心 facade、DataType、GameModule 公共 API 和 gameplay 包不得暴露第三方 runtime 类型。

构建实践：

- `tsc -b` 继续作为项目引用和类型检查门禁。
- 发布用 library bundler 输出可被 Node ESM 和主流 bundler 消费的 JS、类型声明和 CSS 产物。
- Rolldown 系工具链优先通过 `tsdown` 试点和接入；若不能满足 package dry-run、d.ts、external、CSS 和 smoke test 门禁，再回退到直接 Rolldown 配置或其他成熟 library bundler。
- 所有内部 `@gamekit/*` 依赖和大型第三方 runtime 在 library build 中保持 external，不把相邻包或 Phaser、React、Tauri 等 runtime 打进 facade 包。
- package build helper 复制 CSS 或其他静态发布入口时，应在 bundler clean 和 JS/d.ts 输出完成后执行，避免 `dist` 被后续 clean 步骤清空。
- 单包发布构建不能递归 emit project references，否则后构建的聚合包可能覆盖前序包已经 bundler 处理过的 `dist`。包内 build helper 应只检查或生成当前包产物；全仓库 `tsc -b` 留给根级 build/test 门禁。
- declaration bundler 遇到复杂类型递归时，可以为该包显式保留 tsc declaration tree，同时用 bundler 只输出入口 JS；这种例外要通过包级 build metadata 标记，并继续经过 tarball 和外部安装 smoke。
- 发布 staging 目录每轮必须先清理目标包目录，再复制当前 `dist`，并在 staging 侧再次清理 `.tsbuildinfo`，避免固定 release 目录带入旧文件。
- 发布验证中的 npm cache/logs 应隔离到 release 目录，避免用户级 `~/.npm` 权限或缓存状态影响 `npm pack`。
- scoped package 通过 token fallback 发布时必须显式传递 `--access public`；仅保留 manifest `publishConfig.access` 可能会被 registry 当作 private scoped package。
- 自动化发布脚本不得把 token 写入仓库、日志或命令错误栈。token fallback 应通过 npm CLI 和临时 userconfig 传递认证，并在结束后删除临时目录。
- 未发布前验证一组相互依赖的 tarball 时，临时消费者必须把内部包解析到本地 tarball，例如通过 pnpmfile hook 或 overrides；否则包内的明确版本号会让安装器去 registry 查找尚未发布的相邻包。
- registry 网络不稳定时可以重试安装步骤，但不能跳过 registry smoke；至少一次需要从 npm registry 安装已发布包并运行外部 consumer smoke。
- GitHub Actions 发布 job 必须绑定受保护 Environment，并优先通过 npm Trusted Publishing/OIDC 发布；`NPM_TOKEN` 只用于新包首发 bootstrap 和 fallback。发布脚本只能从环境变量或 stdin 读取 token，不能把 token 写入日志、仓库或命令参数。
- Trusted Publishing 会校验 npm provenance，发布产物的 `package.json.repository.url` 必须匹配 GitHub Actions 来源仓库。
- 具体发布步骤必须维护在 `docs/release.md`，不要把一次发布的临时状态、失败日志或人工补救命令写入长期最佳实践。

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
- TCA/GAS 不用于每帧高频微逻辑；输入、镜头、物理、渲染同步等高频路径走 system 或专用 runtime state。

数据结构：

- 查询和规则执行需要索引，不能长期依赖全量扫描。
- adapter 可以为了第三方库兼容保留映射表，但映射关系必须由 adapter 私有维护。
- 大规模集合更新优先批处理，避免在循环里触发 UI 或外部副作用。
- renderer sync 只做状态镜像：创建/销毁 renderer object 时可以发低频事件，逐帧 transform/visibility/layer patch 不进入 EventBus。
- Phaser 等大型 adapter 依赖应隔离在 adapter 包中；app bundle 体积告警先记录，等 Asset/加载阶段再做 code splitting 或 chunk 策略。
- 海量 tile、particle、instanced mesh、复杂骨骼/挂点等热点路径应使用 adapter 提供的受控 native handle 或 batch API，不强迫每帧走通用 patch，也不要求 renderer-core 包装对应后端 API。

测量：

- 性能判断必须有数据，先用 benchmark 或 profiler 记录基线。
- 新增 adapter、renderer sync、TCA runner、asset loader 时应补最小 benchmark 或 profile 入口。
- benchmark 的细微变化只作为趋势参考，不写死成易碎测试；已经稳定的热点模块可以在 CI 使用留有足够机器波动余量的粗粒度预算，拦截数量级退化、无界队列和 retained heap 持续增长。预算不能代替 profiler，也不能把正常噪声变成合并阻塞。
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
- 不要让业务 gameplay package、GameRuntime、World、Physics、TCA、GAS、DataType 或 renderer adapter 直接依赖 Tailwind、GSAP、shadcn/ui、Radix 或 Base UI。
- 游戏应优先沉淀自己的 UI 组件库，例如 `AbilityButton`、`ResourceMeter`、`ActorPortrait`、`BuildSlot`，再由这些组件消费 Tailwind、CSS variables 或 shadcn recipe。
- 所有 UI 动效必须尊重 reduced motion；动画失败不能阻塞 UI command 或 gameplay tick。
