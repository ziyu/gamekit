# World 模块设计

## 定位

World 是 ECS facade。业务层只依赖 `@gamekit/world`，不直接依赖 Koota 或其他 ECS 库。

相关包：

- `@gamekit/world`
- `@gamekit/world-koota`
- 可替换 adapter：`@gamekit/world-bitecs`、`@gamekit/world-custom`

## 核心职责

`@gamekit/world` 定义稳定协议：

- `EntityId`
- `ComponentDef<T>`
- `defineComponent`
- `GameWorld`
- `WorldSystem`
- `WorldQuery`

核心接口：

```ts
export type GameWorld = {
  spawn(): EntityId;
  despawn(entity: EntityId): void;
  has(entity: EntityId): boolean;
  add<T extends object>(entity: EntityId, component: ComponentDef<T>, data?: Partial<T>): void;
  get<T extends object>(entity: EntityId, component: ComponentDef<T>): T | undefined;
  set<T extends object>(entity: EntityId, component: ComponentDef<T>, data: Partial<T>): void;
  remove<T extends object>(entity: EntityId, component: ComponentDef<T>): void;
  query(components?: Array<ComponentDef<any>>): EntityId[];
  count(): number;
};
```

## Adapter 边界

`@gamekit/world-koota`：

- 内部使用 Koota。
- 实现 `GameWorld`。
- 不向公共 API 暴露 Koota 类型。
- 必须通过 world conformance tests。

替换 ECS 时，业务代码不应重写。

## System 边界

高频 gameplay logic 进入 system：

- movement
- render sync
- camera sync
- input command processing
- effect duration tick

低频事实进入 EventBus：

- actor died
- road placed
- clue revealed
- ability activated

## 数据与存档

ECS runtime state 需要可序列化，但序列化不应由 `@gamekit/world` 强行规定全部格式。职责划分：

- `@gamekit/world` 提供基本遍历/组件访问能力。
- `@gamekit/save` 负责 SaveGame schema。
- 游戏模块声明哪些组件可存档、如何迁移。

## 性能原则

- 查询需要 adapter 内部优化，不能长期依赖昂贵全量扫描。
- 高频 system 避免大量临时对象。
- EventBus 不广播每帧 component patch。
- benchmark 只做趋势参考，不写死成脆弱测试。
