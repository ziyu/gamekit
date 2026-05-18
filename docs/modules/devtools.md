# DevTools 模块设计

## 定位

DevTools 负责可解释性、可观察性和调试工作台。GameKit 越依赖 Data、TCA、GAS、Renderer Adapter、Save Contributor 和 App Host 组合，越需要 DevTools 能回答“为什么发生了这件事”“哪个数据定义驱动了它”“哪个系统改了状态”“后续产生了哪些表现和存档影响”。

相关包：

- `@gamekit/devtools`
- `@gamekit/ui-core`
- `@gamekit/react-ui`
- `@gamekit/devtools-ui`

协作包：

- `@gamekit/app-host`
- `@gamekit/event-bus`
- `@gamekit/game-runtime`
- `@gamekit/world`
- `@gamekit/data`
- `@gamekit/asset`
- `@gamekit/renderer-core`
- `@gamekit/input-core`
- `@gamekit/camera-core`
- `@gamekit/tca`
- `@gamekit/gas`
- `@gamekit/save`

DevTools 是 App Service / tooling，不是 GameModule，不进入 gameplay loop，不改变正式玩法结果。它可以观察 GameRuntime、Host services、trace store、diagnostics 和 snapshots；只有显式 debug command / editor command 才能改变状态。

## 设计目标

- 提供统一 DevToolsRuntime，用于注册数据源、面板、trace buffer、profiler 和 debug commands。
- 汇总 EventBus、TCA、GAS、Renderer、Asset、Save、App Host、World snapshot 和 GameRuntime system profiler。
- 通过 trace correlation 展示“输入 → 事件 → 规则 → 能力 → 状态 → 表现 → 存档/诊断”的链路。
- 支持 headless 测试和 DevTools UI package 两种使用方式。
- 支持低开销默认模式和显式开启的深度采样模式。
- 不把 Phaser、Three、Koota、React internal、DevTools UI component 或具体游戏 app 类型泄漏到 DevTools Core 公共协议。
- 让 Sandbox、Hero Road、Editor 和未来真实游戏复用同一套面板/数据源协议。

## 非目标

- 不做完整性能分析器、浏览器开发者工具替代品或录制回放系统。
- 不负责修改 gameplay 规则；调试命令必须显式注册并可审计。
- 不存储长期游戏进度；DevTools snapshot 和 trace buffer 是可丢弃调试数据。
- 不直接解析具体游戏业务数据模型，例如 hero、monster、building。
- 不直接持有 renderer native handle、Phaser Scene、Three Mesh、DOM node 或 React component instance。
- 不把每帧完整 World / Renderer patch 推进 React UI。

## 核心模型

```txt
DevToolsRuntime
  -> DataSource Registry
  -> Trace Store / Correlator
  -> Profiler
  -> Panel Registry
  -> Debug Command Registry
```

核心职责：

- 管理 DevTools lifecycle 和 snapshot。
- 注册可观察数据源。
- 接收低频 trace / diagnostic / event。
- 从多个数据源生成稳定 DevTools snapshot。
- 管理 UI panel definition。
- 管理显式 debug command。

DevToolsRuntime 不直接创建 GameRuntime，不直接订阅所有模块私有实现。各模块通过 adapter/source 把自己的稳定 snapshot、trace 或 diagnostics 暴露给 DevTools。

## DevToolsRuntime

建议公共形态：

```ts
export type DevToolsRuntime = {
  registerDataSource(source: DevToolsDataSource): () => void;
  registerPanel(panel: DevToolsPanelDefinition): () => void;
  registerCommand(command: DevToolsCommandDefinition): () => void;
  pushTrace(entry: DevToolsTraceInput): DevToolsTraceEntry;
  pushDiagnostic(event: DevToolsDiagnosticInput): DevToolsDiagnosticEvent;
  markProfilerSample(sample: DevToolsProfilerSample): void;
  executeCommand(commandId: string, input?: unknown): Promise<void>;
  snapshot(options?: DevToolsSnapshotOptions): DevToolsSnapshot;
  clear(options?: DevToolsClearOptions): void;
  dispose(): void;
};
```

