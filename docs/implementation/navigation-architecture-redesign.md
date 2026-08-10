# Navigation Architecture Redesign

Status: Closed.

## Goal

把第一版 Navigation Core/Graph 从同步、平铺的 MVP 重构为 ADR 0036 和 ADR 0037 定义的长期结构，同时保持 App Host、AI、DevTools、test-utils、测试和 benchmark 使用同一公共协议。

长期事实来源：

- `docs/modules/navigation.md`
- `docs/adr/0036-navigation-query-and-backend-lifecycle.md`
- `docs/adr/0037-navigation-package-internal-architecture.md`

## Scope

- 拆分 Core contracts、layout、requests、routes、backend、observability、composition 和 testing。
- 将 Backend 改为 submit/poll/cancel/release，并验证 immediate/deferred completion。
- 区分独立 path 与共享 route field，增加 route release 和 progress/stuck read model。
- 增加 layout-driven backend factory、Graph layout factory、area/portal 和 agent geometry 约束。
- 迁移 App Host、AI 类型、test-utils、专项测试与 benchmark。
- 更新 Changeset，并运行定向与全仓验证。

## Review gates

- Root、`/backend`、`/testing` 导出面互不泄漏内部 registry/native identity。
- Graph、Memory 和 Deferred Backend 通过同一 conformance。
- queued 与 in-flight cancel、revision drift、partial invalidation 和 dispose retained state 有测试。
- field route 不为每个请求保留完整 point array，且 sampler 使用共享 Backend field。
- layout 可以从 Data Registry 经 factory 创建 runtime；未知 backend/source 返回稳定错误。
- 250/1,000 agent sample、request burst、blocker churn 和 cancel/dispose 通过预算。

## Closure record

2026-07-19 完成：

- Core 公共根入口、`/backend` 与 `/testing` 已拆分；Graph 已拆成 contracts/data/compiler/search/runtime/composition。
- Backend 已迁移为 submit/poll/cancel/release；deferred completion、in-flight cancel 和 stale revision retry 已验证。
- path/field 成为不同 route shape；field 使用对称 retain/release，不进入 Core 正向 cache，活动 field 不被 LRU 淘汰。
- layout/ref、Data Registry、Graph factory、area/portal 和 radius/height/slope 约束已接通。
- content validation、progress/stuck read model、Memory conformance、测试和 test-utils 已迁移。
- Graph point projection 使用编译期 KD-tree；250/1,000 agent 共享 field 采样约为 1.1–1.4 µs/sample，7 项 Navigation benchmark 预算通过。
- 全仓 build、test、lint 通过；Navigation Core/Graph 定向 build/test 通过。

提交号由后续提交流程记录；长期结论维护在模块文档与 ADR 0036/0037，不在本执行记录重复扩展。
