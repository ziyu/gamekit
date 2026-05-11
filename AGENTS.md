# AGENTS.md

本文件是后续所有自动化开发代理和人工协作者的仓库入口规则。开始任何实现前，先阅读本文件，再阅读 `docs/` 中对应主题。

## 必读文档

每轮开发至少检查：

- `docs/architecture.md`：确认包边界和依赖方向。
- `docs/implementation-principles.md`：确认实现原则和代码质量要求。
- `docs/best-practices.md`：确认测试、性能、模块拆分实践。
- `docs/development-stages.md`：确认当前阶段目标和完成定义。

涉及重大技术选择、包边界变化、第三方库引入、公共 API 调整时，必须新增或更新 `docs/adr/`。

## 开发规则

- 优先保持薄内核：核心包定义协议，第三方库进入 adapter。
- 不允许业务代码直接依赖 Koota、Phaser、GSAP 等底层库，除非该代码本身就是 adapter。
- `src/index.ts` 只做公共出口，不写主要实现。
- 新模块按职责拆分文件：类型、创建函数、运行时实现、adapter 私有类型、测试工具分开。
- 不提交构建产物、缓存、日志、本地环境文件。
- 不做无关重构，不回滚他人改动。

## 文档维护规则

每个阶段或较大改动结束前，必须判断是否需要更新文档：

- 公共 API 或包边界变化：更新 `docs/architecture.md`。
- 实现约束、代码质量标准变化：更新 `docs/implementation-principles.md`。
- 新形成的实践、反模式、性能经验：更新 `docs/best-practices.md`。
- 阶段完成、范围变化、下一阶段目标变化：更新 `docs/development-stages.md`。
- 高影响决策：新增 ADR，文件名格式为 `docs/adr/000X-short-title.md`。

文档不是补充材料，是项目设计的一部分。实现和文档冲突时，必须主动修正其中一方。

## 验证命令

提交前至少运行：

```bash
corepack pnpm test
corepack pnpm build
corepack pnpm lint
```

涉及 world/adapter/性能相关改动时，额外运行：

```bash
corepack pnpm bench:world
```

涉及本地前端 app 时，启动并检查页面：

```bash
corepack pnpm dev
```

## 提交流程

- 提交前查看 `git status --short`。
- 只提交与当前任务相关的文件。
- commit message 使用简短祈使句，说明实际完成的工程结果。