DevToolsRuntime 应支持：

- ring buffer 限制 trace 数量。
- 数据源 lazy snapshot。
- 低频 diagnostics。
- profiler 聚合。
- panel registry。
- command registry。
- snapshot filter。
- dispose cleanup。

DevToolsRuntime 不应该在 `snapshot()` 中做昂贵全量计算。复杂关联和索引应在 trace 进入时增量维护，或在 UI 明确请求详情时懒加载。

## 快速集成

普通游戏不应该手写一大组 DevTools data source、panel 和 UI launcher。App Host 必须提供标准 preset，让游戏可以从一行配置开始：

```ts
const profile = createStandardAppProfile({
  id: "web",
  services: {
    platform: { adapter: webPlatform },
    drivers: { drivers: [phaserDriver] },
    data: { registry },
    renderer: { driver: "game.phaser" },
    assets: { driver: "game.phaser" },
    input: { router },
    game: { createRuntime },
    save: { store, formatVersion: "1.0.0" },
    devtools: true
  }
});
```

`devtools: true` 等价于启用标准 preset。标准 preset 由 App Host 自动注册已经存在的标准服务数据源，例如 Host、Platform、Drivers、Data、Assets、Renderer、Input、GameRuntime、UI 和 Save。缺失的服务不会生成空数据源。

在标准 Web bootstrap 中，`devtools: true` 还表示“开发环境启用 DevTools 可视入口”：当应用安装并挂载 `@gamekit/devtools-ui` 且存在 `ui` service 时，页面应自动出现 DevTools launcher。点击 launcher 打开完整 DevTools shell；DevTools shell 读取 `services.devtools` snapshot 和 UI Runtime panel metadata，不要求普通游戏手写入口。

Headless app、测试环境或没有挂载 `@gamekit/devtools-ui` 的自定义 shell 不创建可视入口，只创建 DevToolsRuntime、sources、panels 和 commands。这样 `devtools: true` 在所有环境都安全，但“自动看到按钮”只属于带 DevTools UI package 的标准浏览器启动路径。

需要裁剪时使用配置：

```ts
devtools: {
  preset: "standard",
  excludeSources: ["save"],
  options: {
    traceLimit: 500,
    diagnosticLimit: 200
  }
}
```

普通游戏只需要为自己的业务系统追加自定义 source、panel 或 command：

```ts
devtools: {
  dataSources() {
    return [
      createQuestDevToolsSource(questRuntime),
      createEconomyDevToolsSource(economyRuntime)
    ];
  },
  commands() {
    return [grantResourceDebugCommand()];
  }
}
```

标准 source 和自定义 source 的职责不同：

- 标准 source：由 App Host 根据标准服务自动提供，只关心框架级可观察性。
- 自定义 source：由游戏或工具提供，只描述业务专属状态，例如 quest、combat、economy、dialogue。

Sandbox 可以追加 Tiny Camp 专用 source，但这些 source 不应成为 DevTools Core 或标准 preset 的协议来源。

## 包拆分

DevTools 必须拆成运行时协议和 UI 实现两个包：

```txt
@gamekit/devtools
  - DevToolsRuntime
  - DataSource / Trace / Diagnostic / Profiler / Command
  - Panel metadata
  - 无 React、DOM、CSS、Tailwind、GSAP 依赖

@gamekit/devtools-ui
  - DevToolsLauncher
  - DevToolsShell
  - 标准 DevTools 面板
  - DevTools focus bridge
  - React/Tailwind/GSAP 实现细节
```

依赖方向：

```txt
app-host → devtools / ui-core
devtools-ui → devtools / ui-core / react-ui
react-ui → ui-core
devtools → core
```

边界规则：

