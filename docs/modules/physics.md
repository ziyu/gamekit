# Physics 模块设计

## 定位

Physics 是统一物理 facade 和 GameModule toolkit。它负责把刚体、碰撞体、触发器、空间查询、接触事件和调试快照抽象成 GameKit 稳定协议，让游戏代码不直接依赖 Rapier、Matter.js、Phaser Physics、Box2D 或其他底层物理库。

相关包：

- `@gamekit/physics-core`
- `@gamekit/physics-rapier2d`
- `@gamekit/physics-rapier3d`
- `@gamekit/physics-matter`
- Driver 暴露的 physics backend，例如 `@gamekit/driver-phaser` 中绑定 Phaser Scene 的 Arcade / Matter physics adapter

包归属：

- `@gamekit/physics-core`：Game Module toolkit + facade，定义物理协议、标准组件、DataType、GameModule helper、trace 和 conformance helper。
- `@gamekit/physics-rapier2d` / `@gamekit/physics-rapier3d` / `@gamekit/physics-matter`：backend adapter，只把 `physics-core` 协议映射到底层库，不承载玩法规则。Rapier adapter 按物理维度分包，避免 2D 游戏默认安装 3D WASM/runtime。
- Phaser 这类把 physics 绑定在完整 scene runtime 内的后端，优先由 Driver 持有外部 runtime，再暴露 Physics backend adapter。

Physics 不是 App Host 默认标准服务。物理模拟需要 world、tick、entity binding、gameplay filter、save contributor 和 session lifecycle，应通过 `createPhysicsModule(...)` 这类标准 GameModule helper 安装。App Host 或 profile 可以提供 backend factory、driver adapter、DataRegistry、DevTools 和 SaveManager，但不直接拥有 gameplay physics scene。

使用 configured App Host 时，可以通过 `profile.standard.game.standardModules.physics` 声明 backend、scene、handle、interpolation store、bindings 和 trace policy。App Host helper 只解析这些 profile value 并调用 `@gamekit/physics-core` 的 `createPhysicsModule(...)`；live scene、fixed step、World sync 和 cleanup 仍完全属于 Physics GameModule。

## 非目标

- 不从零实现完整物理引擎。
- 不把某个物理库的类型泄漏到可复用 gameplay、Data、Save 或 public facade。
- 不让 Renderer、Input 或 Camera 承担 gameplay 碰撞判定。
- 不把伤害、阵营、仇恨、投射物 owner、pierce、hit/hurt rule 等玩法语义写进 Physics Core。
- 不把 pathfinding、navmesh、steering、AI avoidance 做成 Physics 首层职责。
- 不承诺所有 backend 都具备 bit-level determinism、网络 rollback 或 lockstep 能力。

## 分层

```txt
GameModule / gameplay system
→ PhysicsModule
→ PhysicsScene / PhysicsBackendAdapter
→ Rapier / Matter.js / Phaser Physics / future backend

DataRegistry
→ physics.body / physics.collider / physics.material definitions
→ PhysicsModule materialization

World
→ physics components / transform / velocity binding
→ Physics sync systems

DevTools / Save
→ physics snapshot / contributor / trace
```

Physics Core 保持薄协议。成熟库负责底层 broadphase、solver、constraint 和 shape implementation；GameKit 负责稳定 id、World integration、Data materialization、EventBus 边界、Save contributor 和可解释 trace。

客户端物理预测使用同一分层：`createPhysicsBodyPredictionTransition(...)` 持有一个 backend-owned speculative scene，从 rollback state 同步单个 subject body，应用调用方声明的 input patch，再按 fixed sub-step 写回 predicted state。它用有界 sequence before/after checkpoint 复用基线一致的 replay，不重复移动或 step 当前 solver scene；只有 cache miss 才真正 rewind/replay。它不拥有 authority、ack、renderer 或玩法规则；Multiplayer Core 只通过通用 transition factory 管理 predict/replay/dispose lifecycle，并只读透传 diagnostics。`createPhysicsLayoutDefinitions(...)` 让 World layout 与 speculative scene 复用同一 body/collider definition 解析和 stable id 规则。

## 核心模型

Physics Core 的长期公共模型：

