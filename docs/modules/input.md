# Input 模块设计

## 定位

Input 是独立系统，不属于 Renderer。它负责把物理输入归一化、映射为语义动作，再路由为 command 或 UI action。

相关包：

- `@gamekit/input-core`
- `@gamekit/input-dom`
- `@gamekit/input-phaser`
- `@gamekit/input-tauri`

## 为什么独立

Input 不能归 Phaser 独占，也不能散落在 React 组件中：

- 输入来源包括 Phaser、Three.js、Web、Tauri、移动端。
- 输入来源包括键盘、鼠标、触摸、手柄、UI、编辑器工具、快捷键。
- Gameplay 不应该知道 DOM event、Phaser input event 或 Tauri shortcut。
- UI focus、modal、text input、devtools 都会改变输入上下文。

## 分层

```txt
Raw Input
→ Normalized Input Event
→ Input Scope
→ Input Binding / Mapping
→ Input Action
→ Command / UI Action / Camera Action
```

## NormalizedInputEvent

```ts
export type InputDevice = "keyboard" | "mouse" | "touch" | "gamepad" | "pen" | "virtual" | "system";

export type InputPhase = "pressed" | "released" | "held" | "moved" | "scrolled" | "cancelled";

export type NormalizedInputEvent = {
  id: string;
  device: InputDevice;
  phase: InputPhase;
  code?: string;
  button?: string;
  pointerId?: string;
  x?: number;
  y?: number;
  dx?: number;
  dy?: number;
  wheelDelta?: number;
  modifiers?: {
    shift?: boolean;
    ctrl?: boolean;
    alt?: boolean;
    meta?: boolean;
  };
  scope?: InputScopeId;
  timestamp: number;
  source?: string;
  originalEvent?: unknown;
};
```

## Input Scope

Input scope 描述一个输入事件当前属于哪个交互区域或焦点域。它不是 UI 组件状态本身，而是 input-core 可以理解的稳定路由标签。

常见 scope：

- `global`：应用级快捷键。
- `game`：游戏 viewport、game canvas 或真实 gameplay 操作区域。
- `ui`：普通 UI 面板、HUD、窗口区域。
- `editor`：编辑器工具区域。
- `text-input`：文本输入焦点。
- `devtools`：调试工具区域。

scope 可以由 adapter 或 app shell 根据底层事件、焦点、active window、pointer capture、platform shortcut 状态解析。真实应用可以同时安装多个 source adapter，例如 window keyboard adapter 和 viewport pointer adapter；adapter 应允许在归一化前过滤底层事件，避免同一个 pointer / wheel event 被 window 与 viewport 两条输入源重复派发。

示例：

```ts
export type InputScopeId = string;

export type NormalizedInputEvent = {
  scope?: InputScopeId;
};
```

scope 是可选字段。没有声明 scope 约束的 action/context 可以继续接收未标记事件；声明了 scope 的 action/context 只能接收匹配 scope 的事件。

## Input Action

Input action 是语义层，不是物理按键。

```ts
export type InputActionDefinition = {
  id: string;
  name: string;
  category?: string;
  scopes?: InputScopeId[];
  defaultBindings: InputBinding[];
};

export type InputBinding = {
  device: InputDevice;
  code?: string;
  button?: string;
  modifiers?: string[];
  phase?: InputPhase;
};
```

示例 action：

- `camera.pan_up`
- `camera.zoom_in`
- `scene.click`
- `game.confirm`
- `tool.place_road`
- `ui.close_window`

Action 可以声明 `scopes`，用于限制“这个语义动作只能在哪些输入域里成立”。例如 `camera.pan_left` 通常只应该在 `game` scope 中成立，而 `debug.toggle_panel` 可以不限制或使用 `global` scope。

Action 级 scope 是防漏边界：即使某个高层 context 没有声明 scope，带 scope 限制的 action 也不会在错误输入域被触发。

## Input Context

同一个按键在不同上下文含义不同。

常见 context：

- global
- gameplay
- camera
- ui
- editor
- debug
- modal
- text-input

优先级示例：

```txt
modal > text-input > ui > editor > gameplay > camera > global
```

打开 modal 或文本输入框时，gameplay 输入应被阻断。

Context 可以声明 `scopes`，用于限制“这个上下文只参与哪些输入域的匹配”：

```ts
export type InputContext = {
  id: string;
  priority: number;
  actionIds?: string[];
  scopes?: InputScopeId[];
  capture?: boolean;
};
```

推荐组合：

- gameplay / camera context 通常绑定 `game` scope。
- modal / text-input context 通常绑定 `ui` 或 `text-input` scope，并以更高 priority 捕获输入。
- debug/global context 可以不绑定 scope，或明确绑定 `global`，由 app 决定。
- 同时使用 action scope 和 context scope，防止 action 从默认 global context 泄漏。

## Input Router

```txt
DOM / Phaser / Touch / Gamepad Event
→ NormalizedInputEvent
→ InputManager
→ Scope Filter
→ Active InputContexts
→ InputAction
→ CommandBus / EventBus / CameraController / UI Runtime
```

输入最终不直接改 world，而是生成 command 或 action。

`held` 不应依赖浏览器或操作系统的 key repeat 节奏。Source adapter 只负责发出 `pressed` / `released` / `cancelled` 等物理边沿事件；Input Router 维护 active action state，并在 Input service 的 frame tick 中以稳定帧节奏产出 `held` action。应用入口不应直接调用 InputRouter 的 held 刷新细节；如果使用 App Host，应由 `AppHost.tick()` 统一推进 Input service 和 GameRuntime。这样 camera pan、拖拽工具、蓄力技能等持续输入不会因为系统 repeat delay 或不同平台 repeat rate 变成一卡一卡的离散移动。

## 与 TCA 的关系

推荐流程：

```txt
Input Action
→ Command
→ System 校验和修改状态
→ emit gameplay event
→ TCA 响应 gameplay event
```

Input 不直接执行复杂 TCA 逻辑。

## 与 Renderer 的关系

- Renderer 可提供 view、坐标转换或 picking/hit-test capability。
- Input adapter 可以消费 renderer capability。
- Renderer 不拥有 gameplay input event。

## 与 UI 的关系

UI focus、active window、active tool 可以由 UI 状态管理，但物理输入到语义 action 的映射归 input-core。

UI 不直接改 gameplay 状态。UI 应输出焦点/scope 信号，Input adapter 或 app shell 将其转成 `NormalizedInputEvent.scope`，再由 input-core 按 action/context 规则路由。
