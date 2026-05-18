# 实现原则

## 薄内核

框架核心只维护稳定协议和运行时边界。能通过成熟库完成的底层能力，应放在 adapter 中。

首轮已经验证：

- Koota 被限制在 `@gamekit/world-koota`。
- 业务代码通过 `@gamekit/world` 访问 ECS。
- Sandbox 只依赖 GameKit 的公共接口。

## Adapter 隔离

第三方库不得成为业务边界。引入库时必须回答：

- 这个库是否有对应 adapter 包或 adapter 文件夹。
- 公共 API 是否泄漏了库类型。
- 替换该库时哪些包需要改动。

若答案不清晰，先不要把库暴露到公共接口。

## 扩展/逃生口

通用架构不能接管一切。热点路径、复杂表现、平台能力和第三方生态接入需要受控 escape hatch。

要求：

- 默认路径保持稳定协议和可调试性。
- Escape hatch 必须由 adapter 创建和释放。
- Runtime 仍负责生命周期。
- 调用方必须明确知道自己进入 renderer/platform/object-specific 路径。
- DevTools 需要能标记 escaped/native/direct/custom path。
- Escape hatch 不作为默认数据驱动路径。

## 可测试优先

每个 facade/adapter 必须有契约测试。

当前规则：

- `@gamekit/world` 的实现必须通过 world conformance tests。
- `@gamekit/event-bus` 必须测试顺序、取消订阅、timestamp/source。
- `@gamekit/game-runtime` 必须测试生命周期和系统调度顺序。
- 新增 facade 必须补 conformance helper；新增 adapter 必须通过 facade 契约测试。

## 代码质量

代码质量优先级高于短期速度。任何新增实现都必须先守住可读性、边界清晰和可验证性，再考虑抽象复用。

基础要求：

- 公共 API 使用明确类型，不用 `any`、隐式结构或第三方库类型穿透包边界。
- 函数保持单一职责；当一个函数同时处理构造、校验、调度、渲染或 IO 时，应拆分。
- `src/index.ts` 只做 re-export，不承载业务实现。
- 命名应表达领域含义，避免 `manager`、`helper`、`util` 这类没有边界的兜底名称。
- 错误必须带上下文。框架层优先使用 `GameError` 和稳定 `code`。
- 不写“顺手重构”。除非当前任务需要，否则不要改动无关模块。
- 不把临时实验代码、调试输出、构建产物提交进仓库。
- 交互 UI、游戏内容 UI、Editor UI 不使用 `innerHTML`、HTML 字符串模板或 `insertAdjacentHTML` 拼接。优先使用 React/组件系统，或使用 DOM API、`textContent`、`replaceChildren` 和显式事件绑定。
- 如果确实需要渲染外部 HTML，必须限定为受信任/已清洗内容，并通过独立 helper、测试和 ADR 说明边界；不能把它作为常规 UI 构建方式。

复杂度控制：

- 新抽象必须解决真实重复或隔离真实变化点。
- 新依赖必须有明确归属：核心协议、adapter、app 示例或开发工具。
- 一个文件超过清晰阅读范围时，优先按类型、创建函数、运行时实现、adapter 私有实现拆分。
- 测试应覆盖行为契约，而不是锁死无意义的内部实现细节。

## 可解释性从第一天开始

Runtime、EventBus、TCA、GAS、Asset、Save 后续都必须产生可观察信息。第一阶段先通过 sandbox event log 验证低频事件链路。

## 模块拆分

不要把一个模块所有代码写在 `index.ts`。

拆分优先级：

1. 公共类型单独放置。
2. 创建函数和运行时实现单独放置。
3. adapter 私有类型单独放置。
4. 示例 app 的数据、模块、UI 渲染分开。