```ts
export type PhysicsSceneId = string;
export type PhysicsBodyId = string;
export type PhysicsColliderId = string;
export type PhysicsMaterialId = string;

export type PhysicsDimension = "2d" | "3d";

export type PhysicsVector = {
  x: number;
  y: number;
  z?: number;
};

export type PhysicsQuaternion = {
  x: number;
  y: number;
  z: number;
  w: number;
};

export type PhysicsRotation = number | PhysicsVector | PhysicsQuaternion;

export type PhysicsBodyKind = "static" | "dynamic" | "kinematic";

export type PhysicsBodyDefinition = {
  id?: PhysicsBodyId;
  kind: PhysicsBodyKind;
  position?: PhysicsVector;
  rotation?: PhysicsRotation;
  linearVelocity?: PhysicsVector;
  angularVelocity?: PhysicsRotation;
  gravityScale?: number;
  damping?: { linear?: number; angular?: number };
  lockedAxes?: string[];
  userData?: Record<string, unknown>;
};

export type PhysicsColliderDefinition = {
  id?: PhysicsColliderId;
  bodyId?: PhysicsBodyId;
  shape: PhysicsShapeDefinition;
  material?: PhysicsMaterialId;
  sensor?: boolean;
  filter?: PhysicsCollisionFilter;
  offset?: { position?: PhysicsVector; rotation?: PhysicsRotation };
  userData?: Record<string, unknown>;
};
```

`PhysicsVector.z` 和 `PhysicsQuaternion` 只在 3D backend 中有意义。2D backend 必须忽略或拒绝不支持的 3D 字段，并通过 diagnostic 给出明确错误。Core 不用不同类型层级强迫所有游戏同时接受 2D/3D 复杂度。

## Shape 与 Material

Physics Core 只定义常见、可映射、可保存的 shape envelope：

```ts
export type PhysicsShapeDefinition =
  | { type: "circle"; radius: number }
  | { type: "box"; width: number; height: number; depth?: number }
  | { type: "capsule"; radius: number; height: number }
  | { type: "sphere"; radius: number }
  | { type: "polygon"; points: PhysicsVector[] }
  | { type: "polyline"; points: PhysicsVector[] }
  | { type: "mesh"; assetId: string; convex?: boolean }
  | { type: "custom"; backend: string; props: Record<string, unknown> };

export type PhysicsMaterialDefinition = {
  id: PhysicsMaterialId;
  friction?: number;
  restitution?: number;
  density?: number;
  combine?: {
    friction?: "min" | "max" | "multiply" | "average";
    restitution?: "min" | "max" | "multiply" | "average";
  };
};
```

复杂 backend 专属 shape 可以通过 `custom` 或 backend native path 使用，但 `custom` 不能进入通用 conformance 测试，也不能成为可复用 gameplay module 的默认依赖。

Shape envelope 的长期语义必须稳定：

- `circle` / `sphere` 使用 radius。
- `box` 使用完整宽高深，不使用 half extents 作为公共协议。
- `capsule` 使用 radius 和轴向高度；2D backend 默认沿本地 Y 轴，3D backend 必须通过 offset rotation 或 backend capability 声明支持的轴向。
- `polygon` / `polyline` 是 2D 几何；3D 几何使用 `mesh` 或 backend native path。
- `mesh` 只引用 asset id，不把顶点缓存、BVH 或 native mesh handle 写进 Data / Save。
- `custom` 必须标明 backend id，且只能被显式依赖该 adapter 的 app、Editor 后端工具或 DevTools plugin 使用。

Shape 只描述空间占用，不描述 damage、team、hitbox/hurtbox、projectile owner、selection rule 或 interaction channel。这些玩法语义应放在游戏 DataType、GAS/TCA 或 gameplay component 中，再通过 physics query/contact 返回的稳定 body/collider/entity id 关联解释。

## Collision Filter / Layer Matrix

Physics Core 提供统一的 collision filter envelope：

```ts
export type PhysicsCollisionFilter = {
  groups?: string[];
  collidesWith?: string[];
  categoryBits?: number;
  maskBits?: number;
};
```

语义约束：

- `groups` / `collidesWith` 是面向 Data、Editor 和设计工具的语义层名。
- `categoryBits` / `maskBits` 是低层可移植位掩码，适合生成代码、性能敏感配置和 backend 直接映射。
- 同时提供语义名和 bit mask 时，bit mask 是最终低层表达；语义名仍可保留给 DevTools 和 trace 显示。
- 未注册的 group 名必须产生 diagnostic，不能静默映射成 0。
- Sensor / trigger 只改变接触求解和事件语义，不改变 layer/mask 是否匹配。是否查询 sensor 由 query option 单独控制。

Scene 或 profile 可以提供 layer registry 与 collision matrix：

```ts
export type PhysicsLayerDefinition = {
  name: string;
  bit?: number;
  collidesWith?: string[];
};

export type PhysicsCollisionMatrix = {
  layers: PhysicsLayerDefinition[];
  defaultLayer?: string;
};
```

Layer matrix 是物理空间过滤规则，不是玩法阵营系统。team/faction、damage channel、owner ignore、ability target rule 等可以在游戏层编码为 Data/component，并在 query/contact 结果返回后解释；只有确实需要进入 broadphase/narrowphase 裁剪的部分才映射到 physics filter。

