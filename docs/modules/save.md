# Save 模块设计

## 定位

Save 负责长期状态序列化、恢复和迁移。它不直接依赖 localStorage、Tauri FS 或具体平台 API，而是通过 Platform 抽象读写。

相关包：

- `@gamekit/save`
- `@gamekit/platform-core`

## SaveGame

```ts
export type SaveGame = {
  version: string;
  seed: string;
  time: GameTimeState;

  world: SerializedWorld;
  gas: SerializedGasState;
  tca: SerializedTcaState;
  ui?: SerializedUiState;

  custom: Record<string, unknown>;
};
```

## 保存内容

- RNG seed 和当前随机状态。
- 游戏时间。
- ECS state。
- GAS active effects / cooldown / tags / attributes。
- TCA once-rule state。
- UI 可选状态。
- 游戏自定义状态。

## 不保存内容

- Phaser / Three 原生对象。
- Renderer object native handle。
- React component state。
- 未声明可存档的临时缓存。

## Migration

需要 migration registry：

```ts
export type SaveMigration = {
  from: string;
  to: string;
  migrate(save: unknown): SaveGame;
};
```

要求：

- 未知版本给明确错误。
- 缺失 migration 给明确错误。
- 至少保留一个 migration 测试样例。

## 与 Platform 的关系

```txt
SaveSystem
→ PlatformStorage / PlatformFileSystem
→ Web / Tauri adapter
```

默认路径：

- saves：`appData/saves`
- settings：`appConfig/settings`

## 确定性

固定 seed + save/load 后，继续 tick 的结果应确定。测试应覆盖：

- save
- load
- tick continuation
- migration
- corrupted save error