- `@gamekit/devtools` 不 import `@gamekit/devtools-ui`、React、DOM、Tailwind、GSAP 或 shadcn/ui。
- `@gamekit/app-host` 不 import `@gamekit/devtools-ui`。App Host 只能注册 DevTools runtime、sources、panel metadata 和 UI Runtime panel definition。
- `@gamekit/react-ui` 不内置 DevTools 专用面板。它只提供通用 UI shell、panel/window/modal/focus/style 基础设施。
- `@gamekit/devtools-ui` 可以使用 `@gamekit/react-ui` 的通用基础设施，但 DevTools-specific UI 不回流进 `react-ui`。
- 普通游戏可以不安装 `@gamekit/devtools-ui`；这时仍可在 headless 或测试中使用 `@gamekit/devtools`。

## Launcher / Shell

DevTools UI package 负责可视入口和完整 shell。

Launcher 职责：

- 在开发环境默认可见。
- 通过 UI Runtime 打开或 toggle DevTools shell。
- 支持配置位置、默认可见性、快捷键和禁用状态。
- 不读取 gameplay 私有对象，只通过 DevToolsRuntime snapshot 显示摘要。

Shell 职责：

- 作为 `ui-core` panel/window/modal 打开。
- 展示标准 DevTools panel tabs。
- 管理 DevTools 内部 UI state，例如 active panel、filter、pause live update、selected trace。
- 聚焦时把 UI focus/scope 置为 `devtools` 或 `ui`，阻止 gameplay/camera input 穿透。
- 关闭时释放订阅、停止低频刷新，并恢复正常 UI focus。

建议配置形态：

```ts
devtools: {
  ui: {
    launcher: true,
    defaultOpen: false,
    hotkeys: ["F12", "Backquote"],
    panelId: "gamekit.devtools.shell"
  }
}
```

`devtools: true` 的标准 Web 默认值等价于：

```ts
devtools: {
  preset: "standard",
  ui: {
    launcher: true,
    defaultOpen: false
  }
}
```

自定义游戏 shell 可以完全替换 launcher 和 shell，只要继续通过 DevToolsRuntime snapshot、commands 和 UI Runtime focus 协议交互。

## Data Source

DataSource 是 DevTools 和各模块的边界。

```ts
export type DevToolsDataSource = {
  id: string;
  label: string;
  kind:
    | "host"
    | "platform"
    | "driver"
    | "runtime"
    | "event-bus"
    | "world"
    | "data"
    | "asset"
    | "renderer"
    | "input"
    | "camera"
    | "tca"
    | "gas"
    | "save"
    | "ui"
    | "custom";
  snapshot(ctx: DevToolsSnapshotContext): unknown;
  subscribe?(listener: DevToolsDataSourceListener): () => void;
  actions?: DevToolsCommandDefinition[];
};
```

数据源规则：

- 数据源返回稳定、可序列化或可安全展示的 snapshot。
- 数据源不返回 native handle；确需标记 native/escaped path 时只返回 id、type、capability 和 `escaped: true`。
- 数据源可以提供低频订阅，但不能要求 DevTools 每帧拉取全量状态。
- 数据源失败必须产生 diagnostic，不应让整个 DevTools snapshot 失败。
- 数据源 id 必须稳定，例如 `host`, `event-bus`, `tca`, `gas`, `renderer`, `save`。

典型数据源：

- App Host：phase、services、diagnostics、drivers、capabilities。
- GameRuntime：running、clock、modules、systems、profiler summary。
- EventBus：recent events、source、timestamp、payload summary。
- World：entity count、component summary、selected entity detail hook。
- Data：packs、types、documents、references、diagnostics。
- Asset：registered/loading/loaded/failed、groups、source summary。
- Renderer：object count、types、escaped handles、adapter capabilities。
- Input：active scope、contexts、recent actions、held actions。
- Camera：camera state、mode、target/follow summary、sync status。
- TCA：rules、trace entries、condition/action result。
- GAS：actors、abilities、effects、tags、trace entries。
- Save：slots、last operation、diagnostics、compatibility issue。

## Trace Entry

Trace Entry 是跨模块关联的基础单位。