Runtime 还可以提供局部 pair 过滤能力，例如 query 的 `ignoreBodies` / `ignoreColliders`，或 backend 支持的 body pair disable。此类 override 必须是显式命令或 query option，不能通过 EventBus 高频广播。

## Backend Adapter

```ts
export type PhysicsBackendAdapter<TNative = unknown> = {
  id: string;
  kind: string;
  dimension: PhysicsDimension;

  createScene(config: PhysicsSceneConfig): PhysicsScene<TNative>;
  capabilities(): PhysicsBackendCapabilities;
};

export type PhysicsScene<TNative = unknown> = {
  id: PhysicsSceneId;

  createBody(definition: PhysicsBodyDefinition): PhysicsBodyId;
  updateBody(id: PhysicsBodyId, patch: PhysicsBodyPatch): void;
  destroyBody(id: PhysicsBodyId): void;

  createCollider(definition: PhysicsColliderDefinition): PhysicsColliderId;
  updateCollider(id: PhysicsColliderId, patch: PhysicsColliderPatch): void;
  destroyCollider(id: PhysicsColliderId): void;

  step(delta: number, options?: PhysicsStepOptions): PhysicsStepResult;

  getBodyState(id: PhysicsBodyId): PhysicsBodyState | undefined;
  getColliderState(id: PhysicsColliderId): PhysicsColliderState | undefined;

  query(query: PhysicsQuery): PhysicsQueryResult[];
  snapshot(): PhysicsSceneSnapshot;
  native?(): TNative;
  dispose(): void;
};
```

Adapter 规则：

- Adapter 持有 backend 私有对象、handle map、broadphase cache 和 solver state。
- Adapter 不直接读取游戏业务组件，不执行 damage、ability、quest 或 score 逻辑。
- Adapter 不把 backend body/collider object 存进 World component、Data document 或 Save payload。
- Adapter diagnostic 必须能定位 body id、collider id、backend kind、phase 和错误码。
- 需要 WASM 或异步 boot 的 backend 应由 adapter package 暴露 async factory 或由 app/profile 预初始化；`PhysicsScene` facade 本身保持同步 create/step/query/dispose。
- Rapier 这类官方 2D / 3D 分包的 backend 应在 GameKit adapter 层保持同样拆分；共享语义沉淀到 `physics-core`，dimension-specific shape、rotation、query 和 native path 留在各自 adapter 包。
- 3D backend 可以把 `PhysicsRotation` 的 vector 形式解释为 Euler radians，并把 quaternion 作为无损 state/native round-trip；2D backend 可以把 number 解释为平面角度并拒绝 quaternion。
- Backend native path 只允许 app-specific gameplay integration、Editor 后端工具或 DevTools backend plugin 显式依赖具体 adapter 包时使用。
- Backend capability 必须声明支持的 shape、query family、trigger interaction、filter 映射、result ordering、rotation support 和 native path。公共 API 遇到不支持的能力时应返回明确 diagnostic 或抛出 GameKit error，不能以近似语义静默降级。

## GameModule 集成

标准 Physics module 负责把 World 与 PhysicsScene 连接起来：

```txt
before physics step
→ 读取 World physics components / transform / velocity / command
→ 创建、更新、销毁 backend body/collider
→ 应用 kinematic target、force、impulse、gravity override

physics step
→ backend.step(fixedDelta)
→ 收集 contact enter/exit、trigger、query result 和 diagnostics

after physics step
→ 把 body transform / velocity 写回 World component
→ 发低频 contact enter/exit EventBus fact
→ 写 physics trace / profiler span
```

推荐 helper：

```ts
export type PhysicsModuleOptions = {
  backend: PhysicsBackendAdapter | PhysicsBackendFactory;
  scene: PhysicsSceneConfig;
  handle?: PhysicsHandle;
  interpolationStore?: PhysicsInterpolationStore;
  bindings: PhysicsWorldBindings;
  eventPolicy?: PhysicsEventPolicy;
  save?: PhysicsSaveOptions;
  trace?: PhysicsTraceOptions;
};

export function createPhysicsModule(options: PhysicsModuleOptions): GameModule;
```

Physics module 跟随 GameRuntime lifecycle。`stop()` 后不继续 step；`dispose()` 必须释放 backend scene、订阅、body/collider handle map、query cache 和 trace buffer。

### Fixed-step presentation interpolation

Physics module 可以绑定由组合层创建的 `PhysicsInterpolationStore`，为 Renderer 和 follow camera 提供 previous/current fixed-step transform 与当前 accumulator alpha。Store 只跟踪会从 backend 同步回 World 的动态 body；static body、`syncFromWorld` body 和 gameplay authority 不读取该表现状态。

