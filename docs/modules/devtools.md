# DevTools 模块设计

## 定位

DevTools 负责可解释性。数据驱动越多，越需要能解释运行过程。

相关包：

- `@gamekit/devtools`
- `@gamekit/react-ui`
- `@gamekit/ui-core`

## MVP 面板

- Event Log
- TCA Rule Trace
- Entity Inspector
- Component Inspector
- Actor Inspector
- Ability Inspector
- Effect Inspector
- Asset Inspector
- System Profiler
- Renderer Object Count

## Trace 模型

DevTools 需要能关联：

- EventBus event
- TCA matched rules
- condition pass/fail
- action result
- emitted follow-up events
- ECS state changes
- GAS ability/effect changes
- renderer/camera/ui cue

## System Profiler

至少记录：

- system id
- 调用次数
- 最近耗时
- 平均耗时
- 最大耗时
- 是否高频系统

## Renderer Inspector

需要展示：

- render object id
- type
- layer/depth
- visible
- parent/children
- 是否 escaped/native/direct path
- adapter capabilities

## Asset Inspector

需要展示：

- asset id
- type
- group
- source
- load state
- errors
- 被哪些 DataPack definition 引用

## 边界

DevTools 可以读取 runtime trace 和 snapshot，但不应成为 gameplay 逻辑依赖。调试开关不能改变正式玩法结果，除非明确作为 editor/debug command 执行。
