# ADR 0021: Data-driven Physics Layout And Modular Scene Placement

Status: Accepted on 2026-07-13; amended on 2026-07-13 after modular scene validation.

## Context

Physics Core 已有 `physics.body`、`physics.collider`、标准 World components 和 backend-neutral Physics module，但缺少把一份关卡布局数据批量物化为这些组件的通用边界。如果每个游戏在 bootstrap 中硬编码 spawn 循环，会复制 id、引用解析、lifecycle cleanup 和 multi-collider body 处理，并容易把 Renderer、Asset 或具体 Rapier API 引入 gameplay。

Outpost Siege 最初把外墙、路障、掩体和支撑柱烘焙在一张 arena WebP 中，再人工维护一份同坐标空间的碰撞 companion。两份数据即使共享 bounds，仍会在重新生图、裁切或调整关卡时漂移；测试只能确认画布尺寸和少量 query，不能证明每个可见物体与 collider 一致。

## Decision

Physics Core 增加 `physics.layout` DataType 和通用 materialization helper：

- `PhysicsLayoutData` 通过 DataRef 引用 `physics.scene`、`physics.body` 和 `physics.collider` prototype，并保存稳定 body/collider instance id、2D/3D bounds、transform、enabled state 和可选 body/collider overrides。Body override 不重复拥有 position/rotation，避免同一 instance 出现两套 transform。
- `createPhysicsLayoutModule(...)` 在 GameModule install 时读取 DataRegistry，把布局物化为标准 `PhysicsBodyComponent`、`PhysicsColliderComponent` 和 `PhysicsTransformComponent`；dispose 只清理该 layout 创建的 entity。
- 一个 layout body 可以关联多个 collider entity。大量静态墙体和掩体应批到少量 static body，同时保留独立 collider id；动态对象继续使用独立 body。
- Physics layout 不引用 texture/native asset handle，不扫描像素，不依赖 Renderer、Phaser、Rapier 或 Koota。具体游戏只提供 layout 数据和 archetype 引用。

对于由独立静态物体组成的 2D 场景，应用必须建立单一 scene placement source：

- 大背景只包含无碰撞地面、标线和嵌入式装饰；有碰撞的墙段、路障、掩体和立柱使用紧边界透明资源独立渲染。
- App-owned arena/level DataType 为每个静态物体保存一个稳定 id、RenderObject DataRef、collider DataRef 和唯一的 position / rotation / size。Presentation 与 Physics companion 都从这条实例数据派生，不能各自维护 transform。
- 视觉尺寸与 box footprint 一致时，两者直接复用同一个 size。需要复杂轮廓时，可以由同一实例显式派生多个 collider 或 polygon，但不能回到独立手调的第二套位置数据。
- 内容测试逐实例比较 RenderObject transform/size 与生成的 collider offset/shape；仅比较 arena bounds 或 collider 数量不足以证明对齐。
- Headless authority 读取相同 app scene data 与生成后的 `physics.layout`，但不加载纹理。AssetManager 仍只负责资源声明和加载，不解释 collision。

复杂 tilemap importer、Editor authoring、mesh cooking 和 nav data 可以生成同一 `physics.layout`，也可以直接从各自的单一 scene authoring source 生成 render/physics companion；这不改变运行时 ownership。

## Consequences

Positive consequences：

- 每个可见静态物体与 collider 共享同一 transform 和 footprint，重新摆放时不会产生视觉/物理坐标分叉。
- Headless authority 无需加载图片即可从相同 scene placement 重建碰撞世界。
- 游戏不再复制 layout spawn/cleanup 逻辑，也不直接依赖物理 backend。
- 静态 compound layout 减少 body 数量，同时 collider 仍可独立 query、trace 和映射到 entity。
- 独立物体复用少量纹理；重复实例只增加 RenderObject/collider，不重复加载资源。
- DataRegistry 能校验 scene、render、asset、body 和 collider 引用并定位 source path。

Costs and constraints：

- 美术必须把有碰撞的结构拆成透明、紧边界、方向明确的模块资源；整张概念图不能直接作为最终可碰撞场景。
- 简单 box/polygon 近似仍需要 authoring，但 authoring 结果归属于对象实例而不是背景图。
- 每个 collider 仍会进入 backend broadphase，每个 RenderObject 仍有实例成本；对象数量、启动 render plan、物理 tick 和纹理总字节必须进入代表性 benchmark。
- Layout materialization entity 属于 Physics GameModule lifecycle，不是 AssetManager、Renderer 或 App Host service lifecycle。

## Rejected Alternatives

### Bake collision-bearing objects into one arena image and hand-maintain a companion

Rejected because共享画布 bounds 不能保证逐物体一致。重新生成、裁切或移动画面物体后，人工矩形会静默漂移；运行时也无法可靠识别哪些像素是实体。

### Treat the arena image as collision geometry

Rejected because图片像素没有稳定 gameplay 语义，压缩、缩放、色彩和重新生图都会改变推导结果，headless server 也不应加载视觉纹理。

### Hard-code Outpost colliders in its bootstrap module

Rejected because它复制通用 DataRef materialization 和 cleanup，并让未来游戏再次实现同一套 layout glue。

### Create one static body per obstacle

Rejected as the default because大量不移动结构可以共享 static body；独立 collider id 已足够支持 contact/query/diagnostics。独立 body 仍可用于会移动、破坏或单独保存的结构。

### Put collision parsing in AssetManager or Phaser presentation

Rejected becauseAsset 只负责资源加载状态，Renderer/Driver 只负责表现 runtime；权威 Physics 必须在 headless 和 Browser profile 中使用同一 gameplay data。
