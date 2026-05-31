# MVP 阶段归档与常态开发入口

本文档不再作为“当前唯一开发状态”维护。

MVP 阶段已经结束：GameKit 已完成从空仓库到真实游戏验证应用的基础闭环。后续进入常态开发阶段，允许多个模块、应用、工具和修复并行推进。并行工作不再汇总到一个线性的阶段状态文档中，而应按工作流分别记录在任务系统、PR、ADR 或 `docs/implementation/` 下的短期执行记录中。

长期设计仍以这些文档为准：

- 项目定位和目标：`project-design.md`
- 架构边界和依赖方向：`architecture.md`
- 模块长期设计：`modules/`
- 应用长期设计：`apps/`
- 开发文档治理：`development-governance.md`
- 重大决策：`adr/`

## MVP 完成范围

MVP 的目标是证明 GameKit 能以薄内核、facade、adapter、driver、App Host 和 GameModule 协作方式支撑真实游戏验证应用，而不是只停留在服务面板或技术 demo。

MVP 已完成这些能力切片：

| 范围           | 结果                                                                                 |
| -------------- | ------------------------------------------------------------------------------------ |
| 工程基础       | pnpm workspace、Turbo、TypeScript、Vite、Vitest、oxlint、oxfmt                       |
| Core / Runtime | Registry、GameModule、GameRuntime lifecycle、clock、diagnostics                      |
| World          | World facade 与 Koota adapter，业务代码不直接依赖 Koota                              |
| EventBus       | 低频事实事件、订阅、调试订阅                                                         |
| Renderer       | 通用 RenderObject / RenderNode / RenderCommand 协议和 Phaser 映射                    |
| Driver         | Phaser Driver 统一持有 Phaser runtime，并暴露 renderer/input/asset/camera capability |
| Platform       | Web/Tauri 运行环境抽象和 service registry                                            |
| Input          | InputRouter、Action、Binding、Scope、DOM input 和 Driver input source                |
| Camera         | CameraController、坐标转换、follow、lookahead、shake 和 renderer sync                |
| Data           | 自由 DataType / entries 内容模型、引用图、验证和索引                                 |
| Assets         | AssetDefinition、AssetRef、AssetManager 和 loader adapter                            |
| App Host       | 标准 service lifecycle、profile、definition、diagnostics 和配置组合                  |
| TCA            | trigger / condition / action 规则系统和标准 GameModule helper                        |
| GAS            | actor、attribute、tag、ability、effect、cue 和可扩展 handler                         |
| UI             | UI Core + React UI runtime、panel/window/modal/focus bridge                          |
| Save           | Save manager、store、codec、migration、contributor 和 checkpoint                     |
| DevTools       | runtime source、trace、diagnostic、profiler、DevTools UI、pin surface                |
| Sandbox        | 框架验证工作台                                                                       |
| Abyss Delve    | 真实游戏验证应用：战斗、掉落、奖励、Save、Camera、DevTools 长链路                    |

MVP 最后一条完整执行记录是 `implementation/phase-15-abyss-delve.md`。该文件已经关闭，只作为历史执行证据保留，不再作为后续开发状态来源。

## 常态开发方式

常态开发以“工作流”而不是“全局阶段”组织：

- 一个 bugfix 可以只记录在 issue / PR / commit 中，不需要新增阶段文档。
- 一个模块增强若改变长期设计，必须更新对应 `modules/<module>.md`、`architecture.md` 或 ADR。
- 一个跨模块功能若需要多步执行，可以在 `docs/implementation/` 下新增短期工作流文档。
- 多个工作流可以并行存在；它们不能互相覆盖长期文档的职责。
- 工作流关闭后，稳定结论必须沉淀到长期维护文档；执行记录只保留历史证据。

## 后续候选工作流

下面是常态开发的候选方向，不表示当前唯一开发状态，也不作为完成定义来源。

| 方向                       | 关注点                                                      | 稳定设计入口                                                           |
| -------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| Editor / Tooling           | DataPack、地图、规则、资源和调试工具的编辑入口              | `apps/`、`modules/data.md`、`modules/assets.md`、`modules/devtools.md` |
| Content Package System     | 内容包加载、资源、数据、脚本、签名、版本和发布管线          | `modules/data.md`、`modules/assets.md`、未来 ADR                       |
| 3D / Three Driver          | Driver + RendererAdapter + Camera protocol 对 3D 后端的支持 | `modules/driver.md`、`modules/renderer.md`、`modules/camera.md`        |
| Abyss Delve 深化           | 更完整的游戏循环、关卡、敌人、装备、UI 和性能验证           | `apps/abyss-delve.md`                                                  |
| DevTools 深化              | Trace correlation、Inspector detail、性能归因、插件化 panel | `modules/devtools.md`                                                  |
| Save / Data / Asset 生产化 | 长期存档兼容、内容验证、资源加载策略、迁移工具              | `modules/save.md`、`modules/data.md`、`modules/assets.md`              |

## 关闭标准

MVP 阶段已关闭。后续不再向本文档追加逐阶段完成状态。

若未来出现新的大型 milestone，需要满足以下规则：

1. 先判断它是不是长期设计变化；是则更新长期文档或 ADR。
2. 若只是执行过程，创建独立 implementation 工作流文档或使用任务系统。
3. 工作流结束后，把稳定结论回填到长期文档。
4. 不把临时任务列表、TODO、当前状态复制到 `modules/`、`apps/` 或 `architecture.md`。
5. 不在本文档维护多个并行工作的实时状态。
