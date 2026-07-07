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

## 最佳实践

### 模块集成

- World adapter 必须持续跑 conformance tests。新增 adapter 时先证明 spawn/despawn/add/get/set/remove/query/count 行为一致，再优化底层性能。
- 游戏或 App Host 集成 World 时只暴露 `GameWorld` facade 给 GameModule，不把 Koota、bitecs 或其他 ECS 后端实例传给业务层。
- Save 集成 World 时通过显式可保存组件和 entity mapping，不让 `@gamekit/world` 强行规定完整存档 schema。

### 模块使用

- 业务和游戏模块只依赖 `@gamekit/world` facade，不直接导入 Koota、bitecs 或其他 ECS 后端类型。
- ComponentDef 应表达运行时状态，不要把 DataRegistry document、AssetDefinition、renderer native handle 或 physics backend body/collider handle 直接塞进 component。
- 高频系统中优先复用 query 结果和临时对象；不要在每个 entity 更新中深拷贝、JSON 序列化、动态解析路径或触发 UI 更新。
- EntityId 是否长期稳定由游戏和 Save contributor 决定。跨 save/load、场景切换或网络同步时，用稳定业务 id 或 Save entity mapping，不依赖 ECS adapter 私有 id 语义。
- System 只处理高频状态推进；actor died、ability activated、resource delivered 等低频事实再发 EventBus，方便 TCA、UI、DevTools 和 Save 观察。
- World snapshot 用于测试和调试时应是稳定派生数据，不暴露 adapter 内部 object、query cache 或底层存储结构。