```ts
export type DevToolsTraceEntry = {
  id: string;
  time: number;
  kind:
    | "input"
    | "event"
    | "tca"
    | "gas"
    | "world"
    | "renderer"
    | "asset"
    | "camera"
    | "save"
    | "runtime"
    | "host"
    | "ui"
    | "custom";
  label: string;
  source: string;
  severity?: "debug" | "info" | "warning" | "error";
  status?: string;
  correlationId?: string;
  parentId?: string;
  entityId?: string | number;
  actorId?: string;
  dataKey?: { type: string; id: string };
  payload?: unknown;
};
```

长期规则：

- `correlationId` 连接同一条链路，例如一次 input action、一次 ability activation、一次 save/load。
- `parentId` 表示直接因果，例如 TCA action 由某条 TCA rule trace 产生。
- payload 必须小而可安全展示；完整对象详情通过数据源 detail query 获取。
- trace buffer 使用 ring buffer，避免长时间运行导致内存增长。
- trace entry 不保存 renderer native object、DOM node、React element 或大型 binary。

## Correlation

DevTools 需要把多模块事实合并成链路：

```txt
input.action
→ EventBus event
→ TCA rule matched
→ condition pass/fail
→ action executed
→ GAS ability/effect
→ World component state change
→ Renderer command / diagnostic
→ UI cue / timeline
→ Save diagnostic where relevant
```

Correlation 优先使用显式 `correlationId`。没有显式 id 时，可以按时间窗口、actorId、entityId、event id、rule id、ability id 做弱关联，但 UI 必须标记为 inferred，不能把推断当成确定因果。

## System Profiler

System Profiler 用于回答哪些 system 在消耗时间，而不是做完整 JavaScript profiler。

```ts
export type DevToolsProfilerSample = {
  systemId: string;
  moduleId?: string;
  tick: number;
  startedAt: number;
  durationMs: number;
  tags?: string[];
};
```

聚合 snapshot 至少包含：

- system id
- module id
- 调用次数
- 最近耗时
- 平均耗时
- 最大耗时
- 最近 N 次采样趋势
- 是否高频系统
- 是否超过预算

Profiler 规则：

- 默认使用低成本 `performance.now()` 或注入 clock。
- 采样应可开关；高频详细采样默认关闭。
- profiler 不能改变 system 执行顺序或吞掉 system 错误。
- 预算只作为诊断，不自动改变 gameplay 行为。

## 面板模型

DevTools 面板 metadata 由 `@gamekit/devtools` 定义，实际渲染由 `@gamekit/devtools-ui` 或自定义工具 UI 完成，不直接耦合具体 app。

```ts
export type DevToolsPanelDefinition = {
  id: string;
  label: string;
  area?: "dock" | "modal" | "overlay" | "window";
  order?: number;
  sourceKinds?: DevToolsDataSource["kind"][];
};
```

Core 只定义 panel metadata 和数据源关系；`@gamekit/devtools-ui` 提供默认面板组件。具体游戏或 Editor 可以注册自定义面板，但自定义面板仍应通过 DevToolsRuntime 读取数据，不直接抓模块私有对象。

## MVP 面板

首轮 DevTools 应提供这些面板：

- Host Services：App Host phase、services、dependencies、diagnostics。
- Event Log：EventBus recent events、source、timestamp、payload summary。
- Trace Timeline：合并 input/event/TCA/GAS/renderer/save/runtime trace。
- TCA Trace：rule match、condition pass/fail、action result、派生 event。
- GAS Inspector：actor、attributes、tags、abilities、effects、cue。
- Entity / Component Inspector：entity、component summary、selected entity detail。
- Data Graph：DataPack、DataType、document、reference、missing reference。
- Asset Inspector：asset id、type、group、source、load state、errors、引用来源。
- Renderer Inspector：render object count、type distribution、escaped/native/direct path、capabilities。
- Input / Camera Inspector：active scope/context、recent action、held action、camera state、follow target。
- Save Inspector：slots、last operation、compatibility、contributor diagnostics。
- System Profiler：system timing summary。

