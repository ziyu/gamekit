# Navigation Core 模块设计

## 定位

Navigation Core 是路径与可通行空间的 facade / Game Module toolkit。它向 AI、玩家辅助移动、Editor 和关卡验证提供稳定 path/route query，不属于 Physics 或 Renderer。

相关包：

- `@gamekit/navigation-core`
- 可选 adapter：`@gamekit/navigation-graph`、`@gamekit/navigation-grid`、`@gamekit/navigation-navmesh`

成熟 graph/grid/navmesh/search library 通过 adapter 接入；Core 不自研完整 navmesh 烘焙器或几何引擎。

## 核心职责

- navigation world lifecycle 与 stable revision。
- point projection、path request、route/flow sampling。
- agent profile、area、cost、portal、dynamic obstacle/blocker。
- request queue、route cache、失效与预算。
- trace、snapshot、conformance 和 headless fixture。

非职责：

- Physics 碰撞、刚体移动、RVO solver 或伤害。
- AI 目标选择、攻击槽、encounter spawn 或 gameplay team。
- Renderer debug mesh；DevTools 可以消费稳定 snapshot 自行表现。

## Data Model

```ts
export type NavigationAgentProfile = {
  id: string;
  radius: number;
  height?: number;
  maxSlope?: number;
  allowedAreas?: string[];
  costOverrides?: Record<string, number>;
};

export type NavigationLayoutDefinition = {
  id: string;
  backend: string;
  source: DataRef | AssetRef;
  areas?: NavigationAreaDefinition[];
  portals?: NavigationPortalDefinition[];
};
```

App-owned arena placement 可以同时派生 Physics collider、RenderObject placement 与 navigation blocker/portal，但三种运行时仍由各自模块拥有。Navigation 不从背景像素或 native Physics handle 反推长期布局。

## Query API

```ts
export type NavigationQueries = {
  projectPoint(point: NavigationPoint, profileId: string): NavigationProjection | undefined;
  requestPath(request: NavigationPathRequest): NavigationRequestId;
  poll(requestId: NavigationRequestId): NavigationPathResult;
  cancel(requestId: NavigationRequestId): void;
  sampleRoute(routeId: string, point: NavigationPoint): NavigationRouteSample;
  revision(): number;
  snapshot(): NavigationSnapshot;
};
```

Path result 包含 stable points/corridor、cost、revision 和 status，不暴露第三方 node、polygon 或 heap object。同步小图 adapter 可以立即完成，但调用方始终使用同一 request lifecycle。

## 大群体路线

当大量 agent 前往少量目标时，adapter 可以提供 goal-keyed route field / reverse shortest-path cache。Agent 从当前位置采样下一 corridor/direction，不为每个敌人重复求解完整路径。

动态障碍改变 navigation revision：

- blocker 只影响关联 area/edge/tile，不能每次都清空全部 cache。
- active route 在 revision 不兼容或即将进入 blocked segment 时重新请求。
- placement validation 可以预查询“是否仍保留入口到核心的合法路线”。
- 失败结果使用短 TTL negative cache，避免大量 agent 同 tick 重试同一不可达目标。

## Steering 与 Physics

Navigation 输出 preferred direction/corridor。局部避障和最终移动仍由 steering + Physics 执行：

```txt
path/route sample
  -> preferred velocity
  -> separation / obstacle anticipation
  -> gameplay movement constraints
  -> Physics kinematic/dynamic command
  -> stuck/progress feedback
```

Core 可以定义 `NavigationProgress` 与 `SteeringIntent` envelope，但不把 PhysicsScene 或第三方 vehicle/entity 放进公共 API。Crowd/RVO 是可选 adapter capability，不能成为所有 backend 的强制实现。

## Authoring 与验证

Navigation layout 必须支持内容检查：

- spawn/goal 投影成功。
- 必需入口到核心存在路径。
- agent 半径和走廊宽度兼容。
- 动态建造插槽不会让所有路线同时不可达。
- portal/edge id、area、cost 和 reference 有效。
- Physics static collider 与 navigation blocker 的来源 instance 一致。

这些检查发生在内容构建或测试，不在每局启动时重新执行昂贵几何分析。

## 性能与生命周期

- Path request queue 有总量、每 requester 和每 tick budget。
- Cache 以 layout revision、profile、start region、goal key 为索引，并有容量/TTL。
- Adapter 复用 open set、node record 和输出 buffer；热路径避免深拷贝完整 graph。
- Snapshot 只给区域、revision、queue/cache 数量和采样 path，不展开全部 backend 数据。
- benchmark 覆盖 250/1,000 agent route sampling、动态 blocker invalidation、path burst、cancel 和 dispose retained state。

## 最佳实践

### 模块集成

- 组合层选择 adapter、加载 navigation layout、创建一个具名 NavigationHandle，并把它注入 AI/placement/Editor module。
- Backend adapter 先通过 projection/path/cancel/revision/cache conformance，再补 navmesh/grid/graph 专属测试。
- 外部 navigation runtime 的 native object 只存在于 adapter；Core snapshot 和 Save 使用稳定 id/point/revision。

### 模块使用

- AI 使用 NavigationQueries 获取路线，不直接 import pathfinding library。
- Physics contact 不能替代 path planning，Navigation route 也不能替代最终碰撞验证。
- 建造改变 blocker 时只提交语义化 obstacle update；游戏不直接修改 adapter graph/native navmesh。
- 无路径必须成为显式结果与 trace，调用方使用退避/重选目标，不能每 tick 无限重试。