默认 policy 对 position/vector 做线性插值、对 2D number rotation 做最短角插值、对 quaternion 做归一化线性插值。需要 step/snap、定制曲线或识别 teleport 等不连续状态时，组合层可以在创建 store 时注入 `policy.interpolate` 和 `policy.shouldResetHistory`；回调输入是深只读 history view，避免扩展代码污染 store 内部缓存。Physics Core 不内置游戏单位、移动速度或 teleport 阈值。自定义 interpolator 仍只能产生 transient presentation transform，不能改变权威 state。

`sample(bodyId, target?)` 支持 caller-owned reusable target，避免 transform hot path 每帧分配。World、PhysicsScene、Save、multiplayer snapshot 和 query 始终使用 fixed-step 后的权威 transform；checkpoint restore、body removal 和 module dispose 必须清理或重置插值历史。远端网络 snapshot interpolation 属于 Multiplayer presentation buffer，不由这个 store 代替。

## Physics Handle 与依赖注入

`createPhysicsModule(...)` 是一局游戏内 live `PhysicsScene` 的唯一 owner。它负责创建 scene、推进 fixed step、同步 World、发 contact event、写 trace，并在 GameRuntime dispose 时释放 backend scene。业务模块、AI、Combat、交互选择、placement preview 和 Editor 工具不应各自创建新的 `PhysicsScene` 来做查询。

为了让其他 GameModule 使用同一个 scene，Physics Core 可以提供一个可注入的 handle / facade。组合层为每个 physics scene 创建一次 handle，并把同一个 handle 同时传给 `createPhysicsModule(...)` 和需要物理查询的 gameplay module：

```ts
const worldPhysics = createPhysicsHandle();

const modules = [
  createPhysicsModule({
    backend,
    scene: { dimension: "2d", gravity: { x: 0, y: 9.8 } },
    handle: worldPhysics
  }),
  createCombatModule({ physics: worldPhysics }),
  createAiModule({ physics: worldPhysics })
];
```

Handle 只暴露窄接口，不拥有 scene，也不 boot backend：

```ts
export type PhysicsQueries = {
  query(query: PhysicsQuery): PhysicsQueryResult[];
  queryPoint(point: PhysicsVector, options?: PhysicsQueryOptions): PhysicsQueryResult[];
  raycast(
    origin: PhysicsVector,
    direction: PhysicsVector,
    options?: PhysicsQueryOptions & { maxDistance?: number }
  ): PhysicsQueryResult[];
  shapeCast(
    shape: PhysicsShapeDefinition,
    position: PhysicsVector,
    direction: PhysicsVector,
    options?: PhysicsQueryOptions & {
      maxDistance?: number;
      rotation?: PhysicsRotation;
      stopAtPenetration?: boolean;
      targetDistance?: number;
    }
  ): PhysicsQueryResult[];
  overlapShape(
    shape: PhysicsShapeDefinition,
    position: PhysicsVector,
    options?: PhysicsQueryOptions & { rotation?: PhysicsRotation }
  ): PhysicsQueryResult[];
  checkOverlap(
    shape: PhysicsShapeDefinition,
    position: PhysicsVector,
    options?: PhysicsQueryOptions & { rotation?: PhysicsRotation }
  ): boolean;
  checkCollision(colliderId: PhysicsColliderId, options?: PhysicsQueryOptions): boolean;
  queryBounds(bounds: PhysicsBounds, options?: PhysicsQueryOptions): PhysicsQueryResult[];
  snapshot(): PhysicsSceneSnapshot;
};

export type PhysicsHandle = PhysicsQueries & {
  captureCheckpoint(): PhysicsRuntimeCheckpoint;
  restoreCheckpoint(
    checkpoint: PhysicsRuntimeCheckpoint,
    options?: PhysicsCheckpointRestoreOptions
  ): void;
  isBound(): boolean;
};

export function createPhysicsHandle(): PhysicsHandle;
```

`createPhysicsModule(...)` 在 install 时把 handle 绑定到自己创建的 scene 和 checkpoint controller，在 dispose 时解绑。Handle 在未绑定、已 dispose 或重复绑定时必须给出明确 `GameError`，不能静默创建 fallback scene。测试可以向业务模块注入 fake `PhysicsQueries`，不需要启动 Rapier 或真实 backend。

依赖注入优先使用显式 module options：

```ts
createTargetingModule({
  physics: worldPhysics,
  teamRules,
  eventBus
});
```

App Host/profile 可以持有 physics handle、backend factory、layer registry 和 DataRegistry，用于组合标准 GameModule；但 App Host 不直接持有 live gameplay `PhysicsScene`。若一个 app 确实需要多个物理场景，应创建多个具名 handle，例如 `worldPhysics`、`previewPhysics`、`serverValidationPhysics`，并让每个 handle 只绑定一个 owner module。

## World 边界

