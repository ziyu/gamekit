# 最佳实践

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
