# UI 模块设计

## 定位

UI 分为 UI Core 和 React UI。UI Core 描述窗口、弹窗、焦点、快捷键和布局状态；React UI 提供具体渲染实现和通用游戏组件。

相关包：

- `@gamekit/ui-core`
- `@gamekit/react-ui`

## 技术选型

- React
- Tailwind CSS
- shadcn/ui
- Base UI 可选
- Zustand

React 不进入主循环，不订阅每帧 ECS position。

## UI Core

职责：

- WindowManager
- ModalManager
- ToastManager
- TooltipManager
- ContextMenuManager
- ShortcutManager
- FocusManager
- LayoutManager

WindowDefinition：

```ts
export type WindowDefinition = {
  id: string;
  title: string;
  defaultSize?: { width: number; height: number };
  defaultPosition?: { x: number; y: number };
  closable?: boolean;
  movable?: boolean;
  resizable?: boolean;
  minimizable?: boolean;
  singleton?: boolean;
  layer?: UiLayer;
  tags?: string[];
};
```

## React UI

职责：

- GameShell
- WindowLayer
- ModalLayer
- ToastLayer
- TooltipLayer
- ContextMenuLayer
- Button
- Panel
- Window
- Tabs
- ScrollArea
- StatBar
- TagList
- ActorCard
- AbilityIcon
- EffectBadge
- ClueCard
- InspectorTable
- JsonView

底层 shadcn/ui 和 Base UI 不应散落到业务 app；统一封装进 `@gamekit/react-ui`。

## 与 TCA 的关系

UI action 可以由 TCA 调用：

```json
{
  "type": "ui.open_window",
  "args": {
    "window": "actor-detail",
    "props": {
      "actorId": "$event.actorId"
    }
  }
}
```

## 与 Input 的关系

UI focus、modal、text input 会影响 Input Context 和 Input Scope。

- Text input focused：阻断 gameplay hotkeys。
- Modal opened：modal context 优先。
- Window focused：Esc / Ctrl+W 等快捷键由 UI context 处理。
- Game viewport focused：gameplay/camera action 使用 `game` scope。
- UI panel focused：gameplay/camera action 不应响应，除非该 action 明确允许对应 scope。

## 状态边界

Zustand 用于：

- Window state
- Editor state
- selected entity/tile
- DevTools panel state
- debug flags
- user settings

不用于：

- ECS world state
- 每帧 position
- 大规模 component 数据