World 是 gameplay runtime state 的稳定集成面；PhysicsScene 是底层模拟状态。

Physics Core 可以提供标准 component definition 或 component helper，例如：

- `PhysicsBodyComponent`
- `PhysicsColliderComponent`
- `PhysicsVelocityComponent`
- `PhysicsForcesComponent`
- `PhysicsContactsComponent`
- `PhysicsTransformBindingComponent`

长期规则：

- `EntityId` 与 `PhysicsBodyId` 不强制相同。绑定关系由 Physics module 私有 map 或显式 component 维护。
- Dynamic body 在一次 physics step 内由 backend 推进；step 后把稳定 transform / velocity 写回 World。
- Kinematic body 的目标位置、移动意图或速度可以由 World system 写入，再由 Physics module 应用到 backend。
- Static collider 可以由 Data / map / level module 物化，不需要成为 gameplay actor。
- World component 不保存 backend body object、collider handle、manifold、broadphase cache 或 solver private state。

Renderer sync 应读取 World 中同步后的 transform，或读取 Physics module 提供的稳定 snapshot；不要直接从 renderer native object 或 physics backend handle 推导 gameplay 权威状态。

## DataType

Physics Core 可以注册内置 DataType：

- `physics.material`
- `physics.body`
- `physics.collider`
- `physics.scene`
- `physics.layout`

这些类型只描述可重建配置，不表达具体玩法业务语义。

`physics.layout` 是关卡或场景的 companion gameplay data：它引用 `physics.body` / `physics.collider` prototype，并用稳定 instance id、transform 和可选 body/collider override 描述批量静态或动态几何。Body override 不重复定义 instance position/rotation，只覆盖 prototype 的 kind、damping、gravity、velocity 或 user data；布局坐标始终只有一个来源。2D bounds 不带 z，3D bounds 必须同时提供有效的 min/max z。`createPhysicsLayoutModule(...)` 负责在 GameRuntime install 时把布局物化为标准 World physics components，并只清理自己创建的 entity。它不读取纹理像素、不依赖 Renderer，也不把图片、tilemap 或具体 backend handle 放入 Physics Core。

同一 layout body 可以承载多个 collider instance。墙体、掩体等静态场景几何应优先批到少量 static body 上，保留独立 collider id 供 query/contact/DevTools 使用，避免为了每个矩形创建一个刚体。动态对象仍应使用独立 body entity。

示例：

```ts
export type PhysicsBodyData = {
  kind: PhysicsBodyKind;
  colliders?: Array<DataRef<"physics.collider">>;
  material?: DataRef<"physics.material">;
  tags?: string[];
};
```

游戏可以在自定义类型中引用 physics 定义：

```ts
export type MonsterArchetype = {
  actor: DataRef<"gas.actor">;
  renderObject: DataRef<"render.object">;
  physicsBody: DataRef<"physics.body">;
};
```

DataRegistry 只负责校验引用和字段；Physics module 负责在 runtime 中把 definition 物化成 body/collider。游戏自己的 hitbox/hurtbox、阵营、可命中规则、投射物 owner、pierce 和 damage channel 仍属于游戏或 GAS/TCA 数据，不进入 Physics Core。

## Contact 与 EventBus

Physics 是高频系统，EventBus 只能承载低频事实。

允许进入 EventBus 的事实：

- `physics.contact.enter`
- `physics.contact.exit`
- `physics.trigger.enter`
- `physics.trigger.exit`
- `physics.body.sleep`
- `physics.body.wake`

不进入 EventBus 的内容：

- 每帧完整 contact manifold。
- 每帧 position / velocity patch。
- broadphase pair cache。
- backend private collision object。
- 大规模 query result 全量广播。

需要连续碰撞信息的系统应通过 PhysicsScene query、PhysicsContactsComponent 或 Physics module 的窄 snapshot 读取。Contact event 必须包含稳定 body/collider/entity id 和 filter metadata，不能携带 backend native handle。

## 空间查询

Physics Core 提供统一 query envelope。`scene.query(query)` 是最低层稳定入口，便捷 helper 只能包装该入口，不能引入另一套语义。

```ts
export type PhysicsQuery =
  | PhysicsPointQuery
  | PhysicsRaycastQuery
  | PhysicsShapeCastQuery
  | PhysicsOverlapQuery
  | PhysicsCheckQuery
  | PhysicsBoundsQuery;

export type PhysicsQueryOptions = {
  filter?: PhysicsCollisionFilter;
  triggerInteraction?: "use-scene" | "include" | "exclude" | "only";
  mode?: "any" | "closest" | "all";
  sort?: "none" | "distance";
  maxResults?: number;
  ignoreBodies?: PhysicsBodyId[];
  ignoreColliders?: PhysicsColliderId[];
  includeBodies?: PhysicsBodyId[];
  includeColliders?: PhysicsColliderId[];
};

export type PhysicsQueryResult = {
  colliderId: PhysicsColliderId;
  bodyId?: PhysicsBodyId;
  entityId?: EntityId;
  point?: PhysicsVector;
  normal?: PhysicsVector;
  distance?: number;
  fraction?: number;
  inside?: boolean;
  sensor?: boolean;
};
```

