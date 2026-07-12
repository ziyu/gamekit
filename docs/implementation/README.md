# 实现工作流记录

本目录记录大型或跨模块工作流的执行计划、逐任务开发流程、review 记录和验收证据。它不是长期设计来源，也不是全局开发状态看板。

MVP 阶段已经关闭，历史阶段文档只作为归档证据保留。常态开发阶段允许多个工作流并行，每个工作流应独立记录、独立关闭。

## Active Workflows

- `multiplayer-package-planning.md`
- `multiplayer-outpost-siege-demo.md`

## Closed Workflows

- `multiplayer-first-usable-version.md`
- `multiplayer-demo-validation.md`
- `multiplayer-realtime-game-demo.md`
- `multiplayer-colyseus-native-lane.md`

## 职责边界

- 长期项目定位仍放在 `../project-design.md`。
- 跨模块架构边界仍放在 `../architecture.md`。
- 单个模块长期设计仍放在 `../modules/`。
- 应用长期设计仍放在 `../apps/`。
- 文档治理、状态记录和关闭规则放在 `../development-governance.md`。
- 本目录只记录某个工作流执行层面的任务拆分、任务状态、review 记录、测试证据和返工记录。

不要把长期协议、公共 API 设计或 app 玩法设定只写在本目录。若实现过程中发现长期设计需要变化，必须同步更新对应长期文档。

## 执行规则

每个 active 工作流文档应包含：

- 工作流目标和边界。
- 状态：`Active`、`Paused`、`Closed` 或 `Archived`。
- 子 Agent 分工和审查记录。
- 逐条任务拆分，每条任务都能独立开发、review、测试和提交。
- 每条任务的实现计划、完成证据、review 结果、测试命令和提交记录。
- 工作流最终验收：核心目标达成性、合理性检查、代码质量检查和完整命令结果。
- 关闭记录：稳定结论迁移到哪些长期文档，剩余问题进入哪里。

任务状态使用：

- `Planned`：已规划，尚未实现。
- `In Progress`：正在实现。
- `Review`：实现完成，正在审查。
- `Rework`：review 或测试发现问题，需要回到开发。
- `Verified`：实现、review 和测试通过。
- `Committed`：已提交。

工作流关闭后，应在文档顶部标记 `Closed` 或 `Archived`。关闭后的文档不再继续追加新需求；新需求应创建新工作流或进入任务系统。
