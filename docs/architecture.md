# 架构设计

## 核心方向

GameKit 采用“薄内核 + 成熟库 + 自定义协议 + Adapter”的架构。

核心包负责稳定协议：

- `@gamekit/core`：错误、结果、Registry、GameModule、RNG、Clock。
- `@gamekit/world`：ECS facade，只暴露 GameKit 自己的组件和世界接口。
- `@gamekit/world-koota`：Koota adapter，第三方 ECS 只存在于该包内部。
- `@gamekit/event-bus`：低频 gameplay/runtime event。
- `@gamekit/game-runtime`：模块安装、系统调度、生命周期。

应用包负责验证真实使用方式：

- `apps/sandbox`：第一条 runtime 垂直切片，不承载长期玩法代码。

## 依赖方向

依赖只能从具体层指向抽象层：

```txt
apps/* → packages/*
adapter packages → facade packages
game-runtime → core / world / event-bus
world-koota → world / core / koota
world → 无第三方 ECS 依赖
```

禁止方向：

- `@gamekit/world` 依赖 Koota、bitecs 或任意具体 ECS。
- 业务模块直接导入 Koota、Phaser、GSAP 等第三方库。
- Runtime 包直接依赖具体游戏 app。

## 包内拆分约定

每个包的 `src/index.ts` 只作为公共出口，不承载主要实现。

推荐结构：

```txt
src/
  index.ts
  runtime/
  adapter/
  components/
  modules/
  types.ts
```

只有小型纯类型包可以保持更扁平，但仍应让实现文件有明确职责。