查询族：

- `point`：测试一个点命中的 collider，常用于鼠标拾取、placement preview 和 Editor 选择。
- `raycast`：从 origin 沿 direction 查询到 `maxDistance`，对应常见 Raycast / Linecast。
- `shape-cast`：把 box、circle/sphere、capsule 或其他支持的 shape 沿方向 sweep，覆盖 SphereCast、BoxCast、CapsuleCast 等用例。
- `overlap`：在 position / rotation 放置 shape，返回重叠 collider，覆盖 OverlapSphere、OverlapBox、OverlapCapsule 等用例。
- `check`：只回答 boolean 的 overlap / pair test，可由 backend 走 no-allocation 快速路径。
- `bounds`：AABB / bounds 查询，用于大范围候选集、Editor 框选和 DevTools。

查询 option 规则：

- `filter` 使用与 collider collision 相同的 layer/mask 语义。
- `triggerInteraction` 明确 sensor/trigger 是否参与查询；不要用碰撞 layer 隐式表达 trigger 规则。
- `mode: "any"` 可以在第一个有效命中后停止，适合 line of sight、ground check、placement check。
- `mode: "closest"` 返回最近命中；backend 不支持 closest fast path 时可以用 all + sort 实现，但必须在 capability 中声明。
- `mode: "all"` 返回所有命中；`sort: "distance"` 要求 adapter 归一化排序，否则保持 backend/native 顺序并在 capability 中声明。
- `maxResults` 是上限，不是分页协议。需要分页或 streaming 的 Editor 工具应使用 adapter native path。
- `ignoreBodies` / `ignoreColliders` 常用于忽略发起者、当前拖拽物或已知友方 collider；它们不改变 scene-level collision matrix。

Query result 只返回稳定 id 和归一化几何信息。Backend native hit、manifold、feature id、triangle id 和内部 collider handle 只能通过 adapter native path 暴露。

查询可以被 gameplay、Editor、AI、targeting、placement preview 和 DevTools 使用。高频查询结果不进入 EventBus；需要观察 query 行为时使用 trace sampling 或 DevTools pull snapshot。

Core 可以提供便捷 helper，例如 `raycast(...)`、`shapeCast(...)`、`overlapShape(...)`、`checkOverlap(...)`、`checkCollision(...)` 和 `queryBounds(...)`。这些 helper 必须薄包装 `PhysicsQuery`，以保证 backend conformance tests 能覆盖同一条协议路径。

GameModule 内部需要做 targeting、line of sight、ground check 或 placement validation 时，应通过依赖注入得到 `PhysicsQueries` / `PhysicsHandle`，不要 import adapter 包、访问 backend native object，也不要为了查询创建新的 scene。业务模块可以在查询结果返回后结合 GAS/TCA/Data/component 解释 team、damage channel、owner ignore 和 ability target rule。

## Backend 与 Driver

Rapier、Matter.js、Box2D 这类独立物理库通常是 Physics backend adapter，不是 Driver。它们只拥有 physics scene，不拥有 renderer/input/camera/asset runtime。

Phaser Physics 不同：Arcade / Matter physics 绑定在 Phaser Game / Scene runtime 内。它应由 `@gamekit/driver-phaser` 持有 Phaser runtime，再从同一个 runtime slice 暴露 Physics backend adapter。该 adapter 不创建 `Phaser.Game`，也不把 Phaser Scene 交给可复用 gameplay module。

Three.js 本身不是物理引擎。Three Driver 不应为了 3D 物理直接承担 physics solver；如果 3D app 使用 Rapier、Cannon、Ammo、Jolt 或其他后端，应通过 Physics backend adapter 接入，再由 presentation layer 同步到 Three render object。

## Save 边界

Physics 可以提供 `createPhysicsSaveContributor()`，但 Save payload 只能保存可恢复的稳定状态：

- body id / stable entity mapping。
- body kind、transform、velocity、sleep state。
- collider definition id、runtime enabled state、sensor/filter state。
- 需要长期恢复的 joint / constraint 状态。

不保存：

- backend native handle。
- broadphase、narrowphase、manifold、solver cache。
- transient interpolation state。
- debug draw buffers。
- query cache、contact pair cache。

Load 时应先恢复 World entity，再由 Physics contributor 重建 backend scene。若 body id 在 load 后重映射，Physics contributor 必须使用 Save restore context 的 entity mapping。