这些面板是调试视图，不是 gameplay UI。游戏 UI 可以复用某些组件，但不能让 DevTools 面板状态成为游戏状态来源。

## Inspector Detail

Inspector detail 应通过数据源查询或 snapshot selector 获取，不在 trace entry 里塞完整对象。

常见 detail：

- Entity → components、actor binding、render object、data references。
- Actor → GAS definition、attributes、tags、effects、abilities、source entity。
- Data document → source pack、referencesFrom、referencesTo、validation issues。
- Asset → definition、load state、source、referencedBy。
- Render object → definition id、object type、node tree summary、adapter state summary。
- Save slot → envelope metadata、sections、compatibility、diagnostics。

Detail 查询必须可失败并返回 diagnostic。DevTools UI 不能因为某个 detail query 失败而崩溃整个面板。

## Debug Command

DevTools 可以注册显式 debug command。

```ts
export type DevToolsCommandDefinition = {
  id: string;
  label: string;
  scope: "debug" | "editor" | "test";
  destructive?: boolean;
  execute(ctx: DevToolsCommandContext, input?: unknown): void | Promise<void>;
};
```

规则：

- Debug command 必须显式显示在 UI 或测试中调用。
- 默认 gameplay 不依赖 debug command。
- destructive command 需要 UI 确认或测试显式 opt-in。
- command 执行必须进入 trace / diagnostics。
- command 不绕过模块公共 API；例如改 World 仍通过 GameWorld facade，加载存档仍通过 SaveManager。

## App Host 集成

DevTools 作为可选 App Service 进入 App Host。

推荐启动顺序：

```txt
platform
→ data
→ assets
→ drivers
→ renderer/input/ui
→ game
→ save
→ devtools
```

App Host 集成职责：

- 创建或接收 DevToolsRuntime。
- 当 `devtools: true` 时注册标准 preset data source 和 panel。
- 注册 standard service diagnostics。
- 接入 EventBus / TCA / GAS / Save / Renderer diagnostics。
- 注册 UI panel metadata where enabled。
- 在 Host snapshot 中暴露 DevTools service phase 和 summary。

DevTools 不替代 App Host diagnostics。App Host 产生 diagnostics，DevTools 负责展示、筛选、关联和解释。

## GameRuntime 集成

GameRuntime 不直接依赖 DevTools。DevTools profiler 和 trace 通过以下方式接入：

- App Host 或 test harness 包装 system execution，记录 profiler sample。
- GameModule helper 把 TCA/GAS trace store 注册为 DevTools data source。
- EventBus bridge 把低频 event 转成 DevTools trace entry。
- World detail source 通过 GameWorld facade 读取 selected entity detail。

DevTools 不能改变 system 执行顺序。profiler 包装必须保证 system 抛错仍按原路径抛出，并记录 diagnostic。

## UI 集成

DevTools UI 由 `@gamekit/devtools-ui` 提供，并复用 `ui-core` / `react-ui` 的通用能力：

- DevTools shell 是 UI panel/window，不是单独 DOM 管理体系。
- DevTools focus 使用 `devtools` 或 `ui` input scope，不能让 gameplay/camera action 穿透。
- DevTools 面板使用稳定 snapshot 和 selector，不订阅每帧大对象。
- `@gamekit/react-ui` 只提供通用 UI 基础设施，不内置 DevTools 专用面板。
- `@gamekit/devtools-ui` 提供默认 DevTools launcher、shell 和标准面板。
- 具体游戏可以注册自定义 DevTools 面板，但面板仍通过 DevToolsRuntime 读取数据。

DevTools 面板应支持：

- filter / search / pin selected object。
- pause live update。
- inspect current snapshot。
- copy small JSON summary。
- clear trace buffer。
- reduced motion。

## Sandbox 集成

Sandbox 只是 DevTools 验证面，不是 DevTools 协议来源。

