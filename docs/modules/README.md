# 模块设计文档

本目录按模块维护最终长期设计。这里记录模块职责、边界、核心协议、adapter 策略、扩展点和长期约束。

## 职责边界

- 模块最终长期设计放在本目录。
- 跨模块依赖方向和包边界摘要放在 `../architecture.md`。
- 阶段状态和完成定义放在 `../development-stages.md`。
- 高影响决策的历史背景放在 `../adr/`。
- 已验证实践和性能经验放在 `../best-practices.md`。

模块文档不是阶段状态文档，也不是临时计划文档。禁止写入：

- 当前实现状态。
- 临时方案或过渡方案。
- 阶段计划、下一步计划、完成定义。
- TODO / backlog / milestone。
- 某次决策的历史背景。

不要把同一段模块协议复制到多个文档。其他文档需要提及时，只引用本目录对应文件。

## 模块索引

- `core-runtime.md`：Core、EventBus、GameRuntime、GameModule。
- `world.md`：World facade、ECS adapter、系统边界。
- `renderer.md`：RenderObject、RenderNode、RenderCommand、Renderer Adapter。
- `input.md`：Input Core、DOM/Phaser/Tauri input adapter、Action Mapping。
- `camera.md`：Camera Core、Camera Rig、Renderer Camera Adapter。
- `platform.md`：Platform Core、Web/Tauri adapter、权限与文件系统。
- `asset-data.md`：AssetManifest、AssetManager、DataPack、数据校验。
- `tca.md`：Trigger / Condition / Action 规则系统。
- `gas.md`：Actor、Ability、Effect、Cue、Clue。
- `ui.md`：UI Core、React UI、窗口与交互层。
- `save.md`：SaveGame、迁移、平台存储。
- `devtools.md`：Trace、Inspector、Profiler。
- `hero-road.md`：Hero Road 示例游戏验证目标。