标准 Physics checkpoint 还保存 fixed-step accumulator，保证半步保存后可以从同一模拟边界续跑。Restore 先销毁 module-owned backend body/collider 与反向索引，再恢复稳定 World component；下一次 physics system tick 从 World 重建 scene。Contacts、trace、native id、active pair 与 solver cache 均不恢复。

## DevTools 与 Trace

Physics 必须从一开始提供可解释入口：

- Physics scene snapshot：body/collider count、dimension、backend kind、gravity、fixed step、active/sleeping summary。
- Presentation interpolation snapshot：alpha、fixed delta、tracked body count；不展开每个 body 的逐帧 transform。
- Body / collider detail：entity binding、definition id、shape summary、material、filter、last transform。
- Contact trace：enter/exit、sensor、filter、entity ids、correlation id。
- Query trace：query type、filter、hit count、duration、caller source。
- Performance：step duration、sync duration、created/destroyed body count、query cost。

DevTools Core 不接收 backend native handle。Backend-specific DevTools plugin 可以显式依赖 adapter 包读取更深的 native summary，但必须保持可选。

Physics trace store 可以配置轻量 entry hook，由 App Host 或 app-specific composition 映射到 DevTools correlation source。Hook 和 error reporter 的异常会被 store 隔离，不能中断 step、contact 或 query 结果。Physics entry 只传播调用方明确提供的 `correlationId` / `parentId`；core 不根据 entity、contact 时间或 collider id 推断 combat 因果，通用 DevTools 映射也不默认透传任意 `payload`。

## Determinism

Physics module 应默认使用 fixed timestep 和稳定 system order，减少不同 frame delta 带来的差异。

长期规则：

- Physics step 使用固定 `fixedDelta`，外部 Host tick delta 只用于 accumulator。
- Presentation 可以读取 accumulator alpha 做 transient interpolation，但不能把插值结果写回 World 或用于 gameplay decision。
- 同一 tick 内的 create/destroy/update 顺序应稳定。
- Contact event 排序应按稳定 body/collider id 或 backend-provided pair id 归一化。
- Backend snapshot 只承诺 GameKit 层稳定字段，不承诺 native memory layout。
- 只有 backend 明确声明 deterministic profile 时，游戏才能把它用于 rollback / lockstep 级别的确定性假设。

## 测试要求

`@gamekit/physics-core` 必须提供 conformance helper。新增 backend adapter 时至少覆盖：

- scene lifecycle、dispose cleanup。
- create/update/destroy body。
- create/update/destroy collider。
- fixed step 后 transform / velocity 行为。
- fixed step 间的 presentation sample、最短角/向量/quaternion 插值、reusable target 和 dispose/reset cleanup。
- static / dynamic / kinematic 基本语义。
- sensor 与 solid contact enter/exit。
- collision filter。
- point / raycast / shape cast / overlap / check / bounds query。
- query trigger interaction、filter、ignore list、closest/all/any mode 和 result ordering。
- body/collider id 与 entity binding。
- 大量 contact 的 entity mapping 使用 body/collider 反向索引，query 次数不随 contact 数量增长。
- entity despawn、body/collider component 移除或 disabled 后释放 backend handle 和反向索引。
- snapshot 不暴露 native handle。
- Save capture/restore 可重建 scene。

Adapter 专属测试再覆盖底层库能力，例如 Rapier WASM 初始化、Phaser Scene 绑定、Matter compound body 等。

## 最佳实践

### 模块集成

