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
  timestamp: number;
  source?: string;
  originalEvent?: unknown;
};
```

## Input Action

Input action 是语义层，不是物理按键。

```ts
export type InputActionDefinition = {
  id: string;
  name: string;
  category?: string;
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
- `game.confirm`
- `tool.place_road`
- `ui.close_window`

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

## Input Router

```txt
DOM / Phaser / Touch / Gamepad Event
→ NormalizedInputEvent
→ InputManager
→ Active InputContexts
→ InputAction
→ CommandBus / EventBus / CameraController / UI Runtime
```

输入最终不直接改 world，而是生成 command 或 action。

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
