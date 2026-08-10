# Outpost Siege 游戏流程

## 单局状态机

```txt
title
  -> lobby
  -> loading
  -> deployment
  -> wave-1
  -> intermission-1
  -> wave-2
  -> intermission-2
  -> boss-wave
  -> extraction
  -> results
  -> lobby/rematch/leave
```

Match Flow 是 app-local authority module。它维护稳定 phase、phase instance id、startedAt、deadline、objective set 与 transition reason，并把 player-visible projection 复制到客户端。React 页面不能自行推进阶段，TCA 只消费阶段事实和执行低频条件，不成为每 tick phase clock。

## 阶段规则

| 阶段           | 目标时长   | 玩家行为                                  | Authority 离开条件                               |
| -------------- | ---------- | ----------------------------------------- | ------------------------------------------------ |
| Lobby          | 15–60 秒   | 加入、选择模块/部署物、准备、查看队伍缺口 | 全员准备，或 leader 在最低人数/准备规则下开始    |
| Loading        | 依资源而定 | 查看加载进度、失败原因与重试              | 所有 required content 与 authority runtime ready |
| Deployment     | 10 秒      | 识别核心、入口、插槽，试用移动/瞄准       | deadline 到达                                    |
| Wave 1         | 90–150 秒  | 学习射击、冲刺、路线与核心防守            | spawn plan 完成且无有效剩余威胁                  |
| Intermission 1 | 25 秒      | 修复、补给、部署、迁移设施                | 全员提前 ready 或 deadline 到达                  |
| Wave 2         | 150–210 秒 | 分路、救援、保护供能节点、处理精英        | 遭遇完成并结算支线目标                           |
| Intermission 2 | 30 秒      | 修复、重建、完成小队协议投票              | 投票决议完成且全员 ready，或 deadline 到达       |
| Boss Wave      | 180–270 秒 | 处理三阶段首领与有限增援                  | Overseer 死亡                                    |
| Extraction     | 45–60 秒   | 拾取密钥、启动信标、守住撤离区            | 信标完成、核心摧毁或小队全员失能                 |
| Results        | 不限       | 查看胜负因果、贡献、重赛/离开             | 明确用户选择或房间 lifecycle 结束                |

阶段 deadline 使用 authority clock。客户端可以平滑显示倒计时，但不能用本地 timer 决定 spawn、投票或胜负。

## Lobby 与 Loadout

每名玩家选择：

- 战术模块：Shock Field、Barrier Pulse 或 Repair Drone。
- 部署物偏好：Auto Turret、Shock Pylon 或 Barricade。选择不限制玩家在局内使用团队已经解锁的其他设施，但影响默认快捷入口。
- 显示名、输入设备和可访问性设置。

重复模块允许。Lobby 对缺少控制、保护、修复或单体输出只做建议，不强制职业锁。准备状态是明确 action；断线、选择变化或 content compatibility 失败会撤销该玩家 ready。

Leader 可以在至少一名有效玩家 ready 时开始单人/测试局；正式多人房间要求所有在线成员 ready。倒计时最后 3 秒内成员变化会取消开始，防止玩家在未加载内容时被带入战场。

## Loading 与部署

Loading 必须区分：

- 正在加载 required group。
- 可重试资源失败。
- content/version 不兼容。
- authority 创建失败或连接丢失。
- 已加载但等待其他成员。

Deployment 阶段玩家已经进入同一个 authority runtime，但不能造成伤害或消费 Supply。场景依次点亮核心、活动入口和初始 Hardpoint；操作提示根据实际输入来源显示，并在玩家完成移动、瞄准、射击试用后收起。未完成提示不阻塞 wave 开始。

## 波次与整备

波次不是固定秒表结束。Director 维护 spawn plan、alive threat、pending spawn、objective 和 fail-safe：

- Spawn plan 完成且所有有效威胁被处理后进入结算。
- 正在死亡/退出/传送的 entity 具有明确 lifecycle，不能让 alive count 永久大于零。
- Agent 因导航异常长期无进展时，先重寻路，再执行有记录的 recovery/despawn；不能静默卡住流程。
- 掉落、资源和 objective reward 在 transition 前结算一次，使用 phase instance id 防止重复。

整备阶段停止新增敌人，但不会把残留 projectile、status 或危险区无限保留。进入整备时执行明确 cleanup policy：瞬时敌对 projectile 销毁，持续环境效果按定义结束或转为无害表现，玩家 ability cooldown 继续推进。

玩家可以提前 ready。所有在线且非失能成员 ready 后，阶段只缩短到最小 3 秒预告，不瞬间生成敌人。

## 局内强化

Intermission 2 从符合队伍状态的候选池选择三项 Squad Protocol。候选与效果见 `level-encounters-and-economy.md`，投票规则为：

- 投票持续 12 秒，每名在线 active player 一票，可在截止前修改。
- 多数票立即锁定；平票由 leader 在剩余时间内决定。
- Leader 未决或断线时，按 `vote count → candidate priority → deterministic seed` 选择。
- 新加入 spectator 没有本轮投票权；重连玩家恢复原投票。

协议只在本局生效。强化选择写入 authority checkpoint 与 results，但不形成账号永久成长。

## 胜利与失败

胜利需要同时满足：

1. Overseer 被击败。
2. 控制密钥已提交到撤离信标。
3. 信标完成，且至少一名有效玩家完成撤离。
4. 完成前核心耐久大于 0，小队未全员失能。

失败只有两个顶层原因：

- `core-destroyed`：核心耐久降至 0。
- `squad-incapacitated`：所有当前有效玩家同时失能。

具体失败因果作为子原因记录，例如未处理 Saboteur、Brute 重击、无人救援、资源耗尽或撤离区失守。Disconnect 本身不直接判负；保留席位不计入“仍可行动玩家”。

## 结算

Results 不使用个人击杀排名作为主要价值判断，展示：

- 胜利/失败及最后因果链。
- 每波完成时间、核心剩余、供能节点结果。
- 已撤离、倒地获救、失能未撤离成员。
- 伤害、控制、救援、修复、设施输出与资源贡献。
- Supply 获得、消费、退款与浪费。
- 关键时刻：首领阶段、核心低血量、连续救援和撤离完成。

结果数据是 authority stable summary，不从客户端 cue、动画次数或 UI 本地计数推导。

## 重赛

重赛创建新的 match instance 与 seed，复用同一 room/party membership。它必须清理旧 World entity、Physics scene state、GAS actor/effect、TCA once state、AI memory/path、Combat projectile、animation binding、cue watermark、input epoch 和 results vote。

玩家 loadout 可以保留，局内 Supply、强化、设施和 checkpoint 不能带入新局。