- Physics 作为 GameModule 集成，随 GameRuntime tick 推进；不要把 gameplay physics scene 默认注册成 App Host standard service。
- 使用 App Host 标准组合时优先声明 `standardModules.physics`；需要自定义安装顺序或多 scene 时，仍可在 `game.modules` 中直接调用 `createPhysicsModule(...)`。
- App Host/profile 可以准备 backend factory、driver physics adapter、DataRegistry、SaveManager 和 DevToolsRuntime，但 Physics scene 生命周期跟随 GameRuntime。
- 组合层为每个 live physics scene 创建一个具名 `PhysicsHandle`，并把它同时注入 `createPhysicsModule(...)` 和需要查询的 gameplay module；handle 不拥有 scene，只由 Physics module 绑定和解绑。
- 需要平滑本地物理表现时，由组合层创建一个 `PhysicsInterpolationStore` 并通过 `standardModules.physics.interpolationStore` 或直接 module option 注入 Physics module，同时注入 Renderer sync 和 camera target resolver；不要在游戏、Renderer 或 Camera 中各自维护 previous transform 与 accumulator。
- 只有应用组合层知道的移动尺度、teleport 语义或表现曲线应通过 interpolation policy 注入；Physics Core 只提供默认数学策略和 history lifecycle，不写死游戏阈值或对象类别。
- 独立物理库进入 `physics-*` adapter 包；绑定完整外部 scene runtime 的物理能力由对应 Driver 暴露 runtime slice。
- Physics module 的 World sync 顺序必须明确。常见顺序是 input/AI 写意图，physics step 推进，再把 transform/velocity 写回 World，最后 renderer sync。
- Physics module 在 World sync 时维护 body/collider handle 到 entity 的反向索引，并在 component disabled、entity despawn 或 handle replacement 时释放 stale backend handle；contact 热路径不能为每个 contact 扫描 World。
- 场景几何通过 `physics.layout` + `createPhysicsLayoutModule(...)` 物化；layout module 与 Physics module 使用同一组 World component binding，并安装在 Physics step module 之前。每个 module 只清理自己创建的 entity，不以全量 World despawn 代替 lifecycle ownership。
- Authority 使用物理 solver 且客户端启用 rollback prediction 时，通过 `createPhysicsBodyPredictionTransition(...)` 创建每个 binding 独立的 speculative scene；backend 在 app/profile 层初始化，transition 只接收 `PhysicsBackendAdapter`。使用 `createPhysicsLayoutDefinitions(...)` 复用权威 layout，不复制 collider placement；通过 `maxCachedFrames` 约束 sequence checkpoint，观察 `cachedReplays`、`replayCacheMisses` 和 `cachedFrames`。Multiplayer managed replication 负责 transition 的创建、诊断透传和释放。
- 新 backend 先通过 physics conformance tests，再补 backend-specific behavior test。真实 canvas 或 Phaser Scene 只用于少量集成测试。
- 改动 Physics World sync、contact mapping、interpolation sampling 或 handle lifecycle 时运行 `corepack pnpm bench:physics:check`，用大实体/固定 contact profile 与大量 reusable-target sampling 观察数量级回归和 dispose 后 retained state。
- 把 Physics trace 接入跨模块 timeline 时使用有界 trace store 和增量 entry hook；不要每帧读取并合并完整 trace history。修改该路径时运行 `corepack pnpm bench:diagnostics:check`。

### 模块使用

- 业务代码只依赖 `@gamekit/physics-core`、World component、query API 和低频 contact event，不直接 import Rapier、Matter、Phaser Physics 或 backend body 类型。
- 需要 raycast、overlap、check 或 point query 的业务模块通过 DI 接收 `PhysicsQueries` / `PhysicsHandle`；测试中注入 fake queries，生产组合中注入 Physics module 绑定的 handle。
- Damage、team/faction、hit/hurt rule、projectile owner、pierce、ability activation 等玩法语义应在游戏模块、GAS 或 TCA 中解释；Physics 只回答空间、碰撞和运动事实。
- Collision layer/mask 只表达物理过滤；不要把所有玩法 target rule 都塞进 physics filter。需要命中后解释的规则应放在 gameplay 数据中。
- 整张背景图、tilemap 或模型只负责表现，不能被 gameplay 当成隐式碰撞来源。关卡必须提供显式 `physics.layout`、tile collision layer 或 mesh collider companion；运行时不要逐像素扫描图片生成 collider。模块化静态场景应以 app-owned scene instance 为唯一 transform/footprint 来源，同时派生 RenderObject placement 与 collider，并用内容测试逐实例比较 position、rotation 和 shape；只锁定整张场景 bounds 不能防止物体漂移。
- 高频移动、碰撞和查询留在 physics/world system 内；不要把每帧 contact manifold、position patch 或 query result 全量发到 EventBus、React UI 或 DevTools UI。
- Renderer/camera 可以读取 interpolation store 的 transient sample；碰撞、能力目标、AI、Save 和 multiplayer authority 仍只读取 World / PhysicsScene 权威 transform。
- 物理 prediction 的 input mapping 可以表达期望 velocity/kinematic target 和非物理 state 更新，但不能在游戏层再次调用 backend `step()`、维护 solver cache 或手写碰撞近似。匹配 checkpoint 只表示公开 body 基线一致，用于避免无意义 replay；它不是完整 solver 存档。Backend 未承诺 deterministic 时仍保留 reconciliation；correction 是安全网，不是长期模型差异的替代品。
- Save 只保存可恢复 physics state，不保存 backend cache。Load 后由 Physics module 重建 scene 并恢复 stable body/entity mapping。
- 修改 Physics checkpoint、backend reset 或 restore rebuild 时运行 `corepack pnpm bench:checkpoint:check`；该基准将 restore 与首个 rebuild tick 一起计量。
- 需要后端专属能力时，通过显式 native path 使用具体 adapter 包，并把这段代码限制在 app-specific integration、Editor backend panel 或 DevTools plugin 中。
