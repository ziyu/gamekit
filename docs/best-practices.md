# 最佳实践

## Monorepo

- 使用 pnpm workspace 管理 `apps/*` 和 `packages/*`。
- 使用 Turbo 编排 `build`、`test`、`dev`。
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
- EventBus 只用于低频事实，不用于每帧 position、sprite、pointer move 广播。

数据结构：

- 查询和规则执行需要索引，不能长期依赖全量扫描。
- adapter 可以为了第三方库兼容保留映射表，但映射关系必须由 adapter 私有维护。
- 大规模集合更新优先批处理，避免在循环里触发 UI 或外部副作用。

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
