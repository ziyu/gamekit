# 运行时可靠性审查修复

状态：Closed

日期：2026-09-06

基准：`802e9cb`。本工作流修复整体审查中已复现的 16 组缺陷，补充输入集成和必需资源启动失败语义。实现保持原有 package/Driver/GameModule 边界，公共契约见 [ADR 0009](../adr/0009-runtime-failure-and-save-commit-contracts.md)。

## 修复与回归映射

| 审查问题                     | 最终实现                                        | 回归测试                                                                      |
| ---------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| GAS 非法周期卡死             | Data 与 Runtime 检查有限正周期、时钟推进防御    | gas.test.ts：非法周期与运行时拒绝                                             |
| 文件覆盖损坏旧进度           | 单记录临时写入 + Platform 原子替换              | save-stores.test.ts：部分写入/replace 失败保留旧数据和 summary                |
| 删除后重开复活               | 删除新记录和 legacy 副本                        | save-stores.test.ts：重开后 read/list/exists 一致                             |
| 加载半校验半恢复             | 全量选中 section 预校验后才 restore             | save-manager.test.ts：invalid/missing/version 失败无 restore                  |
| 身份和版本未验证             | app/game 身份、section id/version、迁移结果检查 | save-manager.test.ts：异应用拒绝、section 升级、错误迁移                      |
| 并发写丢索引                 | 共享平台对象的 store 修改串行化                 | save-stores.test.ts：跨包装实例并发、同槽删除/写入、失败后继续                |
| held 绕过失效 context/action | 失效时清理并通知 cancelled                      | input-router.test.ts：disable/remove/unregister/rebind/cancelAll/scopeRelease |
| held ID 持续增长             | ID 基于原始按下事件                             | input-router.test.ts：3600 帧 ID 长度受控                                     |
| 异步 Driver hook 未等待      | start/stop/dispose 顺序 await                   | app-host.test.ts：deferred gate 等待与异步拒绝                                |
| Host 重复 boot/销毁复活      | 幂等 boot、串行转换、dispose 终态               | app-host.test.ts：并发/重启/等待 boot 时 dispose                              |
| cleanup 异常中断释放         | 尽力完成反序清理并报告错误                      | app-host/game-runtime/input-router 测试：中间失败仍释放其余资源               |
| install 失败泄漏             | 反序执行此前已安装模块 cleanup                  | game-runtime.test.ts：后续 install 失败无残留订阅                             |
| 周期 tick 越过到期           | 到期前有效区间限制                              | gas.test.ts：大步进与分段推进均只扣 2 HP                                      |
| 无效目标仍消耗技能           | 提交前解析全部 effect 目标与引用                | gas.test.ts：目标缺失不扣费、不设 cooldown                                    |
| TCA once 同步重入            | 执行预留 + 成功完成标记 + finally 释放          | tca.test.ts：同步重入只一次、失败后重试                                       |
| Asset 并发重复加载           | in-flight 合并且失败可重试                      | asset-manager.test.ts：并发、同步错误与诊断回调重入                           |

额外完成：DOM blur/visibility/focusin/stop 取消按键；Abyss 文本框/DevTools scope 隔离和 DOM/Phaser 指针来源去重；标准服务的必需 preload 失败中止 boot；GAS 文档移除不存在的 stack policy 承诺。

## 验证

- 直接 Vitest：38 个文件、239 个测试全部实际执行通过；审查基准为 188 个测试。
- `corepack pnpm test`：53/53 任务通过，0 缓存命中。`corepack pnpm build`：28/28 通过，0 缓存命中；保留已有 Phaser 大 chunk 提示。`corepack pnpm lint`：53/53 通过。`corepack pnpm format`：522 个文件通过。`git diff --check` 无错误。
- World benchmark：默认 tsx IPC 被沙箱拒绝，使用 `node --import tsx scripts/world-benchmark.ts` 执行同一脚本成功。10000 entities / 5000 moving；spawn/add 9.73ms、query/update 4.80ms。单次观察，不作为稳定性能门槛。
- 浏览器：ego-browser 打开本地 Abyss。真实 KeyW 按下后角色从 y=342 移到 y=226.241；dispatch blur 后两次间隔读取 y 不变。DevTools 焦点下 KeyI 不打开背包；临时 textarea 实际接收 i 而背包不变；点击 viewport 后 KeyI 正常打开背包。Save/Load Checkpoint 分别显示 Saved/Loaded tick 3691，测试前 localStorage 已恢复，专用浏览器空间已关闭。
- 浏览器检查使用 DOM/React 状态读回；截图接口超时，未把截图列为通过证据。blur 使用浏览器事件模拟，未声称已手工验证 OS 窗口切换。
- `GAMEKITS_RELEASE_WAVE=all corepack pnpm verify:release:gamekits`：全部发布波次的外部安装和 smoke 通过，包括 test-utils smoke。离线尝试因缺少 koota tarball 失败，正常下载依赖后验证成功，未执行发布。

## 范围与限制

- Tauri 已验证 fake driver 的目录参数映射和 platform conformance；仓库没有可直接启动的 Tauri app，本轮未验证真实 Tauri 权限、OS 文件替换或断电持久性。
- 预校验成功后 contributor restore 自身失败不自动回滚；app 必须使用 staging/重建会话。跨窗口 Storage 并发和多 key 崩溃原子性不在本协议保证内。
- 审查中尚未量化的 React snapshot/热路径开销、通用 RNG/TCA 状态存储能力属于后续独立性能/协议工作，不算作这 16 组缺陷已修复的范围。本轮没有修改这些能力或声称完整 continuation 等价。

交付：修复通过 `codex/runtime-reliability-fixes` 分支进入主线；具体合并和发布证据以对应 PR 为准。长期契约已迁移到模块文档、最佳实践和 ADR 0009。
