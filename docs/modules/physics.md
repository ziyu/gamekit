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
  bindings: PhysicsWorldBindings;
  eventPolicy?: PhysicsEventPolicy;
  save?: PhysicsSaveOptions;
  trace?: PhysicsTraceOptions;
};

export function createPhysicsModule(options: PhysicsModuleOptions): GameModule;
```

Physics module 跟随 GameRuntime lifecycle。`stop()` 后不继续 step；`dispose()` 必须释放 backend scene、订阅、body/collider handle map、query cache 和 trace buffer。

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

这些类型只描述可重建配置，不表达具体玩法业务语义。

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

## DevTools 与 Trace

Physics 必须从一开始提供可解释入口：

- Physics scene snapshot：body/collider count、dimension、backend kind、gravity、fixed step、active/sleeping summary。
- Body / collider detail：entity binding、definition id、shape summary、material、filter、last transform。
- Contact trace：enter/exit、sensor、filter、entity ids、correlation id。
- Query trace：query type、filter、hit count、duration、caller source。
- Performance：step duration、sync duration、created/destroyed body count、query cost。

DevTools Core 不接收 backend native handle。Backend-specific DevTools plugin 可以显式依赖 adapter 包读取更深的 native summary，但必须保持可选。

## Determinism

Physics module 应默认使用 fixed timestep 和稳定 system order，减少不同 frame delta 带来的差异。

长期规则：

- Physics step 使用固定 `fixedDelta`，外部 Host tick delta 只用于 accumulator。
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
- static / dynamic / kinematic 基本语义。
- sensor 与 solid contact enter/exit。
- collision filter。
- point / raycast / shape cast / overlap / check / bounds query。
- query trigger interaction、filter、ignore list、closest/all/any mode 和 result ordering。
- body/collider id 与 entity binding。
- snapshot 不暴露 native handle。
- Save capture/restore 可重建 scene。

Adapter 专属测试再覆盖底层库能力，例如 Rapier WASM 初始化、Phaser Scene 绑定、Matter compound body 等。

## 最佳实践

### 模块集成

- Physics 作为 GameModule 集成，随 GameRuntime tick 推进；不要把 gameplay physics scene 默认注册成 App Host standard service。
- App Host/profile 可以准备 backend factory、driver physics adapter、DataRegistry、SaveManager 和 DevToolsRuntime，但 Physics scene 生命周期跟随 GameRuntime。
- 独立物理库进入 `physics-*` adapter 包；绑定完整外部 scene runtime 的物理能力由对应 Driver 暴露 runtime slice。
- Physics module 的 World sync 顺序必须明确。常见顺序是 input/AI 写意图，physics step 推进，再把 transform/velocity 写回 World，最后 renderer sync。
- 新 backend 先通过 physics conformance tests，再补 backend-specific behavior test。真实 canvas 或 Phaser Scene 只用于少量集成测试。

### 模块使用

- 业务代码只依赖 `@gamekit/physics-core`、World component、query API 和低频 contact event，不直接 import Rapier、Matter、Phaser Physics 或 backend body 类型。
- Damage、team/faction、hit/hurt rule、projectile owner、pierce、ability activation 等玩法语义应在游戏模块、GAS 或 TCA 中解释；Physics 只回答空间、碰撞和运动事实。
- Collision layer/mask 只表达物理过滤；不要把所有玩法 target rule 都塞进 physics filter。需要命中后解释的规则应放在 gameplay 数据中。
- 高频移动、碰撞和查询留在 physics/world system 内；不要把每帧 contact manifold、position patch 或 query result 全量发到 EventBus、React UI 或 DevTools UI。
- Save 只保存可恢复 physics state，不保存 backend cache。Load 后由 Physics module 重建 scene 并恢复 stable body/entity mapping。
- 需要后端专属能力时，通过显式 native path 使用具体 adapter 包，并把这段代码限制在 app-specific integration、Editor backend panel 或 DevTools plugin 中。