Sandbox 应验证：

- Host services 面板能展示 App Host / Platform / Driver / Renderer / Input / Data / Asset / Save。
- Timeline 能关联 input → EventBus → TCA → GAS → World/Renderer。
- 选中对象能反查 entity、actor、render object、data document、asset references。
- System profiler 能显示 sandbox systems 的调用次数和耗时。
- DevTools focus 下 gameplay/camera input 不误触发。

Sandbox 专用 Tiny Camp 概念不进入 DevTools Core。

## 性能与内存

- trace buffer 必须有上限。
- profiler 默认聚合，深度采样显式开启。
- DevTools UI 默认消费 summary，detail 懒加载。
- 大 payload、binary、native handle 不进入 trace。
- 高频 world/render 状态不要每帧复制进 React；需要时使用采样、摘要或明确 pause snapshot。
- DevTools 关闭时应能注销订阅并释放 panel 和 buffer。

## 安全与隐私

- DevTools 不默认展示完整 Save payload、用户本地路径、账号 token、云同步凭据或外部文件内容。
- path、payload、diagnostic 展示应支持 redaction。
- Debug command 不能在 production build 默认暴露 destructive 操作。
- 导出 trace 时应能过滤敏感字段。

## 错误模型

DevTools diagnostic 至少包含：

- source id
- phase：subscribe / snapshot / correlate / render / command / profiler
- error code
- severity
- message
- related trace id / data source id / panel id where applicable

常见错误：

- data source snapshot failed
- data source duplicate id
- panel duplicate id
- command duplicate id
- command rejected
- unsupported detail query
- trace payload too large
- profiler sample invalid

## 最佳实践

### 模块集成

- DevTools 作为 App Service / tooling 集成，普通游戏优先使用 App Host 的 `devtools: true` 标准 preset。
- 标准浏览器应用若安装并挂载 `@gamekit/devtools-ui`，`devtools: true` 应自动出现 DevTools launcher 并能打开 shell。
- 只有业务专属状态需要通过 app profile 追加自定义 data source、panel definitions 和 debug commands。
- 各模块通过稳定 snapshot、trace store 或 diagnostics 接入 DevTools，不把私有 runtime、native handle 或第三方库对象交给 DevTools Core。
- System profiler 通过 App Host/test harness 或 runtime wrapper 接入，不能改变 system 执行顺序、错误传播或 gameplay 结果。
- DevTools UI 通过 `@gamekit/devtools-ui` mount，focus 必须进入 `devtools` 或 `ui` input scope。
- Headless 测试应能不启动 React、浏览器或 Phaser，只用 DevToolsRuntime 验证 data source、trace correlation 和 profiler。

### 模块使用

- 游戏和工具日常通过 DevToolsRuntime snapshot、trace timeline、inspector detail 和 debug command 观察系统，不直接读取模块私有字段。
- Trace entry 只记录小而可解释的事实，完整详情通过 data source 查询。
- Debug command 必须显式、可审计、可诊断；不要把正式 gameplay 逻辑依赖 debug command。
- DevTools 打开与关闭不应改变正式玩法结果。需要 pause、step、spawn、修改属性时，应作为明确 debug/editor command 执行。
- 面板状态，例如 filter、selected trace、pinned entity、paused live update，是 UI state，不进入 GameRuntime 或普通 Save payload。

## 测试要求

- DevToolsRuntime 注册/注销 data source、panel、command。
- duplicate id 报错。
- trace push、ring buffer、clear、filter。
- correlationId / parentId 链路排序。
- data source snapshot 失败生成 diagnostic，不拖垮整体 snapshot。
- profiler sample 聚合 last/avg/max/count。
- debug command 执行、拒绝、错误 diagnostic。
- App Host devtools service lifecycle。
- DevTools UI launcher 打开 shell。
- UI focus scope 阻断 gameplay input。
- Sandbox 或 headless fixture 能展示至少 EventBus、TCA、GAS、Renderer、Save、Host service 的合并链路。
